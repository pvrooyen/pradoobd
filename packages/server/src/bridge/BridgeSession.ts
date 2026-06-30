/**
 * BridgeSession — glues one WebSocket client to one ObdSession + Transport.
 *
 * Responsibilities:
 *   - Translate incoming ClientCommand messages into ObdSession calls.
 *   - Emit ServerEvent messages back (connection state, results, errors, progress).
 *   - Own the live-poll loop (round-robins the requested PIDs and streams readings).
 *
 * Because the ELM327 is one-command-at-a-time, the live loop and one-off commands
 * are naturally serialized by the transport's internal queue — we don't need
 * extra locking, but we DO pause the live loop while a blocking op (scan, probe)
 * runs so latency stays predictable.
 */

import {
  DEFAULT_ADAPTER_CONFIG,
  ObdMode,
  STANDARD_PIDS,
  TOYOTA_ENHANCED_PIDS,
  TOYOTA_PROBE_RANGE,
  type AdapterConfig,
  type ClientCommand,
  type ConnectionState,
  type LiveReading,
  type PidDefinition,
  type ProbeHit,
  type ServerEvent,
} from '@pradoobd/shared';
import { ObdSession } from '../protocol/ObdSession.js';
import { ElmWifiTransport } from '../transport/ElmWifiTransport.js';
import { MockTransport } from '../transport/MockTransport.js';
import { withReadOnlyGuard, readReadOnlyEnv } from '../transport/ReadOnlyGuard.js';
import type { Transport } from '../transport/Transport.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('bridge');

export type SendFn = (event: ServerEvent) => void;

export interface BridgeOptions {
  /** When true, use the in-process MockTransport instead of real WiFi. */
  useMock: boolean;
  /**
   * When true, enforce read-only safety: vehicle-write commands are refused at
   * the transport and clearDtcs is rejected. Defaults to the READ_ONLY env
   * (default ON) when not specified.
   */
  readOnly?: boolean;
}

export class BridgeSession {
  private transport: Transport | null = null;
  private session: ObdSession | null = null;
  private config: AdapterConfig = { ...DEFAULT_ADAPTER_CONFIG };
  private liveTimer: NodeJS.Timeout | null = null;
  private liveStart = 0;
  private busy = false;
  /** Read-only safety: when true, vehicle writes are refused (default ON). */
  private readonly readOnly: boolean;

  constructor(
    private readonly send: SendFn,
    private readonly options: BridgeOptions,
  ) {
    this.readOnly = options.readOnly ?? readReadOnlyEnv(true);
  }

  /** Entry point for every message from the browser. */
  async handle(cmd: ClientCommand): Promise<void> {
    try {
      switch (cmd.type) {
        case 'connect':
          return await this.connect(cmd.config, cmd.id);
        case 'disconnect':
          return await this.disconnect(cmd.id);
        case 'raw':
          return await this.raw(cmd.command, cmd.id);
        case 'scanSupported':
          return await this.scanSupported(cmd.id);
        case 'readDtcs':
          return await this.readDtcs(cmd.id);
        case 'clearDtcs':
          return await this.clearDtcs(cmd.id);
        case 'startLive':
          return this.startLive(cmd.pids, cmd.intervalMs, cmd.id);
        case 'stopLive':
          return this.stopLive(cmd.id);
        case 'probeMode22':
          return await this.probe(cmd.start, cmd.end, cmd.id);
        case 'readVehicleInfo':
          return await this.readVehicleInfo(cmd.id);
        default: {
          const _exhaustive: never = cmd;
          void _exhaustive;
        }
      }
    } catch (err) {
      this.emitError((err as Error).message, cmd.id);
    }
  }

  /** Called when the WS client disconnects — tear everything down. */
  async dispose(): Promise<void> {
    this.stopLive();
    if (this.transport) await this.transport.close().catch(() => {});
    this.transport = null;
    this.session = null;
  }

  // --- command handlers ---------------------------------------------------

