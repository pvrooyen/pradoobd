# CLAUDE.md — instructions for Claude Code sessions in this repo

**Read `docs/CLAUDE-CONTEXT.md` first.** It is the full handoff: what this project
is, how we work, and where everything lives. This file is the short version.

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

## Commands

```
npm install · npm run build · npm start (UI+WS :8080)
npm run dev:server + npm run dev:web (dev, UI :5173)
$env:MOCK="1" prefix → simulated Prado
npm run capture / capture:mock → offline diagnostic
node packages/server/smoke-test.mjs → WS smoke test
```

## Conventions (from the user's global rules)

- Communicate in English; code comments and strings in English.
- Before destructive/outward-facing actions (pushing, deleting, external sends),
  confirm with the user first.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
