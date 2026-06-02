# Context handoff for a fresh Claude session (read me first)

If you are a Claude Code session starting fresh on this machine: this file is
your onboarding. Read it, then `README.md`, then the other `docs/`.

## What this project is

A bespoke web-based OBD-II diagnostic tool for **Pierre's 2005 Toyota Land
Cruiser Prado (120-series, 1KD-FTV 3.0L D-4D diesel)**, driving a generic
**ELM327 WiFi** adapter (default `192.168.0.10:35000`) from Chrome.

Built as an extensible **OBD platform**: the adapter sits behind a `Transport`
interface (`packages/server/src/transport/Transport.ts`) so future
J2534/DoIP/UDS-coding hardware can be added without touching the UI, protocol, or
decoders. The user is a pro developer and wants depth.

## The operating model: Claude is the mechanic (Option A)

The user does NOT want to click around the dashboard. **You do the diagnostic
thinking; the user is your hands/eyes at the car.** Because the laptop must join
the adapter's no-internet WiFi to reach the ELM327, live chat drops during a
session. So the workflow is offline-capture-then-discuss:

1. User runs `npm run capture` at the car (on adapter WiFi, ignition on).
2. It writes `captures/prado-<stamp>.md` + `.json` (full diagnostic).
3. User reconnects to internet and pastes the `.md` into chat.
4. You read the RAW bytes, interpret, diagnose, and either explain findings or
   request another capture with specific parameters.

Full detail: `docs/CONSULTANCY-WORKFLOW.md`. Physical setup: `docs/AT-THE-CAR.md`.

## The advanced goal: reverse-engineer Toyota Mode 22 PIDs

A 2005 AU diesel predates standardized OBD-II, so many generic Mode 01 PIDs
return NO DATA, and the good stuff (boost, common-rail pressure, EGR position,
injector correction, VNT vane) lives behind **manufacturer Mode 22** identifiers
that are NOT publicly standardized.

⚠️ **The Toyota PID list and scalings in `packages/shared/src/toyota.ts` and the
decoders in `packages/server/src/decoders/toyota.ts` are PROVISIONAL** —
community-derived guesses marked `confidence: 'assumed' | 'unknown'`. Do not
trust a decoded enhanced value until it's confirmed empirically.

The method: a capture's Mode 22 sweep finds which IDs the ECU answers (with raw
bytes). Ask the user for PAIRED captures (idle vs. rev, cold vs. warm); watch
which raw bytes move and by how much; derive the scaling; then commit a confirmed
decoder + PID definition so it auto-decodes in future captures and the live UI.
This is the genuinely bespoke payoff.

## Architecture / where things live

```
packages/
  shared/   @pradoobd/shared — types, WS message contract, PID tables, DTC decode
            src/obd.ts (standard PIDs), src/toyota.ts (Mode 22 seed list, PROVISIONAL),
            src/protocol.ts (WS contract), src/dtc.ts
  server/   @pradoobd/server — the bridge
            src/transport/   Transport interface + ElmWifiTransport + MockTransport
            src/protocol/    ObdSession.ts (init/scan/DTC/VIN/live/Mode22 probe), hex.ts
            src/decoders/    standard.ts (SAE J1979), toyota.ts (PROVISIONAL Mode 22)
            src/bridge/      BridgeSession.ts (WS client <-> ObdSession)
            src/index.ts     HTTP + WS server, serves built UI
            src/capture.ts   offline capture runner (npm run capture)
  web/      @pradoobd/web — Vite + React + TS dashboard (mobile-first)
            src/useObd.ts    the single WS hook (owns connection + state)
            src/panels/      Connection, Live, Dtc, Probe, Terminal
```

## Run / verify commands (YOU run these — the user never uses the terminal)

The primary target machine is a **Chromebook (ChromeOS) running Linux via
Crostini** — a Debian container. Use bash, not PowerShell. See
`docs/CHROMEBOOK.md` for the container/networking specifics.

```bash
npm install                            # after a clone
npm run build                          # build all three packages
npm run watch                          # AUTO-CAPTURE WATCHER — the main at-the-car
                                       #   tool. Start it BEFORE the user goes to the
                                       #   car / offline. Run in the background.
npm run watch:mock                     # rehearse the watcher (captures once, exits)
npm run capture                        # one-shot INTERACTIVE capture (keyboard prompts)
npm run capture:mock                   # rehearse interactive capture
npm start                              # production: bridge serves UI+WS on :8080
npm run dev:server & npm run dev:web   # dev (UI :5173) — see CHROMEBOOK.md for the
                                       #   ChromeOS port-forwarding caveat
MOCK=1 <any of the above>              # simulated Prado
node packages/server/smoke-test.mjs    # WS end-to-end smoke test
```

The user mostly works in "Claude mechanic chat" mode and rarely opens the browser
UI; the watcher + capture files are the main path. The browser UI is optional.

## Known gotchas (already handled — don't regress)

- **Browser↔bridge in dev** connects DIRECTLY to `:8080` (not via Vite proxy),
  pinned by `packages/web/.env` → `VITE_WS_URL=ws://localhost:8080/ws`. This
  avoids a flaky Vite WS proxy on Windows. Production (`npm start`) serves UI and
  WS same-origin on `:8080`, so the env var is ignored there.
- **React 18 StrictMode** double-mounts the connection effect in dev; `useObd.ts`
  guards teardown so it never calls `close()` on a still-CONNECTING socket (that
  threw "WebSocket is closed before the connection is established"). Keep those
  `if (closed) return` guards.
- The ELM327 is one-command-at-a-time; `ElmWifiTransport` serializes sends via an
  internal queue and frames responses on the `>` prompt. Don't parallelize sends.

## State of things (as of handoff)

- Full scaffold built, typechecks, builds, and passes the WS smoke test in mock.
- NOT yet tested against the real car — the next step is the user's first live
  `npm run capture` at the Prado.
- No Toyota Mode 22 PID is confirmed yet — all provisional.