  private async connect(partial: Partial<AdapterConfig> | undefined, id?: string): Promise<void> {
    this.config = { ...this.config, ...partial };
    await this.disconnect(); // ensure clean slate

    this.emitState('connecting');
    const baseTransport: Transport = this.options.useMock
      ? new MockTransport()
      : new ElmWifiTransport({
          host: this.config.host,
          port: this.config.port,
          commandTimeoutMs: this.config.commandTimeoutMs,
        });
    // Wrap in the read-only guard so no write reaches the car when read-only is
    // on, regardless of which command path (raw terminal, clearDtcs, future) is
    // exercised. Belt to the explicit clearDtcs refusal's suspenders.
    this.transport = withReadOnlyGuard(baseTransport, this.readOnly);

    this.transport.on('close', () => this.emitState('disconnected', { message: 'adapter closed' }));
    this.transport.on('error', (e) => this.emitState('error', { message: e.message }));

    try {
      await this.transport.open();
    } catch (err) {
      this.emitState('error', { message: `connect failed: ${(err as Error).message}` });
      this.emitError((err as Error).message, id, 'CONNECT_FAILED');
      return;
    }

    this.session = new ObdSession(this.transport);
    this.emitState('initializing');
    try {
      const info = await this.session.initialize(this.config.protocol);
      this.emitState('connected', { adapterId: info.adapterId, protocol: info.protocol });
    } catch (err) {
      this.emitState('error', { message: `init failed: ${(err as Error).message}` });
      this.emitError((err as Error).message, id, 'INIT_FAILED');
    }
  }

  private async disconnect(id?: string): Promise<void> {
    this.stopLive();
    if (this.transport) {
      await this.transport.close().catch(() => {});
      this.transport = null;
      this.session = null;
      this.emitState('disconnected');
    }
    void id;
  }

  private async raw(command: string, id?: string): Promise<void> {
    const s = this.requireSession(id);
    if (!s) return;
    const start = Date.now();
    const response = await s.raw(command);
    this.send({ type: 'raw', id, command, response, elapsedMs: Date.now() - start });
  }

  private async scanSupported(id?: string): Promise<void> {
    const s = this.requireSession(id);
    if (!s) return;
    await this.withBusy(async () => {
      this.send({ type: 'progress', id, label: 'Scanning supported PIDs', current: 0, total: 1 });
      const defs = await s.scanSupportedMode01();
      const supportedPidIds = defs.map((d) => d.id);
      this.send({ type: 'supported', id, supportedPidIds, definitions: defs });
      this.send({ type: 'progress', id, label: 'Scan complete', current: 1, total: 1 });
    });
  }

  private async readDtcs(id?: string): Promise<void> {
    const s = this.requireSession(id);
    if (!s) return;
    await this.withBusy(async () => {
      const stored = await s.readDtcs(ObdMode.StoredDtc);
      const pending = await s.readDtcs(ObdMode.PendingDtc);
      this.send({ type: 'dtcs', id, dtcs: [...stored, ...pending] });
    });
  }

  private async clearDtcs(id?: string): Promise<void> {
    const s = this.requireSession(id);
    if (!s) return;
    // Explicit refusal in read-only mode — clearer than letting the transport
    // guard throw, and reported as a structured error the UI can show.
    if (this.readOnly) {
      this.emitError(
        'Clear DTCs is disabled in read-only mode (it writes to the car). Set READ_ONLY=0 to enable.',
        id,
        'READ_ONLY',
      );
      this.send({ type: 'cleared', id, ok: false });
      return;
    }
    await this.withBusy(async () => {
      const ok = await s.clearDtcs();
      this.send({ type: 'cleared', id, ok });
    });
  }

  private async readVehicleInfo(id?: string): Promise<void> {
    const s = this.requireSession(id);
    if (!s) return;
    await this.withBusy(async () => {
      const vin = await s.readVin();
      this.send({ type: 'vehicleInfo', id, vin });
    });
  }

