/**
 * ObdSession — the protocol orchestrator that sits on top of a Transport.
 *
 * It owns the OBD-level knowledge: how to initialize an ELM327, how to query the
 * supported-PID bitmasks, read/clear DTCs, read the VIN, poll live PIDs, and
 * probe Mode 22 identifiers. It speaks to the adapter only through the Transport
 * interface, so the same session logic works against the real ELM327 or the
 * mock — and against a future J2534 transport.
 *
 * Decoding raw bytes into engineering units is delegated to the decoders module.
 */

import {
  ObdMode,
  STANDARD_PIDS,
  TOYOTA_ENHANCED_PIDS,
  decodeDtc,
  findStandardPid,
  pidId,
  type Dtc,
  type PidDecodeResult,
  type PidDefinition,
} from '@pradoobd/shared';
import type { Transport } from '../transport/Transport.js';
import { createLogger } from '../util/logger.js';
import { decodeStandard } from '../decoders/standard.js';
import { decodeToyota } from '../decoders/toyota.js';
import {
  isNegativeResponse,
  parseHexResponse,
  stripEcho,
  toHexStr,
} from './hex.js';

const log = createLogger('obd');

/** The canonical ELM327 initialization sequence. Order matters. */
const INIT_SEQUENCE: Array<{ cmd: string; desc: string }> = [
  { cmd: 'ATZ', desc: 'reset' },
  { cmd: 'ATE0', desc: 'echo off' },
  { cmd: 'ATL0', desc: 'linefeeds off' },
  { cmd: 'ATS0', desc: 'spaces off (we re-add on parse)' },
  { cmd: 'ATH0', desc: 'headers off' },
  { cmd: 'ATSP0', desc: 'protocol auto' },
];

export interface InitResult {
  adapterId: string;
  protocol: string;
}

export interface LiveValue extends PidDecodeResult {
  pidId: string;
  key: string;
  name: string;
  unit: string;
}

export class ObdSession {
  constructor(private readonly transport: Transport) {}

  /** Raw passthrough — used by the terminal and by higher-level helpers. */
  async raw(command: string, timeoutMs?: number): Promise<string> {
    return this.transport.send(command, timeoutMs ? { timeoutMs } : undefined);
  }

  /**
   * Run the ELM327 init sequence and read back identity + active protocol.
   * Tolerates ATZ echoing junk by ignoring its content.
   */
  async initialize(forcedProtocol = 0): Promise<InitResult> {
    for (const step of INIT_SEQUENCE) {
      const cmd =
        step.cmd === 'ATSP0' && forcedProtocol > 0
          ? `ATSP${forcedProtocol}`
          : step.cmd;
      try {
        const resp = await this.transport.send(cmd, { timeoutMs: 5000 });
        log.debug(`init ${cmd} (${step.desc}) -> ${JSON.stringify(resp)}`);
      } catch (err) {
        log.warn(`init step ${cmd} failed: ${(err as Error).message}`);
        // ATZ frequently times out the first time on flaky links; keep going.
        if (step.cmd !== 'ATZ') throw err;
      }
    }

    const adapterId = (await this.safeSend('ATI')) || 'unknown';
    // Touch the bus once so ATDP reports the negotiated protocol, not "AUTO".
    await this.safeSend('0100');
    const protocol = (await this.safeSend('ATDP')) || 'unknown';
    log.info(`initialized: adapter=${adapterId} protocol=${protocol}`);
    return { adapterId, protocol };
  }

  private async safeSend(cmd: string): Promise<string> {
    try {
      return (await this.transport.send(cmd)).trim();
    } catch {
      return '';
    }
  }

