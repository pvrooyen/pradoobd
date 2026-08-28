# Elvera's Windows laptop — get OBD tests active

This is the handover for **Grok on Elvera's Windows laptop**. Pierre types
nothing. You run every command. Report outcomes, not runbooks.

Repo: `https://github.com/pvrooyen/pradoobd.git`  
Preferred folder: `C:\Projects\pradoobd`

Paste this into Grok on that machine (then Grok follows the rest of this file):

```
You are on Elvera's Windows laptop. Pierre types nothing. You run every command.

Read docs/ELVERA-MACHINE.md first, then CLAUDE.md and docs/CLAUDE-CONTEXT.md.

Goal: OBD tests ACTIVE on this machine.

1. Install Git and Node.js ≥ 20 if missing (winget is fine). Do not install VirtualBox or any hypervisor.
2. If C:\Projects\pradoobd exists: git pull origin main. Else: git clone https://github.com/pvrooyen/pradoobd.git C:\Projects\pradoobd
3. cd C:\Projects\pradoobd
4. npm install
5. npm run build
6. npm run watch:mock
   Ready = it prints "✔ capture written" and "(mock) one capture done — exiting." and a new file exists under captures/.
7. Optional extra: $env:MOCK="1"; npm start  (background) then  node packages/server/smoke-test.mjs  then stop the server.

Tell Pierre "ready" with the capture filename. Then wait. Do not go to the car until he says so.

Hard rules:
- Do not wipe Linux on this disk.
- Do not install VirtualBox / Hyper-V / USB-filter drivers.
- Do not flash Mini-VCI firmware. Device Info only, later, if we get that far.
- Do not use the mini-CD that shipped with the cable.
- The cheap ELM327 WiFi clone cannot init this 2005 Prado's K-line (proven). Mock proves OUR software. A live ELM327 capture is expected to fail the same way. Real cable talk is Mini-VCI + OpenMVCI later — not today unless he asks.
```

---

## What "OBD tests active" means

| Gate | Command | Pass |
| --- | --- | --- |
| **1. Software (do this now, no car)** | `npm run watch:mock` | `✔ capture written` + `captures/prado-*.md` |
| **2. Optional WS smoke** | mock `npm start` + `node packages/server/smoke-test.mjs` | exit 0 |
| **3. Live capture (later, at the car)** | `npm run watch` started **before** joining adapter WiFi | a real `captures/prado-*.md` after he plugs in |

Until gate 1 passes, the machine is not set up.

---

## Facts (do not relitigate)

- Car: **2005 Toyota Land Cruiser Prado 120, 1KD-FTV 3.0 D-4D diesel**.
- Pierre does not use the terminal. You are the mechanic; he is hands at the car.
- **ELM327 WiFi** (`192.168.0.10:35000`) **cannot** init this ECU's K-line
  (`BUS INIT: ERROR` / rejects `ATSI`/`ATFI`). Proven 2026-06-04. Do not
  spend the session debugging that clone.
- **Mock mode** uses `MockTransport`. It is the proof that Node, the monorepo,
  decoders, and capture writer work on *this* Windows install.
- **Mini-VCI (FTDI `0403:6001` / `0403:6010`)** is the cable that can actually
  talk. OpenMVCI `dtc_reader --read` is the free cable test (see `START.md`).
  Techstream is a later, separate path (`docs/WINDOWS-LAPTOP-START-HERE.md`).
  Do not start Techstream or OpenMVCI unless Pierre asks after gate 1.

---

## Steps you run (Windows PowerShell)

### 0. Who you are on

```powershell
hostname
$env:COMPUTERNAME
node --version
git --version
npm --version
```

Need **Node ≥ 20** and **Git**. If missing:

```powershell
winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements
winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
```

Close and reopen the shell after winget so PATH updates. Do **not** install
VirtualBox, Hyper-V, VMware, or USB-filter drivers.

### 1. Get the code

```powershell
if (Test-Path C:\Projects\pradoobd\.git) {
  Set-Location C:\Projects\pradoobd
  git pull origin main
} else {
  New-Item -ItemType Directory -Force -Path C:\Projects | Out-Null
  git clone https://github.com/pvrooyen/pradoobd.git C:\Projects\pradoobd
  Set-Location C:\Projects\pradoobd
}
```

If clone needs GitHub auth, stop and tell Pierre — do not invent credentials.

### 2. Install and build

```powershell
npm install
npm run build
```

`serialport` is optional. If it fails to compile, continue. The mock path does
not need it.

### 3. Activate OBD tests (mock — this is the gate)

```powershell
npm run watch:mock
```

This takes ~30–40 s (six mock snapshots). Pass looks like:

- `✔ capture written: …captures\prado-….md`
- `(mock) one capture done — exiting.`

Confirm the new `.md` and `.json` exist under `captures/`. Read the `.md` so
you know the capture shape. Then tell Pierre **ready** and the filename.

### 4. Optional WS smoke (same desk, still no car)

```powershell
$env:MOCK="1"; npm start
```

In a second shell, from the repo root:

```powershell
node packages/server/smoke-test.mjs
```

Exit 0 = pass. Then stop the server.

### 5. Stop. Wait for Pierre.

Do not join adapter WiFi. Do not start `npm run watch` (live) until he says he
is about to go to the car **and** you still have internet.

---

## Later: at the car (only after he says go)

You start the live watcher **while internet still works**:

```powershell
npm run watch
```

Then he: plugs the adapter in, ignition ON (engine running for live data),
joins adapter WiFi (no internet — chat will drop), revs ~2500 rpm when the
watcher prints `>>> REV TO ~2500 RPM AND HOLD NOW <<<`. He switches back to
normal WiFi and says "done." You read the newest `captures/*.md`.

**Expectation with the ELM327 WiFi clone:** capture will likely show
`BUS INIT: ERROR` / `NO DATA`. That confirms the adapter, not a broken
install. Next hardware step is Mini-VCI + OpenMVCI (`START.md`), not more
ELM327 guessing.

---

## Do not

- Wipe or shrink Linux on this disk.
- Whole-disk wipe, Chrome Recovery, Chromebook firmware.
- VirtualBox / any hypervisor / USB-filter driver (broke Pierre's desktop).
- Flash Mini-VCI firmware (`FirmwareUpdateTool` update function bricks clones).
- Install from the cable's mini-CD (malware vector).
- Ask Pierre to type `npm` / `git`.
