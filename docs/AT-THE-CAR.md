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

## 4. How a session runs (you don't touch the terminal)

The intended mode: **Claude runs everything; you only talk, plug in, and rev.**
Because the adapter's WiFi has no internet (Claude can't reach the laptop while
you're on it), Claude starts the **auto-capture watcher** *before* you go offline.

### The flow (Option A — recommended, hands-free)

1. **Before you leave / go offline:** Claude starts the watcher in the background:
   ```bash
   npm run watch        # polls for the adapter; no adapter needed to start
   ```
2. **At the car:** plug in the ELM327, ignition ON (engine running for live data),
   join the adapter's WiFi. **You run nothing.**
3. The watcher auto-detects the adapter and runs a full capture by itself. Partway
   through it prints **`>>> REV TO ~2500 RPM AND HOLD NOW <<<`** — rev when you see
   it (or just rev for ~10 s around then). It writes
   `captures/prado-capture-<timestamp>.json` + `.md`.
4. **Switch the laptop back to normal internet** and tell Claude "done."
5. Claude reads the newest `captures/*.md` directly and you discuss findings.

Each time the adapter reconnects (unplug/replug, or a later visit), the watcher
captures again automatically. Claude can change capture parameters (e.g. a wider
Mode 22 range) by restarting the watcher with env vars — that's Claude's job:

```bash
ELM_HOST=192.168.0.10 ELM_PORT=35000 \
MODE22_START=0x0000 MODE22_END=0x05FF \
SNAPSHOTS=8 SNAPSHOT_GAP_MS=5000 \
npm run watch
```

> One-shot interactive alternative (`npm run capture`) exists for when someone is
> at the keyboard and wants press-Enter control, but the watcher is the default.

### Option B — live dashboard (optional, if you want to watch gauges)

```bash
npm run build      # first time only
npm start          # bridge + UI on :8080
# open http://localhost:8080 in Chrome (auto-forwarded from Crostini; see CHROMEBOOK.md)
```

Connection tab → Connect → Live Data → Scan → Start live. No internet needed —
it's all local on the laptop.

## 5. Rehearse without the car

Everything above can be practised on the simulated Prado first:

```bash
npm run watch:mock        # watcher rehearsal — captures once and exits
MOCK=1 npm start          # live dashboard against the mock (UI on :8080)
```

## Safety notes

- **Clearing DTCs** erases freeze-frame data and resets readiness monitors —
  only after you've recorded the codes. The capture reads them first, so you'll
  always have a record.
- The Mode 22 prober and all capture functions are **read-only**. Nothing in this
  tool writes to the ECU.
- Don't drive while operating the laptop. Capture at idle/standstill, or have a
  passenger. To capture under load safely, a second person revs while you watch.
