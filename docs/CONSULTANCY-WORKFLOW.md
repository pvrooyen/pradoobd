# The consultancy workflow (Option A) — Claude as the mechanic

This describes how we work together: **Claude does the diagnostic thinking and
issues the exact OBD commands; you are the hands and eyes at the car.** You don't
operate the dashboard — you run one capture command and relay physical actions.

## Why it's structured this way

To talk to the ELM327, the laptop must join the adapter's WiFi, which has **no
internet** — so Claude can't reach the laptop live during a session. The
`npm run capture` command bridges that gap: it runs a complete diagnostic
offline and produces a file Claude can read once you're back online.

## The loop

```
   ┌─────────────────────────────────────────────────────────────────┐
   │ 1. YOU (at car, on adapter WiFi):  npm run capture                │
   │    → follow idle/rev prompts → writes captures/prado-...md        │
   │                                                                   │
   │ 2. YOU: reconnect to internet, paste the .md into the chat        │
   │                                                                   │
   │ 3. CLAUDE: reads raw bytes, interprets, diagnoses, and either:    │
   │    - explains findings + recommends action, OR                   │
   │    - asks for another capture with specific parameters           │
   │      (wider Mode 22 range, capture while cold, after a repair…)   │
   │                                                                   │
   │ 4. Repeat as needed. Claude refines the tool between rounds       │
   │    (e.g. adds a confirmed Toyota PID decoder) and you git pull.   │
   └─────────────────────────────────────────────────────────────────┘
```

## What Claude needs from you (physical actions + symptoms)

Claude can't sense the car — so during a capture, relay things like:

- **State:** "engine cold / warmed up", "ignition on, not cranking", "idling"
- **Actions performed:** "revved to 2500 and held", "turned A/C on", "did a test
  drive then captured"
- **Symptoms:** "down on power above 2000 rpm", "white smoke when cold", "glow
  light stays on", "rough idle", "P-code came up on the cluster"
- **History:** "new injectors 10k km ago", "turbo was replaced", "uses more fuel
  lately"

The richer the symptom description, the better Claude can target which PIDs and
Mode 22 identifiers matter.

## What Claude gives you back

- **Interpretation** of the readings (e.g. "rail pressure tracked target within
  3 MPa under load — fuel delivery is healthy").
- **A diagnosis or hypothesis**, ranked by likelihood.
- **The next capture/command** to confirm or rule it out.
- **Tool improvements**: as Mode 22 PIDs get confirmed, Claude adds real decoders
  (`packages/server/src/decoders/toyota.ts`) and PID definitions
  (`packages/shared/src/toyota.ts`) so future captures decode them automatically.

## Reverse-engineering Toyota enhanced PIDs together

The advanced payoff. Standard apps can't read Toyota's boost / rail pressure /
EGR / injector-correction data on this vehicle. We derive them empirically:

1. A capture's Mode 22 sweep finds which identifiers your ECU answers (the
   "hits", with raw bytes).
2. Claude asks for **paired captures** — e.g. idle vs. revving, or cold vs. warm.
3. By watching which raw bytes move and by how much, Claude works out the
   scaling (is `0x011A` boost in kPa? absolute or gauge?).
4. Once confident, Claude commits a confirmed decoder. That PID then shows a real
   value and gauge in all future captures and in the live dashboard.

This is genuinely bespoke to *your* ECU and can't be bought off the shelf.

## Quick reference — capture variants

```powershell
npm run capture                       # full interactive capture (idle + rev prompts)
$env:NONINTERACTIVE="1"; npm run capture   # no prompts (one shot, current engine state)
$env:CAPTURE_DIR="D:\obd"; npm run capture # write captures elsewhere
npm run capture:mock                  # rehearse against the simulated Prado
```

When Claude asks for a specific Mode 22 range or other tweak, it will either tell
you the env var to set or push a small code change for you to `git pull` first.
