/**
 * Standard SAE J1979 Mode 01 PID decoders.
 *
 * Each decoder takes the data bytes (mode+pid echo already stripped) and returns
 * an engineering value. Formulas are the published J1979 scalings. Keyed by the
 * mode-01 pid number so the protocol layer can look one up after a response.
 */

import type { PidDecodeResult } from '@pradoobd/shared';

export type Decoder = (bytes: number[]) => PidDecodeResult;

const A = 0, B = 1;

function r(value: number | null, bytes: number[], text?: string): PidDecodeResult {
  return {
    value,
    text,
    rawHex: bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
  };
}

/** Map of mode-01 pid number -> decoder. */
export const STANDARD_DECODERS: Record<number, Decoder> = {
  // Engine load: A * 100 / 255 (%)
  0x04: (b) => r(b[A] != null ? (b[A] * 100) / 255 : null, b),
  // Coolant temp: A - 40 (°C)
  0x05: (b) => r(b[A] != null ? b[A] - 40 : null, b),
  // Short fuel trim: (A - 128) * 100/128 (%)
  0x06: (b) => r(b[A] != null ? (b[A] - 128) * (100 / 128) : null, b),
  0x07: (b) => r(b[A] != null ? (b[A] - 128) * (100 / 128) : null, b),
  // Fuel pressure (gauge): A * 3 (kPa)
  0x0a: (b) => r(b[A] != null ? b[A] * 3 : null, b),
  // Intake MAP: A (kPa absolute)
  0x0b: (b) => r(b[A] != null ? b[A] : null, b),
  // Engine RPM: (256A + B) / 4
  0x0c: (b) => r(b[A] != null && b[B] != null ? (256 * b[A] + b[B]) / 4 : null, b),
  // Vehicle speed: A (km/h)
  0x0d: (b) => r(b[A] != null ? b[A] : null, b),
  // Timing advance: A/2 - 64 (°)
  0x0e: (b) => r(b[A] != null ? b[A] / 2 - 64 : null, b),
  // Intake air temp: A - 40 (°C)
  0x0f: (b) => r(b[A] != null ? b[A] - 40 : null, b),
  // MAF: (256A + B) / 100 (g/s)
  0x10: (b) => r(b[A] != null && b[B] != null ? (256 * b[A] + b[B]) / 100 : null, b),
  // Throttle/pedal position: A * 100/255 (%)
  0x11: (b) => r(b[A] != null ? (b[A] * 100) / 255 : null, b),
  // Run time since start: 256A + B (s)
  0x1f: (b) => r(b[A] != null && b[B] != null ? 256 * b[A] + b[B] : null, b),
  // Distance with MIL on: 256A + B (km)
  0x21: (b) => r(b[A] != null && b[B] != null ? 256 * b[A] + b[B] : null, b),
  // Fuel rail pressure (rel. to manifold vacuum): (256A + B) * 0.079 (kPa)
  0x22: (b) => r(b[A] != null && b[B] != null ? (256 * b[A] + b[B]) * 0.079 : null, b),
  // Fuel rail pressure (direct/high): (256A + B) * 10 (kPa)
  0x23: (b) => r(b[A] != null && b[B] != null ? (256 * b[A] + b[B]) * 10 : null, b),
  // Commanded EGR: A * 100/255 (%)
  0x2c: (b) => r(b[A] != null ? (b[A] * 100) / 255 : null, b),
  // EGR error: (A - 128) * 100/128 (%)
  0x2d: (b) => r(b[A] != null ? (b[A] - 128) * (100 / 128) : null, b),
  // Distance since codes cleared: 256A + B (km)
  0x31: (b) => r(b[A] != null && b[B] != null ? 256 * b[A] + b[B] : null, b),
  // Absolute barometric pressure: A (kPa)
  0x33: (b) => r(b[A] != null ? b[A] : null, b),
  // Control module voltage: (256A + B) / 1000 (V)
  0x42: (b) => r(b[A] != null && b[B] != null ? (256 * b[A] + b[B]) / 1000 : null, b),
  // Ambient air temp: A - 40 (°C)
  0x46: (b) => r(b[A] != null ? b[A] - 40 : null, b),
  // Engine oil temp: A - 40 (°C)
  0x5c: (b) => r(b[A] != null ? b[A] - 40 : null, b),
  // Engine fuel rate: (256A + B) / 20 (L/h)
  0x5e: (b) => r(b[A] != null && b[B] != null ? (256 * b[A] + b[B]) / 20 : null, b),
};

/** Decode a standard PID, or return a raw-only result if we have no formula. */
export function decodeStandard(pid: number, bytes: number[]): PidDecodeResult {
  const decoder = STANDARD_DECODERS[pid];
  if (decoder) return decoder(bytes);
  return r(null, bytes, '(no decoder)');
}
