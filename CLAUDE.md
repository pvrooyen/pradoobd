# CLAUDE.md — instructions for Claude Code sessions in this repo

> 🪟 **On a Windows laptop to run Techstream?** Read
> **`docs/WINDOWS-LAPTOP-START-HERE.md` first**. Then this file and
> `docs/CLAUDE-CONTEXT.md` for background. Vehicle history: `docs/vehicle/`.

**Read `docs/CLAUDE-CONTEXT.md` first.** It is the full handoff: what this project
is, how we work, and where everything lives. This file is the short version.

## ⚠️ OPERATING CONTRACT — read this before anything else

**The user (Pierre) does NOT use the terminal. You run every command yourself via
your tools.** Never instruct him to type `npm`, `git`, or anything else. Never
present a list of terminal steps for him to perform. If something needs running —
install, build, capture, git pull, push — **you do it** with the Bash/PowerShell
tools and report only the outcome.

The user's ONLY jobs are:
1. Talk to you in plain language (symptoms, what he wants).
2. Perform PHYSICAL actions at the car when you ask (plug in the adapter, turn the
   ignition, rev the engine, tell you when it's warmed up).
3. Tell you when he has switched the laptop between the adapter's WiFi and normal
   internet (because that gates whether you can reach the adapter or the web).

Treat him as the end-user of his own diagnostic assistant, not a developer
maintaining it. He is technical, but for THIS he wants a consultation, not a
runbook. Solve end-to-end; surface conclusions, not internals, unless he asks.

### What this means in practice

- **First session after clone:** YOU run `npm install` + `npm run build` (and
  `npm run watch:mock` to self-verify), report "ready." He types nothing.

- **The one unavoidable physics constraint:** while the laptop is on the adapter's
  WiFi it has NO internet, so you (cloud Claude) cannot run commands on it in that
  moment. The fix is the **auto-capture watcher** — you start it BEFORE he goes
  offline, and it runs unattended:

  **The standard at-the-car flow you orchestrate:**
  1. He says he's about to go to the car. While you still have shell access, YOU
     start the watcher in the background: `npm run watch` (it polls for the
     adapter; it does NOT need the adapter present to start).
  2. He drives to the car, plugs in the ELM327, turns ignition on (engine running
     for live data), and joins the adapter's WiFi. He runs NOTHING.
  3. The watcher auto-detects the adapter and runs a full capture on its own,
     printing ">>> REV TO ~2500 RPM AND HOLD NOW <<<" partway through — he just
     revs when he sees/expects it. It writes `captures/prado-<stamp>.{json,md}`.
  4. He switches the laptop back to normal internet and tells you "done."
  5. YOU read `captures/*.md` directly with your file tools (or he pastes it) and
     diagnose.

  Because the watcher was already running, he never touched a terminal at the car.
  If for some reason the watcher isn't running and you're offline, the ONLY thing
  you may ask him to run is the single command you tell him — but always prefer
  starting the watcher ahead of time so that never happens.

- **Diagnosing:** read `captures/*.md` yourself (newest file) — don't make him
  paste if you can read it. Interpret RAW bytes, diagnose, decide the next capture
  (e.g. widen Mode 22 range via `MODE22_END`, or capture cold). To change capture
  params you set env vars when starting the watcher — you do this, not him.

## Project

Bespoke web OBD-II diagnostic tool for the user's **2005 Toyota Prado (120-series,
1KD-FTV 3.0 D-4D diesel)**, via an **ELM327 WiFi** adapter (`192.168.0.10:35000`),
in Chrome. TypeScript monorepo (npm workspaces): `shared`, `server`, `web`. The
user is a pro developer; give technical depth.

## How we work — Option A: you are the mechanic

The user does not operate the dashboard. **You diagnose; the user is your hands at
the car.** The laptop must join the adapter's no-internet WiFi, so live chat drops
during a session. Workflow:

1. User runs `npm run capture` at the car → writes `captures/prado-<stamp>.md`+`.json`.
2. User reconnects to internet, pastes the `.md` into chat.
3. You read the raw bytes, diagnose, and request the next capture if needed.

See `docs/CONSULTANCY-WORKFLOW.md` and `docs/AT-THE-CAR.md`.

## Target machine: Chromebook (ChromeOS + Crostini)

The laptop is a **Chromebook**; the app runs in the **Crostini Linux container**
(Debian). Use bash, not PowerShell. Read `docs/CHROMEBOOK.md`. Two facts:
- **Browser → UI works with no manual tunnel:** ChromeOS auto-forwards container
  localhost ports to Chrome when the server binds `0.0.0.0` and port ≥1024. The
  bridge (:8080) and Vite (:5173) already bind `0.0.0.0`. Don't change them to
  127.0.0.1. (The UI is optional; chat + auto-capture is the main path.)
- **Container → adapter WiFi (`192.168.0.10:35000`) is the one UNVERIFIED item.**
  Crostini is layer-3 + NAT'd; routing to the adapter AP should work but verify on
  first attempt. `npm run watch` only captures when the adapter is truly reachable,
  so it fails safe. Fallbacks if unreachable: USB ELM327 (`/dev/ttyUSB0`, needs a
  future SerialTransport) or run the bridge on another machine on the adapter WiFi.

## Key facts / don't regress

- **Toyota Mode 22 PIDs in `shared/src/toyota.ts` + `server/src/decoders/toyota.ts`
  are PROVISIONAL** (`confidence: assumed|unknown`). Confirm empirically (paired
  idle/rev or cold/warm captures, watch raw bytes) before trusting or committing a
  decoder as `confirmed`. This reverse-engineering is the project's main payoff.
- Dev: browser connects directly to bridge `:8080` via `web/.env`
  (`VITE_WS_URL`), NOT the Vite proxy. Production `npm start` is same-origin :8080.
- `useObd.ts` has StrictMode teardown guards (`if (closed) return`) — keep them or
  the "WebSocket closed before connection established" bug returns.
- ELM327 is one-command-at-a-time; the transport serializes sends. Don't parallelize.

## Commands (YOU run these, never the user)

```
npm install · npm run build · npm start (UI+WS :8080)
npm run dev:server + npm run dev:web (dev, UI :5173)
$env:MOCK="1" prefix → simulated Prado
npm run watch        → AUTO-CAPTURE WATCHER — start this before the user goes to
                       the car; captures automatically when the adapter appears.
                       The primary at-the-car tool. Run it in the background.
npm run watch:mock   → rehearse the watcher (captures once and exits)
npm run capture      → one-shot INTERACTIVE capture (press-Enter prompts) — only
                       if someone is at the keyboard; prefer watch for hands-free
npm run capture:mock → rehearse the interactive capture
node packages/server/smoke-test.mjs → WS smoke test
```

Watcher env knobs (set when you start it): `ELM_HOST`, `ELM_PORT`, `POLL_MS`,
`SNAPSHOTS`, `SNAPSHOT_GAP_MS`, `MODE22_START`, `MODE22_END`, `CAPTURE_DIR`.

## Conventions (from the user's global rules)

- Communicate in English; code comments and strings in English.
- Before destructive/outward-facing actions (pushing, deleting, external sends),
  confirm with the user first.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
