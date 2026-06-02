# At the car — connecting to the 2005 Prado (120-series, 1KD-FTV)

This is the physical + network setup for getting the laptop talking to the car.

## 1. Find the OBD-II port

On a 2005 120-series Land Cruiser Prado (1KD-FTV 3.0 D-4D), the 16-pin OBD-II
diagnostic connector is:

- **Under the dashboard, on the driver's side**, above the pedals.
- In RHD (Australian) Prados: to the **right of the steering column**, near the
  hood/bonnet release lever, tucked up under the lower dash trim. It usually
  faces downward, so you feel for it more than see it.
- It's a trapezoidal 16-pin socket. The ELM327 only fits one way.

> If you can't find it: it's always within ~600 mm of the steering wheel by
> regulation. Check behind/below the coin tray or a small removable panel.

## 2. Plug in the ELM327 WiFi adapter

1. Ignition **OFF**.
2. Push the ELM327 firmly into the OBD-II port until seated. A light on the
   adapter usually comes on.
3. Turn the ignition to **ON** (position II — dash lights on). For **live data**
   (RPM, pressures, temps) the **engine should be running**. For just reading
   DTCs, ignition-ON without cranking is enough.

## 3. Join the adapter's WiFi from the laptop

The ELM327 WiFi adapter creates its **own WiFi access point** (it is not on your
home network). On the laptop:

1. Open Windows WiFi networks.
2. Connect to the adapter's SSID — commonly **`WiFi_OBDII`**, **`V-LINK`**,
   **`OBDII`**, or similar (check the adapter's label/manual). No password on most.
3. Windows will say **"No internet"** on this network — **that is correct and
   expected.** The adapter has no uplink.
4. The adapter's address is almost always **`192.168.0.10`, TCP port `35000`**
   (the app's default). A few use `192.168.4.1`. If `192.168.0.10` fails, check
   the adapter manual and set the host in the Connection tab / `ELM_HOST`.

> ⚠️ **Because this WiFi has no internet, the live chat with Claude will drop**
> while you're connected to it. That's the whole reason for the offline capture
> workflow below.

## 4. Two ways to run a session

### Option A (recommended) — offline capture, then discuss

Best when you want Claude to be the mechanic. One command does a full diagnostic
sweep and writes a file; you then reconnect to the internet and paste it.

```powershell
# laptop joined to adapter WiFi, ignition ON / engine running
npm run capture
```

It will:
1. Initialize the adapter, read VIN, scan supported PIDs.
2. Prompt you: **"engine at idle, press Enter"** → captures an idle snapshot.
3. Prompt you: **"rev to ~2500 rpm and hold, press Enter"** → captures under load.
4. Read DTCs (stored + pending).
5. Sweep the Toyota Mode 22 prober range.
6. Write `captures/prado-capture-<timestamp>.json` **and** `.md`.

Then:
1. Disconnect from the adapter WiFi, **reconnect to normal internet**.
2. Open the `.md` file, **paste its contents into the chat** (or attach the
   `.json`). Claude reads the raw bytes and you discuss findings + next steps.

Run `npm run capture` again any time Claude asks for fresh data (e.g. "probe a
wider Mode 22 range" or "capture while cold"). Set env vars to tweak:

```powershell
$env:ELM_HOST="192.168.0.10"   # adapter IP if different
$env:ELM_PORT="35000"          # adapter port if different
$env:CAPTURE_DIR="D:\obd-logs" # write captures elsewhere
$env:NONINTERACTIVE="1"        # skip the idle/rev prompts (unattended)
npm run capture
```

### Option B — live interactive dashboard

When you want to watch gauges move yourself in real time (no internet needed for
this; it's all local):

```powershell
npm run build      # first time only
npm start          # bridge serves UI + connects to adapter, on :8080
# open http://localhost:8080 in Chrome
```

Connection tab → Connect → Live Data → Scan → Start live.

> Dev mode (`npm run dev:server` + `npm run dev:web`, UI on :5173) also works at
> the car, but Option B's single `npm start` on :8080 is simpler trackside.

## 5. Rehearse without the car

Everything above can be practised on the simulated Prado first:

```powershell
npm run capture:mock                 # offline-capture rehearsal
# or
$env:MOCK="1"; npm start             # live dashboard against the mock
```

## Safety notes

- **Clearing DTCs** erases freeze-frame data and resets readiness monitors —
  only after you've recorded the codes. The capture reads them first, so you'll
  always have a record.
- The Mode 22 prober and all capture functions are **read-only**. Nothing in this
  tool writes to the ECU.
- Don't drive while operating the laptop. Capture at idle/standstill, or have a
  passenger. To capture under load safely, a second person revs while you watch.
