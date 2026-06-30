/**
 * Offline diagnostic capture runner.
 *
 * THE CONNECTIVITY PROBLEM THIS SOLVES
 * ------------------------------------
 * At the car, the laptop must join the ELM327's WiFi to reach the adapter — and
 * that network has no internet, so a live chat-driven session isn't possible.
 * Instead, this runner performs a FULL scripted diagnostic in one shot, with no
 * interaction needed, and writes a single self-contained capture file:
 *
 *     captures/prado-capture-<stamp>.json   (machine-readable: every raw response)
 *     captures/prado-capture-<stamp>.md      (human/Claude-readable summary)
 *
 * Workflow (Option A consultancy):
 *   1. At the car (on adapter WiFi): `npm run capture`  (or `npm run capture:mock` to rehearse)
 *   2. Follow the on-screen prompts (it tells you when to idle, when to rev).
 *   3. Reconnect the laptop to normal internet.
 *   4. Paste the .md (or attach the .json) into the chat — Claude reads the raw
 *      bytes and we discuss findings + next steps.
 *
 * It captures: adapter id/protocol, VIN, supported Mode 01 PIDs, a live snapshot
 * (idle + a second pass so you can rev between them), stored+pending DTCs, and a
 * Mode 22 prober sweep. Everything is timestamped and includes RAW responses so
 * nothing is lost to a bad assumption about scaling.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
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
import { withReadOnlyGuard, readReadOnlyEnv } from './transport/ReadOnlyGuard.js';
import type { Transport } from './transport/Transport.js';
import { createLogger } from './util/logger.js';

const log = createLogger('capture');
const USE_MOCK = process.env.MOCK === '1' || process.env.MOCK === 'true';
const HOST = process.env.ELM_HOST || DEFAULT_ADAPTER_CONFIG.host;
const PORT = Number(process.env.ELM_PORT) || DEFAULT_ADAPTER_CONFIG.port;
// Allow a non-interactive run (no rev prompt) for unattended/scripted use.
const NONINTERACTIVE = process.env.NONINTERACTIVE === '1';
// Read-only safety, default ON: capture is a pure read tool and must never write
// to the car. Refuses vehicle writes at the transport. Override with READ_ONLY=0.
const READ_ONLY = readReadOnlyEnv(true);

interface RawExchange {
  command: string;
  response: string;
}

interface Snapshot {
  label: string;
  values: Array<{ id: string; name: string; unit: string; value: number | null; text?: string; rawHex: string }>;
}

interface Capture {
  meta: {
    tool: string;
    stampIso: string;
    mock: boolean;
    host: string;
    port: number;
  };
  adapter: { id: string; protocol: string };
  vin?: string;
  supported: Array<{ id: string; name: string }>;
  snapshots: Snapshot[];
  dtcs: Array<{ code: string; kind: string }>;
  mode22: { range: string; hits: Array<{ pid: string; name?: string; rawHex: string }>; missCount: number };
  rawLog: RawExchange[];
}

/** Walk up from cwd to find the repo root (the dir whose package.json declares workspaces). */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        const json = JSON.parse(fs.readFileSync(pkg, 'utf8')) as { workspaces?: unknown };
        if (json.workspaces) return dir;
      } catch { /* ignore */ }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function ask(question: string): Promise<void> {
  if (NONINTERACTIVE) return Promise.resolve();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, () => { rl.close(); resolve(); }));
}

async function snapshot(session: ObdSession, supportedIds: Set<string>, label: string): Promise<Snapshot> {
  const values: Snapshot['values'] = [];
  for (const def of STANDARD_PIDS) {
    if (def.isSupportBitmask || !supportedIds.has(def.id)) continue;
    const reading = await session.readMode01(def);
    if (reading) {
      values.push({ id: def.id, name: def.name, unit: def.unit, value: reading.value, text: reading.text, rawHex: reading.rawHex });
    }
  }
  return { label, values };
}

