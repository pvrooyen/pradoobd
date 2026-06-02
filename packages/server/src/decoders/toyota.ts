/**
 * Toyota enhanced (Mode 22) decoders — PROVISIONAL.
 *
 * These scalings are best-guesses for a 1KD-FTV and must be confirmed at the
 * car (see the warning in shared/toyota.ts). When a Mode 22 PID has no confirmed
 * decoder, we deliberately return value=null but ALWAYS populate rawHex + a
 * couple of interpretations (u8, u16, signed) in `text`, so you can eyeball the
 * raw bytes in the UI/terminal and work out the real formula by watching them
 * move while you manipulate the engine.
 *
 * As you confirm a PID, add a real entry to TOYOTA_DECODERS keyed by its id.
 */

import type { PidDecodeResult } from '@pradoobd/shared';
import type { Decoder } from './standard.js';

function toHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

/**
 * Confirmed/assumed Toyota Mode 22 decoders, keyed by the 16-bit identifier.
 * Empty-ish for now by design — populate as you verify each PID at the car.
 * A couple of *assumed* examples are included to show the shape; treat with
 * suspicion until confirmed.
 */
export const TOYOTA_DECODERS: Record<number, Decoder> = {
  // Common-rail actual pressure (ASSUMED): (256A + B) * 0.1 => MPa. Verify idle.
  0x0119: (b) =>
    b[0] != null && b[1] != null
      ? { value: (256 * b[0] + b[1]) * 0.1, rawHex: toHex(b), text: 'assumed MPa' }
      : { value: null, rawHex: toHex(b) },
  // Boost pressure (ASSUMED): A => kPa absolute. Verify vs baro at idle.
  0x011a: (b) =>
    b[0] != null
      ? { value: b[0], rawHex: toHex(b), text: 'assumed kPa abs' }
      : { value: null, rawHex: toHex(b) },
};

/**
 * Fallback for any Mode 22 PID we have not confirmed: no committed value, but a
 * rich `text` with candidate interpretations so the value is still human-useful
 * during reverse-engineering.
 */
export function decodeToyotaUnknown(bytes: number[]): PidDecodeResult {
  const a = bytes[0];
  const b = bytes[1];
  const parts: string[] = [];
  if (a != null) parts.push(`u8=${a}`);
  if (a != null && b != null) {
    const u16 = 256 * a + b;
    parts.push(`u16=${u16}`);
    const s16 = u16 >= 0x8000 ? u16 - 0x10000 : u16;
    parts.push(`s16=${s16}`);
  }
  return { value: null, rawHex: toHex(bytes), text: parts.join(' ') || '(empty)' };
}

/** Decode a Mode 22 response: confirmed decoder if we have one, else the rich fallback. */
export function decodeToyota(pid: number, bytes: number[]): PidDecodeResult {
  const decoder = TOYOTA_DECODERS[pid];
  if (decoder) return decoder(bytes);
  return decodeToyotaUnknown(bytes);
}
