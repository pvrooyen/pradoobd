/**
 * Diagnostic Trouble Code (DTC) representation and the J1979 decoding of the
 * two-byte raw form into the familiar "P0234" style string.
 */

export interface Dtc {
  /** Human code, e.g. "P0234" (turbo overboost) or "P1234" (mfr-specific). */
  code: string;
  /** Category letter implied by the code: Powertrain/Chassis/Body/Network. */
  category: 'P' | 'C' | 'B' | 'U';
  /** Whether this came from Mode 03 (stored), 07 (pending), or 0A (permanent). */
  kind: 'stored' | 'pending' | 'permanent';
  /** Optional description if we have one in a lookup table; else undefined. */
  description?: string;
}

const CATEGORY_BY_HIGH_NIBBLE: Array<Dtc['category']> = ['P', 'C', 'B', 'U'];

/**
 * Decode a 2-byte DTC (per SAE J2012) into its string form.
 *
 * The top two bits select the category (P/C/B/U); the next two bits are the
 * first digit (0–3); the remaining 12 bits are three hex digits.
 *
 * @param b0 first byte, @param b1 second byte
 */
export function decodeDtc(b0: number, b1: number, kind: Dtc['kind'] = 'stored'): Dtc | null {
  // 0x0000 is the "no code" filler used to pad responses.
  if (b0 === 0 && b1 === 0) return null;

  const category = CATEGORY_BY_HIGH_NIBBLE[(b0 >> 6) & 0x03] ?? 'P';
  const firstDigit = (b0 >> 4) & 0x03;
  const secondDigit = b0 & 0x0f;
  const thirdDigit = (b1 >> 4) & 0x0f;
  const fourthDigit = b1 & 0x0f;

  const code =
    category +
    firstDigit.toString(16).toUpperCase() +
    secondDigit.toString(16).toUpperCase() +
    thirdDigit.toString(16).toUpperCase() +
    fourthDigit.toString(16).toUpperCase();

  return { code, category, kind };
}