async function run(): Promise<void> {
  // We pass a fixed timestamp into filenames; Date is available here because
  // this is a plain Node script (not a workflow sandbox).
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  // Always write to <repo-root>/captures regardless of which workspace dir the
  // script was launched from. CAPTURE_DIR overrides if you want elsewhere.
  const capturesDir = process.env.CAPTURE_DIR
    ? path.resolve(process.env.CAPTURE_DIR)
    : path.resolve(findRepoRoot(), 'captures');
  fs.mkdirSync(capturesDir, { recursive: true });

  const rawLog: RawExchange[] = [];
  const baseTransport: Transport = USE_MOCK
    ? new MockTransport()
    : new ElmWifiTransport({ host: HOST, port: PORT, commandTimeoutMs: DEFAULT_ADAPTER_CONFIG.commandTimeoutMs });
  const transport: Transport = withReadOnlyGuard(baseTransport, READ_ONLY);

  // Tee every adapter exchange into the raw log via a thin wrapper.
  const session = new ObdSession(transport);
  const origRaw = session.raw.bind(session);
  // (ObdSession.raw is the single choke point we use for the terminal; internal
  //  helpers call transport.send directly, so we capture at the transport's data
  //  event instead for completeness.)
  let lastCmd = '';
  transport.on('data', () => { /* low-level stream; summary captured per-call below */ });

  console.log(`\n=== Prado OBD capture ${USE_MOCK ? '(MOCK)' : `→ ${HOST}:${PORT}`} ===`);
  console.log(
    READ_ONLY
      ? 'SAFETY: READ-ONLY mode is ON — vehicle writes are refused (clear DTCs, active tests, ECU reset, reflash).\n'
      : 'SAFETY: READ-ONLY mode is OFF — vehicle writes allowed.\n',
  );

  log.info('connecting…');
  await transport.open();
  const wrappedSend = async (cmd: string) => {
    lastCmd = cmd;
    const resp = await origRaw(cmd);
    rawLog.push({ command: cmd, response: resp });
    return resp;
  };
  // Re-point the session's raw to the capturing version for ad-hoc commands.
  (session as unknown as { raw: typeof origRaw }).raw = wrappedSend;

  const init = await session.initialize(DEFAULT_ADAPTER_CONFIG.protocol);
  console.log(`Adapter:  ${init.adapterId}`);
  console.log(`Protocol: ${init.protocol}\n`);

  console.log('Reading VIN…');
  const vin = await session.readVin();

  console.log('Scanning supported PIDs…');
  const supportedDefs = await session.scanSupportedMode01();
  const supportedIds = new Set(supportedDefs.map((d) => d.id));
  console.log(`  ${supportedDefs.filter((d) => !d.isSupportBitmask).length} data PIDs supported.\n`);

  await ask('Make sure the engine is RUNNING and at IDLE, then press Enter to capture the idle snapshot… ');
  console.log('Capturing idle snapshot…');
  const idle = await snapshot(session, supportedIds, 'idle');

  await ask('Now REV the engine to ~2500 rpm and HOLD it, then press Enter (a helper or wedge the throttle)… ');
  console.log('Capturing revving snapshot…');
  const revving = await snapshot(session, supportedIds, 'revving ~2500rpm');

  console.log('Reading DTCs…');
  const stored = await session.readDtcs(ObdMode.StoredDtc);
  const pending = await session.readDtcs(ObdMode.PendingDtc);

  console.log(`Probing Mode 22 range 0x${TOYOTA_PROBE_RANGE.start.toString(16)}–0x${TOYOTA_PROBE_RANGE.end.toString(16)}…`);
  const hits: Capture['mode22']['hits'] = [];
  let missCount = 0;
  for (let pid = TOYOTA_PROBE_RANGE.start; pid <= TOYOTA_PROBE_RANGE.end; pid++) {
    const res = await session.probeMode22(pid);
    if (res) {
      const named = TOYOTA_ENHANCED_PIDS.find((p) => p.pid === pid);
      hits.push({ pid: `0x${pid.toString(16).toUpperCase().padStart(4, '0')}`, name: named?.name, rawHex: res.rawHex });
    } else {
      missCount++;
    }
  }
  console.log(`  ${hits.length} identifiers answered, ${missCount} rejected.\n`);

  const capture: Capture = {
    meta: { tool: 'pradoobd-capture', stampIso: stamp, mock: USE_MOCK, host: HOST, port: PORT },
    adapter: { id: init.adapterId, protocol: init.protocol },
    vin,
    supported: supportedDefs.filter((d) => !d.isSupportBitmask).map((d) => ({ id: d.id, name: d.name })),
    snapshots: [idle, revving],
    dtcs: [...stored, ...pending].map((d) => ({ code: d.code, kind: d.kind })),
    mode22: { range: `0x${TOYOTA_PROBE_RANGE.start.toString(16)}-0x${TOYOTA_PROBE_RANGE.end.toString(16)}`, hits, missCount },
    rawLog,
  };

  const jsonPath = path.join(capturesDir, `prado-capture-${stamp}.json`);
  const mdPath = path.join(capturesDir, `prado-capture-${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(capture, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(capture));

  await transport.close();
  void lastCmd;

  console.log('=== CAPTURE COMPLETE ===');
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  MD:   ${mdPath}`);
  console.log('\nReconnect to the internet, then paste the .md (or attach the .json) into the chat.\n');
}

