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
 *   ELM_HOST / ELM_PORT   adapter address (default 192.168.0.10:35000)
 *   MOCK=1                rehearse against the simulated Prado
 *   POLL_MS               adapter poll interval (default 3000)
 *   SNAPSHOTS             how many timed snapshots per capture (default 6)
 *   SNAPSHOT_GAP_MS       gap between snapshots (default 5000)
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
import { MockTransport } from './transport/MockTransport.js';
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

/** Is the adapter reachable right now? (Quick TCP connect probe.) */
function adapterReachable(): Promise<boolean> {
  if (USE_MOCK) return Promise.resolve(true);
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (ok: boolean) => {
      sock.removeAllListeners();
      sock.destroy();
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

  const transport: Transport = USE_MOCK
    ? new MockTransport()
    : new ElmWifiTransport({ host: HOST, port: PORT, commandTimeoutMs: DEFAULT_ADAPTER_CONFIG.commandTimeoutMs });

  await transport.open();
  const session = new ObdSession(transport);

  log.info('● adapter present — starting automatic capture');
  const init = await session.initialize(DEFAULT_ADAPTER_CONFIG.protocol);
  log.info(`  adapter=${init.adapterId} protocol=${init.protocol}`);
  const vin = await session.readVin();
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
  await transport.close();
  log.info(`✔ capture written: ${base}.md  (reconnect to internet; Claude will read it)`);
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

async function tick(state: { phase: 'waiting' | 'present' | 'captured' }): Promise<void> {
  const reachable = await adapterReachable();

  if (state.phase === 'waiting' && reachable) {
    state.phase = 'present';
    const stamp = isoStamp();
    try {
      await runCapture(stamp);
      captureCount++;
      state.phase = 'captured';
    } catch (err) {
      log.error('capture failed:', (err as Error).message);
      state.phase = 'waiting'; // re-arm; maybe a transient connect blip
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
  console.log(USE_MOCK ? 'MODE: MOCK (simulated Prado — captures immediately)' : `Watching for adapter at ${HOST}:${PORT}`);
  console.log('The user only needs to: plug in the adapter, join its WiFi, and rev when prompted.');
  console.log('A capture runs automatically each time the adapter becomes reachable.\n');

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
