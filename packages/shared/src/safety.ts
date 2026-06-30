/**
 * Command safety classification — the single source of truth for "does this
 * command WRITE to the car?".
 *
 * Used by the read-only guard (server/src/transport/ReadOnlyGuard.ts) to reject
 * anything that could change vehicle state before it ever reaches the wire, and
 * available to the UI so it can disable write affordances.
 *
 * WHY THIS EXISTS
 * ---------------
 * The whole point of the Chromebook "safe read" step (and a sane default
 * everywhere we're just diagnosing) is that NOTHING we send can alter the car:
 * no cleared codes, no forced actuators, no active tests, no ECU resets, no
 * reflash. Every command funnels through Transport.send(), so classifying the
 * command string here and refusing the write ones there gives defense-in-depth:
 * a fat-fingered terminal entry, a stray bridge call, or future code all hit the
 * same gate.
 *
 * SCOPE / LIMITS
 * --------------
 * This classifies ELM327-style ASCII commands: `AT…` adapter commands and
 * OBD/UDS request hex (the service byte is the first hex byte). It is a
 * conservative DENY-LIST keyed on the service/mode byte. ELM327 talks OBD modes
 * 01–0A and (via 22/2F/31/2E/…) UDS services; both share the convention that the
 * first byte is the service. AT commands configure the ADAPTER, not the car, so
 * they are always read-safe here (they cannot change vehicle state).
 *
 * If a command can't be confidently classified as a known read, we treat it as a
 * write and refuse it (fail-safe). Better to reject an exotic-but-harmless line
 * than to let an unknown write through in read-only mode.
 */

/** A normalized view of a command for classification. */
export interface CommandClass {
  /** True if this command writes to / changes the state of the vehicle. */
  isVehicleWrite: boolean;
  /** Service/mode byte if this is an OBD/UDS hex request, else undefined. */
  service?: number;
  /** Human reason, used for the rejection message / logs. */
  reason: string;
}

/**
 * OBD/UDS service (mode) bytes that WRITE to or change the state of the vehicle.
 * Keyed by the first hex byte of the request. Names are for the rejection
 * message so the user understands what was blocked.
 */
const WRITE_SERVICES: Record<number, string> = {
  0x04: 'Clear DTCs / reset emissions data (OBD Mode 04)',
  0x11: 'ECU Reset (UDS 0x11)',
  0x14: 'Clear Diagnostic Information (UDS 0x14)',
  0x27: 'Security Access — unlocks writes (UDS 0x27)',
  0x28: 'Communication Control (UDS 0x28)',
  0x2e: 'Write Data By Identifier (UDS 0x2E)',
  0x2f: 'Input/Output Control — force actuators (UDS 0x2F)',
  0x31: 'Routine Control — ACTIVE TESTS (UDS 0x31)',
  0x34: 'Request Download — reflash (UDS 0x34)',
  0x35: 'Request Upload — reflash (UDS 0x35)',
  0x36: 'Transfer Data — reflash (UDS 0x36)',
  0x37: 'Request Transfer Exit — reflash (UDS 0x37)',
  0x38: 'Request File Transfer (UDS 0x38)',
  0x3b: 'Write Data By Identifier (legacy KWP 0x3B)',
  0x3d: 'Write Memory By Address (UDS 0x3D)',
  0x85: 'Control DTC Setting (UDS 0x85)',
};

/**
 * OBD/UDS service bytes that only READ. Anything not in this set AND not in the
 * write set is treated as a write (fail-safe).
 */
const READ_SERVICES = new Set<number>([
  0x01, // current data
  0x02, // freeze-frame data
  0x03, // stored DTCs
  0x06, // on-board monitoring test results (read)
  0x07, // pending DTCs
  0x08, // some request-control monitors — but actuator-capable; see note below
  0x09, // vehicle info (VIN, cal ids)
  0x0a, // permanent DTCs
  0x22, // Read Data By Identifier (Toyota enhanced) — READ
  0x19, // UDS Read DTC Information — READ
  0x1a, // KWP read ECU id — READ
  0x21, // KWP Read Data By Local Identifier — READ
  0x23, // Read Memory By Address — READ
  0x3e, // Tester Present — keep-alive, no state change
]);

// Mode 08 is "Request Control of On-Board System" and CAN actuate things on some
// vehicles. We deliberately do NOT include it as read-safe by default; remove it
// from READ_SERVICES above. (Listed in the set above only as documentation of the
// mode; see the explicit deletion below to keep it OUT.)
READ_SERVICES.delete(0x08);

/**
 * Classify a single command line for read-only safety.
 *
 * @param raw the exact command string that would be sent to the adapter.
 */
export function classifyCommand(raw: string): CommandClass {
  const cmd = raw.trim();
  if (cmd.length === 0) {
    return { isVehicleWrite: false, reason: 'empty command' };
  }

  // AT… commands configure the ELM327 adapter, not the car. They cannot change
  // vehicle state, so they are always allowed (even ATZ/ATSP/ATFI/ATSI etc.).
  if (/^at/i.test(cmd)) {
    return { isVehicleWrite: false, reason: 'adapter (AT) command' };
  }
  // ST… are STN-chip (OBDLink/SerialTransport) adapter commands — also adapter
  // config, not vehicle writes.
  if (/^st/i.test(cmd)) {
    return { isVehicleWrite: false, reason: 'adapter (ST) command' };
  }

  // Otherwise interpret as OBD/UDS hex: first hex byte = service/mode.
  const hex = cmd.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length < 2) {
    // Not AT, not parseable hex — unknown. Fail safe: treat as a write.
    return {
      isVehicleWrite: true,
      reason: `unrecognized command "${cmd}" — refused in read-only mode (fail-safe)`,
    };
  }
  const service = parseInt(hex.slice(0, 2), 16);

  if (service in WRITE_SERVICES) {
    return {
      isVehicleWrite: true,
      service,
      reason: WRITE_SERVICES[service]!,
    };
  }
  if (READ_SERVICES.has(service)) {
    return {
      isVehicleWrite: false,
      service,
      reason: `read service 0x${service.toString(16).padStart(2, '0')}`,
    };
  }
  // Unknown service byte — fail safe.
  return {
    isVehicleWrite: true,
    service,
    reason: `unknown service 0x${service.toString(16).padStart(2, '0')} — refused in read-only mode (fail-safe)`,
  };
}

/** Convenience: true iff the command would write to the vehicle. */
export function isVehicleWrite(raw: string): boolean {
  return classifyCommand(raw).isVehicleWrite;
}
