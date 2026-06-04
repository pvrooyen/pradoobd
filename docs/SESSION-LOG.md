# Session log

Newest first. Each entry: what we tried at the car, what we learned, what changed in
the code, and what to do next. Keep it short and factual.

---

## 2026-06-04 — verdict: the WiFi clone can't do K-line; comms blocker is the adapter

**Goal:** more captures (Elvera at the laptop, Pierre driving so the engine ran); then
shopping research for an adapter that gets the most comprehensive data; ship the code.

**Outcome:** Still **0 usable data**, but the cause is now nailed down. Three runs, engine
confirmed running (`ATRV=13.9V`/`13.8V` on clean reads), all identical:
`ATSP5/4/3` (KWP fast, KWP 5-baud, ISO 9141-2) → **`BUS INIT: ERROR`**; `ATSP6/7` (CAN) →
**`NO DATA`**. Adding a manual init exposed the smoking gun: the adapter **rejects `ATSI`
and `ATFI` with `"?"`** — this cheap ELM327 v1.5 WiFi clone doesn't implement manual init
and can't establish the K-line. `ATRV` also garbles to `"AUTO"` under load (framing
desync). **Conclusion: it's the adapter, not the car state or our software.** The engine
ECU is on K-line (ISO 9141-2 / ISO 14230 KWP); the clone simply can't init it.

**Research verdict (what actually gets comprehensive data on this car):** generic OBD on a
2005 1KD-FTV diesel is minimal — even a perfect adapter gives at most generic DTCs + a few
engine PIDs, and **nothing** from A/C, ABS, or SRS, and no active tests. The aircon goal is
**not reachable via generic OBD**. Real path = **Toyota Techstream + a Mini-VCI J2534 cable
(~$20, genuine FTDI) on a Windows laptop** (all ECUs, live data, freeze frames, active
tests). Lighter options: **OBDLink SX (USB, STN1110, ~$30)** to make OUR app log generic
engine data reliably; **Tactrix OpenPort 2.0** for J2534 + future app integration.

**Code changes this session (`packages/server/src`):**
- `ObdSession.tryProtocols()` — for K-line protocols now closes the bus (`ATPC`), sets
  `ATAT0`/`ATSTFF`/`ATKW0`/`ATIB10`, runs an explicit manual init (`ATFI`/`ATSI`) with raw
  logging, and retries (`KLINE_RETRIES`, default 2). CAN path unchanged.
- `transport/SerialTransport.ts` (NEW) — USB ELM/STN transport over `serialport` (dynamic,
  optionalDependency), mirroring the WiFi framing/queue. For the recommended USB adapter.
- `watch.ts` — `TRANSPORT=auto|wifi|serial` (default auto): uses a plugged-in USB adapter
  if a device node exists (`/dev/ttyUSB*`,`ACM*`), else WiFi. New env `ELM_SERIAL_PATH`,
  `ELM_BAUD` (default 115200; genuine ELM USB often 38400). Default protocol order is now
  K-line-first `5,4,3,6,7`.

**Next session (resume fast):**
1. **Get a real adapter first** — re-running the China WiFi clone will fail identically.
2. OBDLink SX (USB): attach it to Linux in ChromeOS so `/dev/ttyUSB0` appears, engine
   running, then `npm run watch` (auto-detects serial). Plug-and-go, Claude stays online.
3. For the **aircon / all-ECU** diagnosis: Mini-VCI + Techstream on a Windows laptop —
   Health Check (all-ECU DTC scan), then A/C ECU Data List + Active Test.

---

## 2026-06-03 — first real at-the-car attempts; ECU comms not established yet

**Goal:** first live captures; toward the end, diagnose the air-conditioning.

**Outcome:** No successful capture yet — **0 usable data from the car.** The ELM327
WiFi adapter connects and identifies as `ELM327 v1.5`, but it **never establishes an
OBD link to the ECU**: `ATSP0` auto-detect doesn't lock a protocol (`ATDP` stays
"AUTO"), `0100` goes unanswered, so the supported-PID scan returns **0 PIDs**. Also
saw a VIN (`09 02`) timeout and one mid-capture TCP drop. No aircon data obtained.

**Root causes (two, compounding):**
1. **Ignition/engine state** — engine-off only works if the key is in full RUN
   (dash fully lit). Several attempts were ambiguous. **Engine RUNNING is the most
   reliable** and removes this variable.
2. **Auto-detect fails on this older K-line car** — a 2005 1KD-FTV is almost
   certainly ISO 9141-2 or ISO 14230-4 (KWP), not CAN; `ATSP0` is unreliable there.

**Networking finding (important):** On the Chromebook/Crostini, you **cannot** keep
internet (phone USB tether) AND have the Linux container reach the adapter at the same
time. Crostini routes all container traffic through ChromeOS's single default network;
the wired tether wins, so adapter-bound packets go to the phone (ICMP to
`192.168.0.10` = 100% loss while tethered). **Captures must run on adapter-WiFi-only.**
The host Chrome browser can reach the adapter, but the bridge/watcher run in the
container, which can't. So the offline-capture workflow stands.

**Code changes this session (all in `packages/server/src`):**
- `ObdSession.tryProtocols()` — force-tries ELM327 protocols (default `6,5,4,3,7`),
  keeps whichever answers `0100`, and logs each attempt's raw response.
- `watch.ts` — when auto-detect doesn't lock a protocol, logs OBD-port voltage
  (`ATRV`) and runs `tryProtocols`; throws a descriptive error (with raw attempts) if
  none answer. Plus: best-effort VIN (no longer fatal), `CMD_TIMEOUT_MS` override for
  slow K-line init, connection-thrash fix (graceful probe close + 1s settle + 20s
  fail-backoff), and transport always closes (no leaked half-open socket).

**Next session (resume fast):**
1. **Engine running.** Plug in adapter.
2. Claude starts the watcher while still online (e.g. `npm run watch`, optionally
   `CMD_TIMEOUT_MS=8000`).
3. User goes **adapter-WiFi-only** (tether/internet off), waits ~2 min, back to net.
4. Read the watcher log: it will show which protocol locked (or the `ATRV` voltage +
   raw attempts if not). Once known, pin it via `PROTOCOLS="<n>"`.
5. Then resume the **aircon** test: A/C OFF→ON Mode 01 comparison (does the compressor
   idle-up?). Note: full A/C-ECU data likely needs Techstream, not generic OBD —
   generic OBD mainly sees the engine ECU.
