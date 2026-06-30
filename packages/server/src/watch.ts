/**
 * Auto-capture watcher — the "zero-terminal at the car" runner.
 *
 * THE PROBLEM
 * -----------
 * When the laptop joins the ELM327's WiFi (to reach the adapter), that network
 * has no internet, so the cloud Claude can't run commands on the laptop in that
 * moment. We don't want the user typing commands either. Solution: Claude starts
 * THIS watcher in the background while it still has shell access; the watcher
 * then runs unattended and reacts to the physical world.
 *
 * WHAT IT DOES
 * ------------
 * Polls for the adapter (TCP connect to ELM_HOST:ELM_PORT). State machine:
 *   - waiting:   adapter not reachable. (User hasn't plugged in / joined WiFi yet.)
 *   - present:   adapter reachable → automatically run ONE full capture, write
 *                captures/prado-<stamp>.{json,md}, then go to 'captured'.
 *   - captured:  adapter still present, capture already done this connection.
 *                Re-arms if the adapter disappears and comes back (so unplug/replug
 *                or re-running triggers a fresh capture).
 *
 * The capture here is NON-interactive by necessity (no one is at a keyboard). It
 * grabs init + VIN + supported-PID scan + a timed series of snapshots + DTCs +
 * Mode 22 sweep. Instead of "press Enter to rev", it captures snapshots on a
 * schedule and PROMINENTLY logs when to rev, so the user (watching the screen or
 * just revving periodically) naturally produces idle and loaded samples.
 *
 * The user does only: plug in, join adapter WiFi, (optionally) rev when prompted.
 * Everything else is automatic. When they switch back to internet, Claude reads
 * the capture files that appeared.
 *
 * Env:
 *   TRANSPORT             auto (default) | wifi | serial. 'auto' uses a plugged-in
 *                         USB adapter if present, else the WiFi adapter.
 *   ELM_SERIAL_PATH       USB serial device (default: first of /dev/ttyUSB*,ACM*)
 *   ELM_BAUD              USB baud (default 115200 = OBDLink SX; genuine ELM ~38400)
 *   ELM_HOST / ELM_PORT   WiFi adapter address (default 192.168.0.10:35000)
 *   MOCK=1                rehearse against the simulated Prado
 *   POLL_MS               adapter poll interval (default 3000)
 *   SNAPSHOTS             how many timed snapshots per capture (default 6)
 *   SNAPSHOT_GAP_MS       gap between snapshots (default 5000)
 *   PROTOCOLS             K-line-first force-try order (default 5,4,3,6,7)
 *   KLINE_RETRIES         K-line init retries per protocol (default 2)
 *   CMD_TIMEOUT_MS        per-command timeout (default from shared config)
 *   CAPTURE_DIR           where to write (default <repo-root>/captures)
 *   MODE22_START/END      Mode 22 sweep range (hex or dec; default 0x100-0x1FF)
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import {
  ObdMode,
  STANDARD_PIDS,
  TOYOTA_ENHANCED_PIDS,
  TOYOTA_PROBE_RANGE,
  DEFAULT_ADAPTER_CONFIG,
} from '@pradoobd/shared';
import { ObdSession } from './protocol/ObdSession.js';
import { ElmWifiTransport } from './transport/ElmWifiTransport.js';
import { SerialTransport } from './transport/SerialTransport.js';
import { MockTransport } from './transport/MockTransport.js';
import { withReadOnlyGuard, readReadOnlyEnv } from './transport/ReadOnlyGuard.js';
import type { Transport } from './transport/Transport.js';
import { createLogger } from './util/logger.js';

const log = createLogger('watch');

const USE_MOCK = process.env.MOCK === '1' || process.env.MOCK === 'true';
const HOST = process.env.ELM_HOST || DEFAULT_ADAPTER_CONFIG.host;
const PORT = Number(process.env.ELM_PORT) || DEFAULT_ADAPTER_CONFIG.port;
const POLL_MS = Number(process.env.POLL_MS) || 3000;
const SNAPSHOTS = Number(process.env.SNAPSHOTS) || 6;
const SNAPSHOT_GAP_MS = Number(process.env.SNAPSHOT_GAP_MS) || 5000;
const M22_START = parseIntFlexible(process.env.MODE22_START, TOYOTA_PROBE_RANGE.start);
const M22_END = parseIntFlexible(process.env.MODE22_END, TOYOTA_PROBE_RANGE.end);
// ELM327 protocols to force-try when auto-detect fails to lock (see tryProtocols).
// Order = K-line first for this 2005 1KD-FTV: KWP fast, KWP 5-baud, ISO 9141-2,
// then CAN 11/500 & 29/500 as a cheap safety net (they fail instantly here — the
// 2026-06-04 run got NO DATA on CAN, BUS INIT: ERROR on K-line). Override via
// PROTOCOLS="5,4,3".
const PROTOCOL_CANDIDATES = (process.env.PROTOCOLS || '5,4,3,6,7')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => !Number.isNaN(n));
// How many times to retry the K-line init per protocol. Clones often fail the
// first wake-up and lock on the second. Set KLINE_RETRIES=1 to go fast.
const KLINE_RETRIES = Number(process.env.KLINE_RETRIES) || 2;

// Read-only safety. The watcher is a pure read tool (init + scan + snapshots +
// read DTCs + Mode 22 read) and never writes to the car, so we default the guard
// ON: any vehicle-write command (clear DTCs, active test, ECU reset, reflash…)
// is refused at the transport before it reaches the wire. This is the safe
// foundation for the Chromebook step. Override with READ_ONLY=0 (not needed for
// captures). See transport/ReadOnlyGuard.ts + shared/src/safety.ts.
const READ_ONLY = readReadOnlyEnv(true);

// --- transport selection ---------------------------------------------------
// TRANSPORT=auto (default) | wifi | serial. In 'auto' we use a USB serial
// adapter if one is plugged in (the recommended fix for this K-line car — see
// SerialTransport), otherwise fall back to the WiFi adapter. This makes the
// watcher capture from WHATEVER the user plugs in, hands-free.
const TRANSPORT = (process.env.TRANSPORT || 'auto').toLowerCase();
const SERIAL_PATH = process.env.ELM_SERIAL_PATH || '';
const SERIAL_BAUD = Number(process.env.ELM_BAUD) || 115200; // OBDLink SX default
// Common device names for USB ELM/STN adapters on Linux/Crostini: FTDI & CH340
// land on ttyUSB*, CDC-ACM (some genuine ELM) on ttyACM*. ttyS* are the
// container's built-in UARTs — never an adapter, so they're excluded.
const SERIAL_CANDIDATES = ['/dev/ttyUSB0', '/dev/ttyUSB1', '/dev/ttyACM0', '/dev/ttyACM1'];

/** Resolve the serial device path to use, or null to use WiFi. */
function resolveSerialPath(): string | null {
  if (USE_MOCK) return null;
  if (TRANSPORT === 'wifi') return null;
  if (TRANSPORT === 'serial') {
    // Explicit serial: honour the configured path (wait for it to appear), else
    // fall back to the first known candidate name.
    return SERIAL_PATH || SERIAL_CANDIDATES.find((p) => fs.existsSync(p)) || SERIAL_CANDIDATES[0]!;
  }
  // auto: only choose serial if a device is actually present right now.
  if (SERIAL_PATH && fs.existsSync(SERIAL_PATH)) return SERIAL_PATH;
  return SERIAL_CANDIDATES.find((p) => fs.existsSync(p)) ?? null;
}

