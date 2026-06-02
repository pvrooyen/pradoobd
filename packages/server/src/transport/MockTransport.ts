/**
 * MockTransport — an in-process fake ELM327 + simulated 2005 Prado (1KD-FTV).
 *
 * Lets you develop and click through the whole UI away from the car. It is NOT
 * an attempt to perfectly model the real ECU — it returns *plausible* responses
 * so the parsing, decoding, gauges, DTC flow and Mode 22 prober all light up.
 * Once at the car, switch to ElmWifiTransport and confirm against reality.
 *
 * Behaviour worth knowing:
 *   - Supports a believable subset of Mode 01 PIDs (diesel pre-mandate => not
 *     everything answers; the rest return "NO DATA").
 *   - Mode 03 returns two example DTCs (P0234 overboost, P0401 EGR flow).
 *   - Mode 22 answers only the named Toyota candidates in TOYOTA_ENHANCED_PIDS;
 *     everything else returns a negative response (7F 22 31) so the prober has
 *     real hits and misses to show.
 *   - Live values drift slightly each call so gauges/graphs visibly move.
 */

import { Emitter } from '../util/Emitter.js';
import { createLogger } from '../util/logger.js';
import { TOYOTA_ENHANCED_PIDS } from '@pradoobd/shared';
import type { SendOptions, Transport, TransportEvents } from './Transport.js';

const log = createLogger('mock');

/** PIDs our fake diesel ECU "supports" on Mode 01 (the rest say NO DATA). */
const SUPPORTED_MODE01 = new Set<number>([
  0x00, 0x01, 0x04, 0x05, 0x0b, 0x0c, 0x0d, 0x0f, 0x11, 0x1f, 0x20, 0x21, 0x22,
  0x23, 0x2c, 0x31, 0x33, 0x40, 0x42, 0x46, 0x5c,
]);

export class MockTransport implements Transport {
  readonly kind = 'Mock-ELM327';
  private open_ = false;
  private readonly emitter = new Emitter<TransportEvents>();
  private tick = 0;

  get isOpen(): boolean {
    return this.open_;
  }

  on<E extends keyof TransportEvents>(event: E, listener: TransportEvents[E]): () => void {
    return this.emitter.on(event, listener);
  }

  async open(): Promise<void> {
    this.open_ = true;
    log.info('mock adapter opened');
    this.emitter.emit('open');
  }

  async close(): Promise<void> {
    this.open_ = false;
    this.emitter.emit('close', 'mock closed');
  }

  async send(command: string, _opts?: SendOptions): Promise<string> {
    if (!this.open_) throw new Error('Transport not open');
    this.tick++;
    const cmd = command.trim().toUpperCase().replace(/\s+/g, ' ');
    const response = this.respond(cmd);
    this.emitter.emit('data', `${cmd}\r${response}\r>`);
    // Small async hop so timing behaves like a real socket.
    await Promise.resolve();
    return response;
  }

  private respond(cmd: string): string {
    // --- AT commands (adapter config) ---
    if (cmd.startsWith('AT')) {
      if (cmd === 'ATI') return 'ELM327 v1.5 (MOCK)';
      if (cmd === 'ATDP' || cmd === 'AT DP') return 'AUTO, ISO 15765-4 (CAN 11/500)';
      if (cmd === 'ATRV') return '14.1V';
      return 'OK';
    }

    const bytes = cmd.split(' ').map((h) => parseInt(h, 16));
    const mode = bytes[0];

    // --- Mode 01: current data ---
    if (mode === 0x01 && bytes.length >= 2) {
      const pid = bytes[1]!;
      if (!SUPPORTED_MODE01.has(pid)) return 'NO DATA';
      return this.mode01(pid);
    }

    // --- Mode 03: stored DTCs ---
    if (cmd === '03') {
      // 2 codes: P0234 (turbo overboost) and P0401 (EGR insufficient flow).
      // Mode 03 response format: 43 <count?> then code bytes. ELM strips headers
      // to give "43 02 34 04 01" style. P0234 => 02 34, P0401 => 04 01.
      return '43 02 34 04 01';
    }

    // --- Mode 07: pending DTCs ---
    if (cmd === '07') return '47 00'; // none pending

    // --- Mode 04: clear ---
    if (cmd === '04') return '44';

    // --- Mode 09: vehicle info ---
    if (cmd === '09 02') {
      // VIN "JTEBU29J905012345" encoded — return a believable mock VIN frame.
      return '49 02 01 4A 54 45 42 55 32 39 4A 39 30 35 30 31 32 33 34 35';
    }

    // --- Mode 22: Toyota enhanced ---
    if (mode === 0x22 && bytes.length >= 3) {
      const id = ((bytes[1]! << 8) | bytes[2]!) & 0xffff;
      const known = TOYOTA_ENHANCED_PIDS.find((p) => p.pid === id);
      if (!known) return '7F 22 31'; // requestOutOfRange — a "miss"
      return this.mode22(known.pid, known.bytes);
    }

    return 'NO DATA';
  }

