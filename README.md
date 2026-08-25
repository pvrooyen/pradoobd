# Prado OBD

A bespoke, web-based OBD-II diagnostic tool for a **2005 Toyota Land Cruiser Prado (120-series, 1KD-FTV 3.0L D-4D diesel)**, driving a generic **ELM327 WiFi** adapter from a browser.

It is built as an extensible **OBD platform**, not a one-off ELM327 app: the adapter sits behind a `Transport` interface, so a future J2534 / DoIP / UDS-coding device can be added without touching the UI, protocol logic, or decoders.

## ðŸ“– Start here

| If you want toâ€¦ | Read |
| --- | --- |
| Set up on a new machine (the laptop) | [`docs/SETUP-NEW-MACHINE.md`](docs/SETUP-NEW-MACHINE.md) |
| Run on a **Chromebook** (ChromeOS/Crostini) | [docs/CHROMEBOOK.md](docs/CHROMEBOOK.md) |
| Mini-VCI / OpenMVCI cable test (Mint live) | [START.md](START.md) |
| Connect to the car (OBD port, WiFi, run a session) | [`docs/AT-THE-CAR.md`](docs/AT-THE-CAR.md) |
| Understand the "Claude as mechanic" workflow | [`docs/CONSULTANCY-WORKFLOW.md`](docs/CONSULTANCY-WORKFLOW.md) |

**TL;DR consultancy loop:** at the car, on the adapter's (no-internet) WiFi, run
`npm run capture` â†’ it does a full diagnostic and writes `captures/prado-*.md` â†’
reconnect to internet â†’ paste that file into the chat â†’ we discuss. The capture
is the bridge across the connectivity gap.

---

## Why there's a backend (the one architectural fact to know)

Chrome **cannot open a raw TCP socket** to the ELM327 WiFi dongle (browsers only do HTTP/WebSocket; the dongle speaks raw TCP telnet). So a small local **bridge server** runs on your laptop and translates:

```
React UI (Chrome)  â”€â”€WebSocketâ”€â”€â–º  Bridge server (Node/TS)  â”€â”€TCP 35000â”€â”€â–º  ELM327 WiFi  â”€â”€â–º  Prado OBD-II
```

The bridge owns connection/retry/protocol; the browser stays a clean UI. Both are TypeScript.

## Realistic expectations on a 2005 diesel Prado

AU-spec diesels of this era predate mandatory standardized OBD-II, so:

- **Generic Mode 01 PIDs**: partial â€” some return `NO DATA`. The *Supported PID scan* tells you exactly which ones your ECU answers.
- **DTCs (Mode 03/07)**: usually readable/clearable.
- **Toyota enhanced data** (boost, common-rail pressure, EGR position, injector correction, DPF, VNT vane): lives behind **manufacturer Mode 22** identifiers that are *not publicly standardized*. The **Mode 22 Prober** sweeps the identifier space, finds which ones your ECU answers, and shows the raw bytes so you can confirm scaling empirically. **This is the advanced part you can't get from off-the-shelf apps.**
- **Actuator tests / forced DPF regen / coding**: generally need Techstream-level UDS sessions â€” out of reach for a stock ELM327. That's exactly the future the `Transport` abstraction leaves room for.

---

## Project layout

```
pradoobd/
â”œâ”€ packages/
â”‚  â”œâ”€ shared/   @pradoobd/shared â€” types, WS message contract, PID tables (standard + Toyota seed list), DTC decoding
â”‚  â”œâ”€ server/   @pradoobd/server â€” the bridge: Transport (ELM327-WiFi | Mock), ELM327 protocol, decoders, WS + static host
â”‚  â””â”€ web/      @pradoobd/web    â€” Vite + React + TS dashboard (mobile-first)
```

