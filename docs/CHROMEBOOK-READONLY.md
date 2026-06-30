# Chromebook safe-read step (read-only)

This is the **safe, can't-hurt-the-car** step you run on the Chromebook **before**
moving to the Windows laptop + Techstream. It uses our existing ELM327 app in a
hard-enforced **read-only** mode.

## What this step is — and what it is NOT

- **IS:** a safe dry-run that connects our app to the ELM327 **WiFi** adapter and
  reads everything the **engine ECU** will give over generic OBD (live PIDs, DTCs,
  Mode 22 sweep), with every write to the car blocked at the source.
- **IS NOT:** a way to read the **A/C ECU**, ABS, SRS, or to run active tests.
  Generic OBD only reaches the engine ECU. The aircon diagnosis needs **Techstream
  on the Windows laptop** — see `docs/TECHSTREAM-WINDOWS.md`.
- **The Mini-VCI cable is NOT used here.** It is a J2534 cable that only Techstream
  (Windows) can drive; nothing on the Chromebook/Linux can talk to it. This step
  uses the **ELM327 WiFi** adapter only.

> **Honest expectation:** the June 2026 at-the-car sessions proved this specific
> ELM327 WiFi clone **cannot initialise this 2005 1KD-FTV's K-line** (`BUS INIT:
> ERROR` on every protocol). So this read-only run will most likely report **no
> ECU data** — and that's fine. Its value is (a) a clean, safe re-confirmation
> with the new safety guard in place, and (b) it costs almost nothing to try. The
> real data comes from Techstream on Windows.

## The safety guarantee (how "read-only" is enforced)

Every command to the car funnels through one method — `Transport.send()`. In
read-only mode a guard (`packages/server/src/transport/ReadOnlyGuard.ts`) inspects
each command via the shared classifier (`packages/shared/src/safety.ts`) and
**throws before it reaches the wire** if it would change vehicle state:

| Blocked (vehicle writes) | OBD/UDS service |
| --- | --- |
| Clear DTCs / reset monitors | `04` |
| Input/Output control (force actuators) | `2F` |
| **Routine control — active tests** | `31` |
| Write Data By Identifier | `2E`, `3B` |
| Write Memory By Address | `3D` |
| Security Access (unlock writes) | `27` |
| ECU Reset | `11` |
| Control DTC Setting | `85` |
| Reflash (download/upload/transfer) | `34`–`38` |
| Communication Control | `28` |

Allowed (reads): `01`/`02` (live + freeze frame), `03`/`07`/`0A` (DTCs), `09`
(VIN), `22` (Toyota enhanced read), `19`/`3E`, and all `AT…`/`ST…` adapter-config
commands (these configure the ELM327, not the car). Anything unrecognised is
treated as a write and refused (fail-safe).

The guard is **defense-in-depth**: even typing `04` in the Terminal panel, or a
stray bridge call, is stopped. The watcher and one-shot capture default the guard
**ON**; the browser bridge defaults it **ON** too (and hides the Clear-DTCs
button).

## How to run it (Claude drives; you barely touch the keyboard)

The flow mirrors the normal at-the-car flow (`docs/AT-THE-CAR.md`), because the
safe-read tool **is** the watcher with read-only forced on.

1. **Before you go offline**, while the laptop still has internet, Claude starts:
   ```bash
   npm run safe-read        # = watcher, READ_ONLY=1 forced ON
   ```
   (Rehearse anytime with `npm run safe-read:mock` — captures once against the
   simulated Prado and exits.)
2. You drive to the car, plug in the **ELM327 WiFi** adapter, turn the ignition to
   RUN (engine running for live data), and join the adapter's WiFi. You run
   nothing.
3. The watcher auto-detects the adapter and runs one full **read-only** capture,
   printing `>>> REV TO ~2500 RPM AND HOLD NOW <<<` partway through. It writes
   `captures/prado-capture-<stamp>.{json,md}`.
4. You switch the laptop back to normal internet and tell Claude "done."
5. Claude reads `captures/*.md` (newest) and interprets the raw bytes.

If the capture errors with `no OBD protocol answered 0100 …`, that's the expected
K-line-clone wall — it confirms we need Techstream/Windows, and nothing was
written to the car.

## Env knobs (Claude sets these; you don't)

Same as the watcher (`ELM_HOST`, `ELM_PORT`, `PROTOCOLS`, `MODE22_START/END`,
etc. — see `packages/server/src/watch.ts`), plus:

- `READ_ONLY=1` — forced on by `safe-read`. You can also set `READ_ONLY=1` in
  front of `npm run watch`, `npm run capture`, or `npm start` to guard those.
- `READ_ONLY=0` — explicitly **allow** writes (only ever needed on Windows when
  you deliberately want to clear a code via our app; never for the Chromebook).