  private async probe(start: number, end: number, id?: string): Promise<void> {
    const s = this.requireSession(id);
    if (!s) return;
    const lo = clampId(start ?? TOYOTA_PROBE_RANGE.start);
    const hi = clampId(end ?? TOYOTA_PROBE_RANGE.end);
    if (hi < lo) return this.emitError('probe end < start', id);

    await this.withBusy(async () => {
      const hits: ProbeHit[] = [];
      const misses: number[] = [];
      const total = hi - lo + 1;
      let count = 0;

      for (let pid = lo; pid <= hi; pid++) {
        const result = await s.probeMode22(pid);
        if (result) {
          const known = TOYOTA_ENHANCED_PIDS.find((p) => p.pid === pid);
          hits.push({ pid, rawHex: result.rawHex, key: known?.key, name: known?.name });
        } else {
          misses.push(pid);
        }
        count++;
        if (count % 8 === 0 || count === total) {
          this.send({ type: 'progress', id, label: `Probing 0x${pid.toString(16)}`, current: count, total });
        }
      }
      this.send({ type: 'probeResult', id, hits, misses });
    });
  }

  private startLive(pidIds: string[], intervalMs: number, id?: string): void {
    const s = this.requireSession(id);
    if (!s) return;
    this.stopLive();

    const defs = resolveDefs(pidIds);
    if (defs.length === 0) return this.emitError('no valid PIDs to poll', id);

    const interval = Math.max(100, intervalMs || 500);
    this.liveStart = Date.now();
    let cursor = 0;

    const loop = async () => {
      if (!this.session || this.busy) return; // skip a tick while a blocking op runs
      // Poll one PID per tick (round-robin) to keep the single-channel adapter
      // responsive; the UI gets a steady trickle of updates.
      const def = defs[cursor % defs.length]!;
      cursor++;
      try {
        const reading =
          def.mode === ObdMode.ReadDataByIdentifier
            ? await this.pollMode22(def)
            : await this.session.readMode01(def);
        if (reading) {
          const out: LiveReading = {
            pidId: def.id,
            key: def.key,
            name: def.name,
            unit: def.unit,
            value: reading.value,
            text: reading.text,
            rawHex: reading.rawHex,
            t: Date.now() - this.liveStart,
          };
          this.send({ type: 'live', readings: [out] });
        }
      } catch (err) {
        log.debug(`live poll ${def.id} failed: ${(err as Error).message}`);
      }
    };

    this.liveTimer = setInterval(() => void loop(), interval);
    log.info(`live started: ${defs.length} PIDs @ ${interval}ms`);
  }

  private async pollMode22(def: PidDefinition): Promise<{ value: number | null; text?: string; rawHex: string } | null> {
    const res = await this.session!.probeMode22(def.pid);
    if (!res) return null;
    return res.decoded;
  }

  private stopLive(id?: string): void {
    if (this.liveTimer) {
      clearInterval(this.liveTimer);
      this.liveTimer = null;
      log.info('live stopped');
    }
    void id;
  }

  // --- helpers ------------------------------------------------------------

  private requireSession(id?: string): ObdSession | null {
    if (!this.session) {
      this.emitError('Not connected to adapter', id, 'NOT_CONNECTED');
      return null;
    }
    return this.session;
  }

  /** Run a blocking op with the live loop paused, so commands don't interleave. */
  private async withBusy(fn: () => Promise<void>): Promise<void> {
    this.busy = true;
    try {
      await fn();
    } finally {
      this.busy = false;
    }
  }

  private emitState(state: ConnectionState, extra: Partial<Extract<ServerEvent, { type: 'connectionState' }>> = {}): void {
    // Always advertise the read-only flag so the UI can hide write affordances.
    this.send({ type: 'connectionState', state, readOnly: this.readOnly, ...extra });
  }

  private emitError(message: string, id?: string, code?: string): void {
    log.warn(`error: ${message}`);
    this.send({ type: 'error', id, message, code });
  }
}

function resolveDefs(pidIds: string[]): PidDefinition[] {
  const all = [...STANDARD_PIDS, ...TOYOTA_ENHANCED_PIDS];
  const out: PidDefinition[] = [];
  for (const idStr of pidIds) {
    const def = all.find((d) => d.id === idStr);
    if (def) out.push(def);
  }
  return out;
}

function clampId(n: number): number {
  return Math.max(0, Math.min(0xffff, Math.floor(n)));
}