function parseIntFlexible(v: string | undefined, dflt: number): number {
  if (!v) return dflt;
  const n = v.trim().toLowerCase().startsWith('0x') ? parseInt(v, 16) : parseInt(v, 10);
  return Number.isNaN(n) ? dflt : n;
}

function capturesDir(): string {
  if (process.env.CAPTURE_DIR) return path.resolve(process.env.CAPTURE_DIR);
  // walk up to repo root (dir whose package.json has "workspaces")
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        if ((JSON.parse(fs.readFileSync(pkg, 'utf8')) as { workspaces?: unknown }).workspaces)
          return path.join(dir, 'captures');
      } catch { /* ignore */ }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(process.cwd(), 'captures');
}

/** Is the adapter reachable right now? Serial: the device file exists. WiFi: a
 *  quick TCP connect probe. */
function adapterReachable(): Promise<boolean> {
  if (USE_MOCK) return Promise.resolve(true);
  const serialPath = resolveSerialPath();
  if (serialPath) return Promise.resolve(fs.existsSync(serialPath));
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (ok: boolean) => {
      sock.removeAllListeners();
      // On success, close the probe socket with a graceful FIN (end) rather than
      // an abrupt destroy(): these single-client ELM327 WiFi clones leave their
      // one slot half-open after an RST, which makes the very next (capture)
      // connection get reset on its first command. A clean FIN lets the adapter
      // free the slot before we reconnect.
      if (ok) sock.end();
      else sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(2000);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
    sock.connect(PORT, HOST);
  });
}