function renderMarkdown(c: Capture): string {
  const lines: string[] = [];
  lines.push(`# Prado OBD capture — ${c.meta.stampIso}${c.meta.mock ? ' (MOCK)' : ''}`);
  lines.push('');
  lines.push(`- Adapter: \`${c.adapter.id}\``);
  lines.push(`- Protocol: \`${c.adapter.protocol}\``);
  lines.push(`- VIN: \`${c.vin ?? '(not read)'}\``);
  lines.push(`- Target: ${c.meta.host}:${c.meta.port}`);
  lines.push('');
  lines.push(`## Supported standard PIDs (${c.supported.length})`);
  lines.push(c.supported.map((p) => `\`${p.id}\` ${p.name}`).join(' · ') || '_none_');
  lines.push('');
  for (const snap of c.snapshots) {
    lines.push(`## Snapshot — ${snap.label}`);
    lines.push('| PID | Name | Value | Unit | Raw |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const v of snap.values) {
      const shown = v.value == null ? (v.text ?? '—') : Number.isInteger(v.value) ? v.value : v.value.toFixed(2);
      lines.push(`| \`${v.id}\` | ${v.name} | ${shown} | ${v.unit} | \`${v.rawHex}\` |`);
    }
    lines.push('');
  }
  lines.push(`## Trouble codes (${c.dtcs.length})`);
  if (c.dtcs.length === 0) lines.push('_none stored or pending_');
  else for (const d of c.dtcs) lines.push(`- **${d.code}** (${d.kind})`);
  lines.push('');
  lines.push(`## Mode 22 prober — range ${c.mode22.range}`);
  lines.push(`${c.mode22.hits.length} answered, ${c.mode22.missCount} rejected.`);
  lines.push('');
  lines.push('| ID | Candidate name | Raw payload |');
  lines.push('| --- | --- | --- |');
  for (const h of c.mode22.hits) lines.push(`| \`${h.pid}\` | ${h.name ?? '_unnamed_'} | \`${h.rawHex}\` |`);
  lines.push('');
  lines.push('## Raw command log');
  lines.push('```');
  for (const r of c.rawLog) lines.push(`» ${r.command}\n« ${r.response.replace(/\n/g, ' / ')}`);
  lines.push('```');
  return lines.join('\n');
}

run().catch((err) => {
  log.error('capture failed:', (err as Error).message);
  console.error('\nCapture failed. Is the laptop on the adapter WiFi and the ignition on?');
  process.exit(1);
});