  /**
   * Force-try a list of ELM327 protocol numbers, returning the first that gets a
   * valid answer to Mode 01 PID 00 (`0100` → positive response `41 00 ...`).
   *
   * ATSP0 (auto) frequently fails to lock a protocol on older K-line Toyotas
   * (this 2005 1KD-FTV included): the adapter talks to us but never to the ECU,
   * so `0100` returns nothing and the protocol stays "AUTO". Forcing each
   * candidate explicitly is far more reliable. Every attempt's raw response is
   * returned AND logged, so a total miss is still fully diagnostic.
   *
   * ELM327 protocol numbers: 3=ISO 9141-2, 4=ISO 14230-4 KWP (5-baud),
   * 5=ISO 14230-4 KWP (fast), 6=ISO 15765-4 CAN 11/500, 7=CAN 29/500.
   *
   * K-line robustness: cheap WiFi ELM327 clones are notoriously bad at the
   * ISO 9141 / KWP wake-up handshake — a `BUS INIT: ERROR` from the auto path
   * is as often the clone as it is a silent ECU. So for K-line protocols (3,4,5)
   * we tune the init to be deterministic and forgiving, run an explicit manual
   * init (so the raw sync/keyword bytes are visible in the log), and retry a few
   * times (clones routinely fail the first init and succeed the second). Each
   * step is logged raw, so a total miss is still fully diagnostic: zero K-line
   * sync across every retry points at "no generic-OBD ECU on the K-line"; a
   * partial/erratic sync points at "marginal clone".
   */
  async tryProtocols(
    candidates: number[],
    timeoutMs = 9000,
    klineRetries = 2,
  ): Promise<{ protocol: number; atdp: string; attempts: Array<{ n: number; resp: string; ok: boolean }> }> {
    const attempts: Array<{ n: number; resp: string; ok: boolean }> = [];
    for (const n of candidates) {
      const isKline = n >= 3 && n <= 5; // 3=ISO9141, 4=KWP 5-baud, 5=KWP fast
      // Close any previously-negotiated protocol so each init starts clean.
      await this.safeSend('ATPC');
      await this.safeSend(`ATSP${n}`);

      if (isKline) {
        await this.safeSend('ATAT0'); // adaptive timing off — deterministic
        await this.safeSend('ATSTFF'); // max per-message timeout (~1020ms)
        await this.safeSend('ATKW0'); // don't abort init on odd keyword bytes
        await this.safeSend('ATIB10'); // ISO baud 10400 (explicit)
      }

      const maxAttempts = isKline ? Math.max(1, klineRetries) : 1;
      let resp = '';
      let ok = false;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (isKline) {
          // Manual init isolates the handshake from the request, so the raw
          // result (real sync/keyword bytes vs BUS INIT: ERROR) shows up in the
          // log. 5=fast init (ATFI), 3/4=slow 5-baud init (ATSI).
          const initCmd = n === 5 ? 'ATFI' : 'ATSI';
          const initResp = await this.safeSend(initCmd);
          log.info(
            `protocol ATSP${n} ${initCmd} (init ${attempt}/${maxAttempts}) -> ${JSON.stringify(initResp)}`,
          );
        }
        try {
          resp = (await this.transport.send('0100', { timeoutMs })).trim();
        } catch (err) {
          resp = `ERROR: ${(err as Error).message}`;
        }
        // A real reply contains the positive-response bytes 41 00 once we strip
        // spaces/CR and any echoed header. "NO DATA" / "UNABLE TO CONNECT" / "?"
        // / "BUS INIT: ERROR" never do.
        ok = resp.replace(/[^0-9a-fA-F]/g, '').toUpperCase().includes('4100');
        log.info(
          `protocol ATSP${n} 0100 (try ${attempt}/${maxAttempts}) -> ${JSON.stringify(resp)} ${ok ? '✔ ANSWERED' : '✗'}`,
        );
        if (ok) break;
        if (attempt < maxAttempts) {
          await this.safeSend('ATPC'); // close before re-initialising
          await delay(350);
        }
      }

      attempts.push({ n, resp, ok });
      if (ok) {
        const atdp = (await this.safeSend('ATDP')) || `SP${n}`;
        return { protocol: n, atdp, attempts };
      }
    }
    return { protocol: 0, atdp: '', attempts };
  }

  /**
   * Discover supported Mode 01 PIDs by walking the bitmask PIDs (00,20,40,60).
   * Each returns 4 bytes; bit set => that PID is supported. Bit 0 of the last
   * byte (the "next" flag) indicates whether the following bank exists.
   */
  async scanSupportedMode01(): Promise<PidDefinition[]> {
    const supported: PidDefinition[] = [];
    const banks = [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0];

    for (const base of banks) {
      const resp = await this.transport.send(`01 ${hx(base)}`);
      const parsed = parseHexResponse(resp);
      if (parsed.error) {
        log.debug(`bank ${hx(base)} -> ${parsed.error}; stopping`);
        break;
      }
      const data = stripEcho(parsed.bytes, ObdMode.CurrentData, base, 1);
      if (!data || data.length < 4) break;

      const mask = (data[0]! << 24) | (data[1]! << 16) | (data[2]! << 8) | data[3]!;
      // The bitmask PID itself is "supported" (we just queried it).
      const bitmaskDef = findStandardPid(base);
      if (bitmaskDef) supported.push(bitmaskDef);

      for (let bit = 0; bit < 32; bit++) {
        // Bit 31 (MSB) corresponds to PID base+1, ... bit 0 => base+32.
        if (mask & (1 << (31 - bit))) {
          const pid = base + bit + 1;
          const def = findStandardPid(pid);
          if (def) supported.push(def);
          else
            supported.push({
              id: pidId(ObdMode.CurrentData, pid),
              mode: ObdMode.CurrentData,
              pid,
              key: `pid_${hx(pid)}`,
              name: `Unknown PID ${hx(pid)}`,
              unit: '',
              bytes: 0,
              confidence: 'unknown',
              note: 'Supported by ECU but no definition yet.',
            });
        }
      }

      // Continue to next bank only if the "more" bit (PID base+0x20) is set.
      const moreSupported = (mask & 0x00000001) !== 0;
      if (!moreSupported) break;
    }

    return supported;
  }

  /** Read one Mode 01 PID and decode it. Returns null on NO DATA / error. */
  async readMode01(def: PidDefinition): Promise<LiveValue | null> {
    const resp = await this.transport.send(`01 ${hx(def.pid)}`);
    const parsed = parseHexResponse(resp);
    if (parsed.error) return null;
    const data = stripEcho(parsed.bytes, ObdMode.CurrentData, def.pid, 1);
    if (!data) return null;
    const decoded = decodeStandard(def.pid, data);
    return {
      ...decoded,
      pidId: def.id,
      key: def.key,
      name: def.name,
      unit: def.unit,
    };
  }

  /** Read DTCs from a given mode (03 stored or 07 pending). */
  async readDtcs(mode: ObdMode.StoredDtc | ObdMode.PendingDtc): Promise<Dtc[]> {
    const kind = mode === ObdMode.StoredDtc ? 'stored' : 'pending';
    const resp = await this.transport.send(hx(mode));
    const parsed = parseHexResponse(resp);
    if (parsed.error) return [];
    const data = stripEcho(parsed.bytes, mode);
    if (!data) return [];

    const dtcs: Dtc[] = [];
    for (let i = 0; i + 1 < data.length; i += 2) {
      const dtc = decodeDtc(data[i]!, data[i + 1]!, kind);
      if (dtc) dtcs.push(dtc);
    }
    return dtcs;
  }

  /** Clear DTCs (Mode 04). Returns true if the adapter acknowledged. */
  async clearDtcs(): Promise<boolean> {
    const resp = await this.transport.send('04');
    const parsed = parseHexResponse(resp);
    if (parsed.error) return false;
    // Positive response is 0x44.
    return parsed.bytes[0] === 0x44 || resp.toUpperCase().includes('44');
  }

  /** Read VIN via Mode 09 PID 02. */
  async readVin(): Promise<string | undefined> {
    const resp = await this.transport.send('09 02');
    const parsed = parseHexResponse(resp);
    if (parsed.error) return undefined;
    const data = stripEcho(parsed.bytes, ObdMode.VehicleInfo, 0x02, 1);
    if (!data) return undefined;
    // First byte after echo is a frame/count indicator; the rest are ASCII.
    const ascii = data.slice(1).filter((b) => b >= 0x20 && b < 0x7f);
    const vin = String.fromCharCode(...ascii).trim();
    return vin.length >= 11 ? vin : undefined;
  }

  /**
   * Probe a Mode 22 identifier. Returns the payload hex on a positive (0x62)
   * response, or null on negative (0x7F) / NO DATA. This is the core of the
   * Toyota enhanced-PID discovery.
   */
  async probeMode22(id: number): Promise<{ rawHex: string; decoded: PidDecodeResult } | null> {
    const cmd = `22 ${hx((id >> 8) & 0xff)} ${hx(id & 0xff)}`;
    let resp: string;
    try {
      resp = await this.transport.send(cmd);
    } catch {
      return null;
    }
    const parsed = parseHexResponse(resp);
    if (parsed.error || isNegativeResponse(parsed.bytes)) return null;
    const data = stripEcho(parsed.bytes, ObdMode.ReadDataByIdentifier, id, 2);
    if (!data) return null;
    return { rawHex: toHexStr(data), decoded: decodeToyota(id, data) };
  }
}

/** The full set of definitions a UI may want to resolve a pid id against. */
export const ALL_DEFINITIONS: PidDefinition[] = [...STANDARD_PIDS, ...TOYOTA_ENHANCED_PIDS];

function hx(n: number): string {
  return (n & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