Key seams:
- `server/src/transport/Transport.ts` â€” the interface that future-proofs the tool. `ElmWifiTransport` is today's impl; `MockTransport` simulates a Prado for desk dev.
- `server/src/protocol/ObdSession.ts` â€” all OBD knowledge (init, scan, DTC, VIN, live, Mode 22 probe).
- `server/src/decoders/` â€” `standard.ts` (SAE J1979 formulas) and `toyota.ts` (provisional Mode 22 decoders + a raw-bytes fallback for reverse engineering).
- `shared/src/toyota.ts` â€” Toyota enhanced PID **candidates**. âš ï¸ Scalings here are provisional until confirmed at the car.

---

## Requirements

- Node.js â‰¥ 20 (developed on 23). npm â‰¥ 10.

## Install

```powershell
npm install
```

## Develop (two modes)

**Mock mode â€” develop at your desk, no car needed.** Simulates the Prado (supported PIDs, two DTCs, Mode 22 hits, drifting live values).

```powershell
# terminal 1 â€” bridge in mock mode
$env:MOCK="1"; npm run dev:server

# terminal 2 â€” React dev server with hot reload
npm run dev:web
```

Open **http://localhost:5173**. Vite proxies the WebSocket to the bridge on :8080.

**Live mode â€” at the car.** Same, without `MOCK`:

```powershell
npm run dev:server      # connects to the real ELM327 over WiFi
npm run dev:web
```

> Tip: `$env:LOG_LEVEL="debug"` on the server prints every byte exchanged with the adapter â€” invaluable for reverse-engineering Toyota PIDs.

## Production run (single port, no toolchain)

```powershell
npm run build      # builds shared, server, and the React bundle
npm start          # bridge serves the UI AND the WebSocket on :8080
# open http://localhost:8080
```

For mock: `$env:MOCK="1"; npm start`.

---

## At-the-car runbook

1. Plug the ELM327 into the Prado's OBD-II port (under the dash, right of the steering column). Turn ignition to **ON** (engine running is best for live data).
2. On the laptop, **join the adapter's WiFi network** (SSID is usually `WiFi_OBDII` / `V-LINK` / similar; no internet on it â€” that's expected).
3. `npm run build; npm start` (or the two dev terminals). Open the UI.
4. **Connection tab** â†’ Connect (defaults to `192.168.0.10:35000`). Confirm adapter id + negotiated protocol appear. Try **Read VIN**.
5. **Live Data tab** â†’ *Scan supported PIDs* â†’ tick the ones you want â†’ *Start live*. Note which standard PIDs your ECU actually serves.
6. **Trouble Codes tab** â†’ Read DTCs. (Record them before clearing â€” clearing also resets readiness monitors.)
7. **Mode 22 Prober tab** â†’ Probe the default `0100â€“01FF` range. For each hit, open the **Terminal** and re-request it (`22 01 19`) while you rev/warm the engine; watch the raw bytes move and derive the real scaling.
8. As you confirm a Mode 22 PID's meaning + scaling, add a decoder in `server/src/decoders/toyota.ts` and mark it `confidence: 'confirmed'` in `shared/src/toyota.ts`. It then graduates into a proper live gauge.

## Verifying without a car

```powershell
$env:MOCK="1"; npm start          # in one terminal
node packages/server/smoke-test.mjs   # in another â€” exercises the full WS flow, exits 0 on pass
```

---

## Roadmap (the platform grows here)

- **Confirm Toyota PIDs** â†’ promote provisional decoders to confirmed gauges.
- **Session logging / replay** â†’ record raw adapter traffic to `captures/` and replay through `MockTransport` for offline analysis.
- **CSV / chart export** of live logs.
- **New transports**: J2534 pass-thru, DoIP, or a UDS-capable adapter â€” implement `Transport` and the rest of the app comes along, unlocking actuator tests and coding.
- **PWA / mobile**: the UI is already mobile-first; add a manifest + service worker to run it from a phone on the adapter's WiFi.

## Safety

Clearing DTCs erases freeze-frame data and resets emissions readiness monitors. The Mode 22 prober only *reads*; it never writes. Anything that could write to the ECU (coding, actuator tests) is intentionally **not** implemented for the ELM327 transport.