async function snapshot(session: ObdSession, supportedIds: Set<string>, label: string) {
  const values: Array<{ id: string; name: string; unit: string; value: number | null; text?: string; rawHex: string }> = [];
  for (const def of STANDARD_PIDS) {
    if (def.isSupportBitmask || !supportedIds.has(def.id)) continue;
    const r = await session.readMode01(def);
    if (r) values.push({ id: def.id, name: def.name, unit: def.unit, value: r.value, text: r.text, rawHex: r.rawHex });
  }
  return { label, values };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runCapture(stamp: string): Promise<void> {
  const dir = capturesDir();
  fs.mkdirSync(dir, { recursive: true });

  // CMD_TIMEOUT_MS override: the first real OBD request on a K-line car (ISO
  // 9141-2 / ISO 14230-4, as on this 2005 1KD-FTV) triggers a slow protocol
  // search; 4 s is often too tight. Default higher here, overridable per run.
  const cmdTimeout = Number(process.env.CMD_TIMEOUT_MS) || DEFAULT_ADAPTER_CONFIG.commandTimeoutMs;
  const serialPath = resolveSerialPath();
  const baseTransport: Transport = USE_MOCK
    ? new MockTransport()
    : serialPath
      ? new SerialTransport({ path: serialPath, baudRate: SERIAL_BAUD, commandTimeoutMs: cmdTimeout })
      : new ElmWifiTransport({ host: HOST, port: PORT, commandTimeoutMs: cmdTimeout });
  // Wrap in the read-only guard (default ON for the watcher) so no write can
  // ever leave the laptop during a capture, whatever the protocol layer asks.
  const transport: Transport = withReadOnlyGuard(baseTransport, READ_ONLY);
  log.info(
    USE_MOCK
      ? `  transport: MOCK${READ_ONLY ? ' [read-only]' : ''}`
      : serialPath
        ? `  transport: USB serial ${serialPath} @ ${SERIAL_BAUD} baud${READ_ONLY ? ' [read-only]' : ''}`
        : `  transport: WiFi ${HOST}:${PORT}${READ_ONLY ? ' [read-only]' : ''}`,
  );

  // Always release the adapter's single client slot, even if the capture throws
  // partway through — otherwise a half-open socket lingers and blocks every
  // subsequent connection (the ELM327 clone accepts only one client at a time).
  try {
  await transport.open();
  const session = new ObdSession(transport);

  log.info('● adapter present — starting automatic capture');
  const init = await session.initialize(DEFAULT_ADAPTER_CONFIG.protocol);
  log.info(`  adapter=${init.adapterId} protocol=${init.protocol}`);

  // If auto-detect (ATSP0) didn't lock a real protocol — i.e. ATDP still says
  // AUTO/unknown — the ELM327 isn't actually talking to the ECU. Common on this
  // older K-line Toyota. Force-try candidate protocols until 0100 answers.
  const protocolLocked = /iso|can|j1850|kwp|9141|14230|15765/i.test(init.protocol);
  if (!protocolLocked) {
    const voltage = await session.raw('ATRV').catch(() => 'n/a');
    log.info(`  protocol not locked (ATDP=${init.protocol}); OBD-port voltage ATRV=${voltage}`);
    log.info(
      `  forcing protocol — trying ATSP ${PROTOCOL_CANDIDATES.join(',')} (K-line init x${KLINE_RETRIES}, manual ATSI/ATFI + ATKW0/ATAT0/ATSTFF)`,
    );
    const det = await session.tryProtocols(PROTOCOL_CANDIDATES, undefined, KLINE_RETRIES);
    if (det.protocol === 0) {
      throw new Error(
        `no OBD protocol answered 0100 (tried ${PROTOCOL_CANDIDATES.join(',')}). ` +
          `ATRV=${voltage}. Likely: ignition not in RUN / engine not running, or wrong protocol set. ` +
          `Raw attempts: ${det.attempts.map((a) => `SP${a.n}:${a.resp}`).join(' | ')}`,
      );
    }
    log.info(`  ✔ locked protocol ATSP${det.protocol} (${det.atdp})`);
  }

  // VIN (Mode 09 PID 02) is best-effort: many non-US / older diesels (incl. this
  // 1KD-FTV) don't answer it, and a timeout here must NOT abort the whole capture.
  let vin: string | undefined;
  try {
    vin = await session.readVin();
  } catch (err) {
    log.warn(`  VIN read skipped (${(err as Error).message})`);
  }
  const supportedDefs = await session.scanSupportedMode01();
  const supportedIds = new Set(supportedDefs.map((d) => d.id));
  log.info(`  ${supportedDefs.filter((d) => !d.isSupportBitmask).length} data PIDs supported`);

  // Timed snapshot series. We can't ask the user to press a key (no keyboard
  // attention guaranteed), so we capture a series and tell them when to rev.
  const snaps = [];
  for (let i = 0; i < SNAPSHOTS; i++) {
    const phase = i === 0 ? 'first sample (let it idle)' : i === Math.floor(SNAPSHOTS / 2) ? '>>> REV TO ~2500 RPM AND HOLD NOW <<<' : `sample ${i + 1}/${SNAPSHOTS}`;
    log.info(`  ${phase}`);
    snaps.push(await snapshot(session, supportedIds, `t=${i * SNAPSHOT_GAP_MS}ms ${i === Math.floor(SNAPSHOTS / 2) ? '(revving)' : ''}`.trim()));
    if (i < SNAPSHOTS - 1) await sleep(SNAPSHOT_GAP_MS);
  }

  log.info('  reading DTCs');
  const stored = await session.readDtcs(ObdMode.StoredDtc);
  const pending = await session.readDtcs(ObdMode.PendingDtc);

  log.info(`  Mode 22 sweep 0x${M22_START.toString(16)}–0x${M22_END.toString(16)}`);
  const hits: Array<{ pid: string; name?: string; rawHex: string }> = [];
  let missCount = 0;
  for (let pid = M22_START; pid <= M22_END; pid++) {
    const res = await session.probeMode22(pid);
    if (res) {
      const named = TOYOTA_ENHANCED_PIDS.find((p) => p.pid === pid);
      hits.push({ pid: `0x${pid.toString(16).toUpperCase().padStart(4, '0')}`, name: named?.name, rawHex: res.rawHex });
    } else missCount++;
  }

  const capture = {
    meta: { tool: 'pradoobd-watch', stampIso: stamp, mock: USE_MOCK, host: HOST, port: PORT },
    adapter: { id: init.adapterId, protocol: init.protocol },
    vin,
    supported: supportedDefs.filter((d) => !d.isSupportBitmask).map((d) => ({ id: d.id, name: d.name })),
    snapshots: snaps,
    dtcs: [...stored, ...pending].map((d) => ({ code: d.code, kind: d.kind })),
    mode22: { range: `0x${M22_START.toString(16)}-0x${M22_END.toString(16)}`, hits, missCount },
  };

  const base = path.join(dir, `prado-capture-${stamp}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify(capture, null, 2));
  fs.writeFileSync(`${base}.md`, renderMarkdown(capture));
  log.info(`✔ capture written: ${base}.md  (reconnect to internet; Claude will read it)`);
  } finally {
    await transport.close();
  }
}

function renderMarkdown(c: {
  meta: { stampIso: string; mock: boolean; host: string; port: number };
  adapter: { id: string; protocol: string };
  vin?: string;
  supported: Array<{ id: string; name: string }>;
  snapshots: Array<{ label: string; values: Array<{ id: string; name: string; unit: string; value: number | null; text?: string; rawHex: string }> }>;
  dtcs: Array<{ code: string; kind: string }>;
  mode22: { range: string; hits: Array<{ pid: string; name?: string; rawHex: string }>; missCount: number };
}): string {
  const L: string[] = [];
  L.push(`# Prado OBD auto-capture — ${c.meta.stampIso}${c.meta.mock ? ' (MOCK)' : ''}`, '');
  L.push(`- Adapter: \`${c.adapter.id}\``, `- Protocol: \`${c.adapter.protocol}\``, `- VIN: \`${c.vin ?? '(not read)'}\``, '');
  L.push(`## Supported standard PIDs (${c.supported.length})`, c.supported.map((p) => `\`${p.id}\` ${p.name}`).join(' · ') || '_none_', '');
  for (const s of c.snapshots) {
    L.push(`## Snapshot — ${s.label}`, '| PID | Name | Value | Unit | Raw |', '| --- | --- | --- | --- | --- |');
    for (const v of s.values) {
      const shown = v.value == null ? (v.text ?? '—') : Number.isInteger(v.value) ? v.value : v.value.toFixed(2);
      L.push(`| \`${v.id}\` | ${v.name} | ${shown} | ${v.unit} | \`${v.rawHex}\` |`);
    }
    L.push('');
  }
  L.push(`## Trouble codes (${c.dtcs.length})`);
  L.push(c.dtcs.length ? c.dtcs.map((d) => `- **${d.code}** (${d.kind})`).join('\n') : '_none_', '');
  L.push(`## Mode 22 prober — ${c.mode22.range} (${c.mode22.hits.length} hits, ${c.mode22.missCount} rejected)`, '| ID | Candidate | Raw |', '| --- | --- | --- |');
  for (const h of c.mode22.hits) L.push(`| \`${h.pid}\` | ${h.name ?? '_unnamed_'} | \`${h.rawHex}\` |`);
  return L.join('\n');
}

// --- watcher state machine -------------------------------------------------

let captureCount = 0;

// Gap between the reachability probe socket closing and the capture socket
// opening, so the single-client adapter can free its slot between the two.
const SETTLE_MS = 1000;
// After a failed capture, back off this long before retrying. A reset usually
// means the adapter's one socket slot is jammed (e.g. an abrupt WiFi switch left
// it half-open); it needs ~tens of seconds to time out. Hammering every POLL_MS
// just keeps it jammed.
const FAIL_BACKOFF_MS = Number(process.env.FAIL_BACKOFF_MS) || 20000;

async function tick(state: { phase: 'waiting' | 'present' | 'captured' }): Promise<void> {
  const reachable = await adapterReachable();

  if (state.phase === 'waiting' && reachable) {
    state.phase = 'present';
    await sleep(SETTLE_MS);
    const stamp = isoStamp();
    try {
      await runCapture(stamp);
      captureCount++;
      state.phase = 'captured';
    } catch (err) {
      log.error('capture failed:', (err as Error).message);
      log.info(`  backing off ${Math.round(FAIL_BACKOFF_MS / 1000)}s to let the adapter recover…`);
      state.phase = 'waiting'; // re-arm; maybe a transient connect blip
      await sleep(FAIL_BACKOFF_MS);
    }
  } else if (state.phase === 'captured' && !reachable) {
    // Adapter went away — re-arm so a replug / next connection captures again.
    log.info('adapter disconnected — re-armed, waiting for next connection');
    state.phase = 'waiting';
  } else if (state.phase === 'waiting') {
    log.debug(`waiting for adapter at ${HOST}:${PORT}…`);
  }
}

/** Date is fine here — plain Node script, not a workflow sandbox. */
function isoStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main(): Promise<void> {
  console.log('\n=== Prado OBD auto-capture watcher ===');
  if (USE_MOCK) {
    console.log('MODE: MOCK (simulated Prado — captures immediately)');
  } else {
    const serialPath = resolveSerialPath();
    if (serialPath) {
      console.log(`Watching for USB adapter at ${serialPath} @ ${SERIAL_BAUD} baud${fs.existsSync(serialPath) ? ' (present)' : ' (waiting for plug-in)'}`);
      console.log('Plug in the USB OBD adapter (attach it to Linux in ChromeOS first). No WiFi switch needed.');
    } else {
      console.log(`Watching for WiFi adapter at ${HOST}:${PORT} (no USB adapter detected)`);
      console.log('Plug in the adapter, join its WiFi, and rev when prompted.');
    }
  }
  console.log('A capture runs automatically each time the adapter becomes reachable.');
  console.log(
    READ_ONLY
      ? 'SAFETY: READ-ONLY mode is ON — vehicle writes (clear DTCs, active tests, ECU reset, reflash) are refused.\n'
      : 'SAFETY: READ-ONLY mode is OFF — vehicle writes are allowed. (Set READ_ONLY=1 to forbid them.)\n',
  );

  const state = { phase: 'waiting' as 'waiting' | 'present' | 'captured' };
  // In mock mode, do one capture and exit so it's easy to verify.
  if (USE_MOCK) {
    await runCapture(isoStamp());
    console.log('\n(mock) one capture done — exiting.');
    return;
  }
  // Real mode: poll forever until the process is stopped.
  for (;;) {
    await tick(state);
    await sleep(POLL_MS);
  }
}

main().catch((err) => {
  log.error('watcher crashed:', (err as Error).message);
  process.exit(1);
});
