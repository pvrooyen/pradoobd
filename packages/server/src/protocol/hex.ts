/**
 * Helpers for parsing ELM327 hex responses.
 *
 * ELM327 returns space-separated hex bytes, often across multiple lines, and may
 * include noise like "SEARCHING...", "BUS INIT", echoed headers, or status words
 * ("NO DATA", "?", "STOPPED", "UNABLE TO CONNECT", "CAN ERROR", "BUFFER FULL").
 * These helpers normalize that into a flat byte array plus error detection.
 */

const ERROR_TOKENS = [
  'NO DATA',
  'UNABLE TO CONNECT',
  'BUS INIT: ...ERROR',
  'CAN ERROR',
  'BUFFER FULL',
  'STOPPED',
  'ERROR',
  '?',
];

export interface ParsedResponse {
  /** Flat data bytes parsed from all hex tokens. */
  bytes: number[];
  /** A recognized adapter error token, if the response is an error. */
  error?: string;
  /** The raw text, normalized to single newlines. */
  raw: string;
}

/** True if a response line is adapter noise we should skip (not data). */
function isNoise(line: string): boolean {
  const u = line.toUpperCase();
  return (
    u.startsWith('SEARCHING') ||
    u.startsWith('BUS INIT') ||
    u === '' ||
    u === 'OK'
  );
}

/** Detect a recognized error token in the response. */
export function detectError(text: string): string | undefined {
  const u = text.toUpperCase();
  for (const tok of ERROR_TOKENS) {
    if (u.includes(tok)) return tok;
  }
  return undefined;
}

/**
 * Parse an OBD hex response into bytes. Strips noise lines, then collects every
 * 2-hex-digit token. Does NOT strip the mode/pid echo — callers that want the
 * payload after the echo use `stripEcho`.
 */
export function parseHexResponse(text: string): ParsedResponse {
  const raw = text.replace(/\r/g, '\n');
  const error = detectError(raw);
  const bytes: number[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (isNoise(trimmed)) continue;
    // Some adapters prefix CAN responses with a frame length digit/colon
    // (e.g. "0: 41 0C 1A F8"). Drop a leading "N:" segment.
    const cleaned = trimmed.replace(/^[0-9A-F]:\s*/i, '');
    for (const tok of cleaned.split(/\s+/)) {
      if (/^[0-9A-Fa-f]{2}$/.test(tok)) {
        bytes.push(parseInt(tok, 16));
      }
    }
  }

  return { bytes, error, raw };
}

/**
 * Given parsed bytes and the request mode/pid, strip the positive-response echo
 * and return just the data payload.
 *
 * Positive response convention: response mode = request mode + 0x40.
 *   Mode 01 PID 0C  -> "41 0C <data...>"   (strip 2 bytes)
 *   Mode 09 PID 02  -> "49 02 <data...>"   (strip 2 bytes)
 *   Mode 22 id 0119 -> "62 01 19 <data...>" (strip 3 bytes)
 *   Mode 03         -> "43 <data...>"       (strip 1 byte)
 *
 * @returns null if the echo doesn't match (e.g. negative response 0x7F).
 */
export function stripEcho(
  bytes: number[],
  reqMode: number,
  reqPid?: number,
  pidByteLen: 1 | 2 = 1,
): number[] | null {
  if (bytes.length === 0) return null;
  const posMode = (reqMode + 0x40) & 0xff;
  if (bytes[0] !== posMode) return null;

  if (reqPid === undefined) {
    return bytes.slice(1); // e.g. Mode 03
  }
  if (pidByteLen === 1) {
    if (bytes[1] !== (reqPid & 0xff)) return null;
    return bytes.slice(2);
  }
  // 2-byte pid (Mode 22)
  const hi = (reqPid >> 8) & 0xff;
  const lo = reqPid & 0xff;
  if (bytes[1] !== hi || bytes[2] !== lo) return null;
  return bytes.slice(3);
}

/** True if the byte stream is a UDS negative response (0x7F ...). */
export function isNegativeResponse(bytes: number[]): boolean {
  return bytes[0] === 0x7f;
}

export function toHexStr(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}
