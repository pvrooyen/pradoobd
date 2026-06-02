/**
 * Toyota / 1KD-FTV enhanced PID seed list (OBD Mode 22 — ReadDataByIdentifier).
 *
 * ⚠️ IMPORTANT — READ THIS BEFORE TRUSTING ANY VALUE HERE ⚠️
 *
 * Unlike the SAE-standard Mode 01 PIDs, manufacturer Mode 22 PIDs are NOT
 * publicly standardized. Toyota's exact PID numbers and scaling for the 2005
 * 1KD-FTV are not officially published. The entries below are *candidates* and
 * *provisional scalings* gathered from community reverse-engineering of similar
 * Toyota D-4D ECUs. They are a STARTING POINT for the in-car prober, not ground
 * truth.
 *
 * The workflow this project is built around:
 *   1. The "Mode 22 prober" sweeps a range of identifiers and records which
 *      ones the ECU answers (positive 0x62 response) vs. rejects (0x7F).
 *   2. For answered PIDs, you watch the raw bytes change while you manipulate
 *      the engine (rev it, let it warm up, drive) and confirm/derive the
 *      scaling empirically.
 *   3. Confirmed PIDs get `confidence: 'confirmed'` and a real decoder.
 *
 * So: treat `confidence: 'assumed' | 'unknown'` here as "probe and verify".
 */

import { ObdMode, type PidDefinition, pidId } from './obd.js';

function toy(
  pid: number,
  key: string,
  name: string,
  unit: string,
  bytes: number,
  opts: {
    min?: number;
    max?: number;
    note?: string;
    confidence?: PidDefinition['confidence'];
  } = {},
): PidDefinition {
  return {
    id: pidId(ObdMode.ReadDataByIdentifier, pid),
    mode: ObdMode.ReadDataByIdentifier,
    pid,
    key,
    name,
    unit,
    bytes,
    min: opts.min,
    max: opts.max,
    note: opts.note,
    confidence: opts.confidence ?? 'unknown',
  };
}

/**
 * Candidate enhanced PIDs to seed the prober UI. The prober can also brute-scan
 * a numeric range; this list just gives named starting points worth checking
 * first on a 1KD-FTV.
 */
export const TOYOTA_ENHANCED_PIDS: PidDefinition[] = [
  toy(0x0115, 'coolant_temp_enh', 'Coolant temp (enhanced)', '°C', 1, {
    min: -40,
    max: 215,
    note: 'Often mirrors standard 05 but via mfr table; verify offset.',
    confidence: 'assumed',
  }),
  toy(0x0118, 'rail_pressure_target', 'Common-rail pressure (target)', 'MPa', 2, {
    min: 0,
    max: 180,
    note: 'Common-rail target pressure. Scaling provisional — verify against idle (~30MPa).',
  }),
  toy(0x0119, 'rail_pressure_actual', 'Common-rail pressure (actual)', 'MPa', 2, {
    min: 0,
    max: 180,
    note: 'Actual measured rail pressure. Compare to target while revving.',
  }),
  toy(0x011a, 'boost_pressure', 'Turbo boost pressure', 'kPa', 2, {
    min: 0,
    max: 300,
    note: 'Absolute or gauge? Verify at idle vs. baro.',
  }),
  toy(0x011b, 'boost_target', 'Turbo boost target', 'kPa', 2, {
    min: 0,
    max: 300,
  }),
  toy(0x0121, 'maf_enh', 'Mass air flow (enhanced)', 'g/s', 2, {
    min: 0,
    max: 800,
    note: 'Diesel MAF used for EGR/smoke control.',
  }),
  toy(0x0122, 'egr_position', 'EGR valve position', '%', 1, { min: 0, max: 100 }),
  toy(0x0123, 'egr_target', 'EGR valve target', '%', 1, { min: 0, max: 100 }),
  toy(0x0130, 'injection_volume', 'Commanded injection quantity', 'mm³/st', 2, {
    min: 0,
    max: 80,
    note: 'Fuel injection quantity per stroke.',
  }),
  toy(0x0131, 'injection_timing', 'Main injection timing', '°', 2, {
    min: -30,
    max: 30,
  }),
  toy(0x0140, 'turbo_vane_position', 'Turbo VN vane position', '%', 1, {
    min: 0,
    max: 100,
    note: '1KD-FTV has a variable-nozzle turbo (VNT).',
  }),
  toy(0x0150, 'glow_plug_status', 'Glow plug relay status', '', 1, {
    note: 'Bitfield — decode empirically.',
  }),
  toy(0x0160, 'injector_correction_1', 'Injector correction cyl 1', 'mm³', 2, {
    min: -10,
    max: 10,
    note: 'Per-cylinder fuel correction (balance/contribution). Buy-back diagnosis.',
  }),
  toy(0x0161, 'injector_correction_2', 'Injector correction cyl 2', 'mm³', 2, { min: -10, max: 10 }),
  toy(0x0162, 'injector_correction_3', 'Injector correction cyl 3', 'mm³', 2, { min: -10, max: 10 }),
  toy(0x0163, 'injector_correction_4', 'Injector correction cyl 4', 'mm³', 2, { min: -10, max: 10 }),
];

/**
 * Default numeric range for the brute-scan prober (inclusive). Kept modest so a
 * full sweep is quick; the UI lets you widen it. 0x0100–0x01FF covers the
 * cluster where the named candidates above live.
 */
export const TOYOTA_PROBE_RANGE = { start: 0x0100, end: 0x01ff } as const;
