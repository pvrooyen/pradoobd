/**
 * Core OBD-II domain model: service modes, PID definitions, and the standard
 * (SAE J1979) Mode 01 PID table.
 *
 * Decoders are intentionally NOT defined here — `shared` stays free of runtime
 * logic so it can be imported by both browser and server. The server's
 * `decoders` module maps these PID ids to functions. Here we only describe
 * *what* a PID is (id, name, unit, byte length, suggested min/max for gauges).
 */

/** OBD-II diagnostic service modes (a.k.a. services). */
export enum ObdMode {
  /** Mode 01 — current live data. */
  CurrentData = 0x01,
  /** Mode 02 — freeze-frame data (snapshot when a DTC was stored). */
  FreezeFrame = 0x02,
  /** Mode 03 — stored (confirmed) diagnostic trouble codes. */
  StoredDtc = 0x03,
  /** Mode 04 — clear DTCs and reset emissions-related data. */
  ClearDtc = 0x04,
  /** Mode 07 — pending DTCs (current/last drive cycle). */
  PendingDtc = 0x07,
  /** Mode 09 — vehicle information (VIN, calibration ids, etc.). */
  VehicleInfo = 0x09,
  /**
   * Mode 22 — manufacturer-specific "Read Data By Identifier" (UDS service 0x22).
   * This is where Toyota enhanced data lives (boost, rail pressure, EGR, DPF,
   * injector correction...). The genuinely advanced part of this project.
   */
  ReadDataByIdentifier = 0x22,
}

/**
 * How a raw byte payload is turned into an engineering value. The actual
 * function lives server-side; this is the contract the decoder must satisfy.
 */
export interface PidDecodeResult {
  /** Numeric value in the unit declared by the PID, or null if not decodable. */
  value: number | null;
  /** Optional human string (e.g. for bitfield/enum PIDs like fuel system status). */
  text?: string;
  /** The raw data bytes (after the mode+pid echo is stripped), hex string. */
  rawHex: string;
}

/** A single OBD parameter we know how to request and (usually) decode. */
export interface PidDefinition {
  /**
   * Stable identifier used across the wire and UI.
   * Standard PIDs: `"01:0C"` (mode:pid hex). Mode 22: `"22:1234"`.
   */
  id: string;
  /** OBD mode this PID belongs to. */
  mode: ObdMode;
  /** PID number within the mode (e.g. 0x0C for engine RPM). */
  pid: number;
  /** Short machine-ish name, e.g. "engine_rpm". */
  key: string;
  /** Human label for the UI, e.g. "Engine RPM". */
  name: string;
  /** Engineering unit, e.g. "rpm", "°C", "kPa". Empty for unitless/text PIDs. */
  unit: string;
  /** Expected number of data bytes in the response (after mode+pid echo). */
  bytes: number;
  /** Suggested gauge minimum (display hint only). */
  min?: number;
  /** Suggested gauge maximum (display hint only). */
  max?: number;
  /**
   * For standard PIDs, whether this is part of the "support bitmask" set
   * (0x00, 0x20, 0x40...) used purely to advertise capability.
   */
  isSupportBitmask?: boolean;
  /**
   * Free-form note — especially useful for Toyota enhanced PIDs where the
   * meaning/scaling is provisional until confirmed against the real ECU.
   */
  note?: string;
  /** Provenance of the scaling: confirmed on this vehicle, or assumed. */
  confidence?: 'confirmed' | 'assumed' | 'unknown';
}

/** Build a standard (mode 01/09 etc.) PID id string like "01:0C". */
export function pidId(mode: ObdMode, pid: number): string {
  const m = mode.toString(16).toUpperCase().padStart(2, '0');
  const p = pid.toString(16).toUpperCase().padStart(mode === ObdMode.ReadDataByIdentifier ? 4 : 2, '0');
  return `${m}:${p}`;
}

/**
 * Standard SAE J1979 Mode 01 PIDs.
 *
 * NOTE for the 2005 1KD-FTV Prado: many of these may return "NO DATA". That is
 * expected and informative — the discovery scan records which ones the ECU
 * actually answers. We include the common diesel-relevant ones plus the
 * support-bitmask PIDs (0x00/0x20/0x40/0x60) needed to query capability.
 */