  private mode01(pid: number): string {
    const echo = `41 ${hx(pid)}`;
    const wobble = (this.tick % 20) - 10; // -10..+9
    switch (pid) {
      case 0x00:
        return `${echo} BE 3F A8 13`; // supported [01-20] bitmask (mock)
      case 0x20:
        return `${echo} 80 00 00 01`; // supported [21-40]
      case 0x40:
        return `${echo} 40 00 00 00`; // supported [41-60]
      case 0x01:
        return `${echo} 00 07 E1 00`; // monitor status (MIL off, some monitors)
      case 0x04:
        return `${echo} ${hx(clamp(80 + wobble, 0, 255))}`; // engine load A*100/255
      case 0x05:
        return `${echo} ${hx(120)}`; // coolant: A-40 = 80°C
      case 0x0b:
        return `${echo} ${hx(clamp(101 + wobble, 0, 255))}`; // MAP kPa
      case 0x0c: {
        const rpm = 800 + (this.tick % 50) * 30; // idle..~2300
        const a = (rpm * 4) >> 8;
        const b = (rpm * 4) & 0xff;
        return `${echo} ${hx(a)} ${hx(b)}`;
      }
      case 0x0d:
        return `${echo} ${hx(clamp(0 + (this.tick % 40), 0, 255))}`; // speed km/h
      case 0x0f:
        return `${echo} ${hx(70)}`; // intake air temp: 30°C
      case 0x11:
        return `${echo} ${hx(clamp(40 + wobble, 0, 255))}`; // throttle/pedal %
      case 0x1f: {
        const s = this.tick * 2;
        return `${echo} ${hx((s >> 8) & 0xff)} ${hx(s & 0xff)}`;
      }
      case 0x21:
        return `${echo} 00 00`; // distance with MIL on
      case 0x22: {
        const kpa = 28000 + wobble * 50; // rail pressure rel vacuum
        const raw = Math.round(kpa / 0.079);
        return `${echo} ${hx((raw >> 8) & 0xff)} ${hx(raw & 0xff)}`;
      }
      case 0x23: {
        const kpa = 30000 + wobble * 100; // direct rail pressure
        const raw = Math.round(kpa / 10);
        return `${echo} ${hx((raw >> 8) & 0xff)} ${hx(raw & 0xff)}`;
      }
      case 0x2c:
        return `${echo} ${hx(clamp(30 + wobble, 0, 255))}`; // commanded EGR %
      case 0x31: {
        const km = 1234;
        return `${echo} ${hx((km >> 8) & 0xff)} ${hx(km & 0xff)}`;
      }
      case 0x33:
        return `${echo} ${hx(101)}`; // baro kPa
      case 0x42: {
        const mv = 14100; // 14.1V
        return `${echo} ${hx((mv >> 8) & 0xff)} ${hx(mv & 0xff)}`;
      }
      case 0x46:
        return `${echo} ${hx(65)}`; // ambient: 25°C
      case 0x5c:
        return `${echo} ${hx(130)}`; // oil temp: 90°C
      default:
        return 'NO DATA';
    }
  }

  private mode22(pid: number, byteLen: number): string {
    const echo = `62 ${hx((pid >> 8) & 0xff)} ${hx(pid & 0xff)}`;
    const wobble = (this.tick % 16) - 8;
    // Generate plausible-but-arbitrary payloads that drift over time.
    const data: number[] = [];
    for (let i = 0; i < byteLen; i++) {
      data.push(clamp(0x40 + wobble + i * 7, 0, 255));
    }
    return `${echo} ${data.map(hx).join(' ')}`;
  }
}

function hx(n: number): string {
  return (n & 0xff).toString(16).toUpperCase().padStart(2, '0');
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** Re-exported for callers that want to know what the mock pretends to support. */
export const MOCK_SUPPORTED_MODE01 = SUPPORTED_MODE01;