export const STANDARD_PIDS: PidDefinition[] = [
  // --- Support bitmasks (capability discovery) ---
  bitmask(0x00, 'pids_01_20', 'Supported PIDs [01-20]'),
  bitmask(0x20, 'pids_21_40', 'Supported PIDs [21-40]'),
  bitmask(0x40, 'pids_41_60', 'Supported PIDs [41-60]'),
  bitmask(0x60, 'pids_61_80', 'Supported PIDs [61-80]'),

  // --- Common live-data PIDs (diesel-relevant ones flagged in notes) ---
  std(0x01, 'monitor_status', 'Monitor status since DTCs cleared', '', 4),
  std(0x04, 'engine_load', 'Calculated engine load', '%', 1, 0, 100),
  std(0x05, 'coolant_temp', 'Engine coolant temperature', '°C', 1, -40, 215),
  std(0x06, 'short_fuel_trim_1', 'Short term fuel trim (B1)', '%', 1, -100, 99),
  std(0x07, 'long_fuel_trim_1', 'Long term fuel trim (B1)', '%', 1, -100, 99),
  std(0x0a, 'fuel_pressure', 'Fuel pressure (gauge)', 'kPa', 1, 0, 765),
  std(0x0b, 'intake_map', 'Intake manifold absolute pressure', 'kPa', 1, 0, 255, 'Diesel boost-ish via MAP'),
  std(0x0c, 'engine_rpm', 'Engine RPM', 'rpm', 2, 0, 5000),
  std(0x0d, 'vehicle_speed', 'Vehicle speed', 'km/h', 1, 0, 200),
  std(0x0e, 'timing_advance', 'Timing advance', '°', 1, -64, 63),
  std(0x0f, 'intake_air_temp', 'Intake air temperature', '°C', 1, -40, 215),
  std(0x10, 'maf_rate', 'MAF air flow rate', 'g/s', 2, 0, 655),
  std(0x11, 'throttle_pos', 'Throttle / pedal position', '%', 1, 0, 100),
  std(0x1f, 'run_time', 'Run time since engine start', 's', 2, 0, 65535),
  std(0x21, 'distance_mil', 'Distance with MIL on', 'km', 2, 0, 65535),
  std(0x22, 'fuel_rail_pressure_vac', 'Fuel rail pressure (rel. to vacuum)', 'kPa', 2, 0, 5178, 'Common-rail diesel — high value'),
  std(0x23, 'fuel_rail_pressure_direct', 'Fuel rail pressure (direct/high)', 'kPa', 2, 0, 655350, 'Common-rail diesel rail pressure'),
  std(0x2c, 'egr_commanded', 'Commanded EGR', '%', 1, 0, 100),
  std(0x2d, 'egr_error', 'EGR error', '%', 1, -100, 99),
  std(0x31, 'distance_since_clear', 'Distance since codes cleared', 'km', 2, 0, 65535),
  std(0x33, 'baro_pressure', 'Absolute barometric pressure', 'kPa', 1, 0, 255),
  std(0x42, 'control_module_voltage', 'Control module voltage', 'V', 2, 0, 65),
  std(0x46, 'ambient_air_temp', 'Ambient air temperature', '°C', 1, -40, 215),
  std(0x5c, 'engine_oil_temp', 'Engine oil temperature', '°C', 1, -40, 210),
  std(0x5e, 'engine_fuel_rate', 'Engine fuel rate', 'L/h', 2, 0, 3212),
];

function std(
  pid: number,
  key: string,
  name: string,
  unit: string,
  bytes: number,
  min?: number,
  max?: number,
  note?: string,
): PidDefinition {
  return {
    id: pidId(ObdMode.CurrentData, pid),
    mode: ObdMode.CurrentData,
    pid,
    key,
    name,
    unit,
    bytes,
    min,
    max,
    note,
    confidence: 'assumed',
  };
}

function bitmask(pid: number, key: string, name: string): PidDefinition {
  return {
    id: pidId(ObdMode.CurrentData, pid),
    mode: ObdMode.CurrentData,
    pid,
    key,
    name,
    unit: '',
    bytes: 4,
    isSupportBitmask: true,
    confidence: 'confirmed',
  };
}

/** Look up a standard PID definition by its mode-01 pid number. */
export function findStandardPid(pid: number): PidDefinition | undefined {
  return STANDARD_PIDS.find((p) => p.pid === pid && p.mode === ObdMode.CurrentData);
}
