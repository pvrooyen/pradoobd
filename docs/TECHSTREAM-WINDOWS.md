# Techstream on Windows + Mini-VCI — the real path to the A/C ECU

This is the procedure for the **borrowed Windows laptop**. Techstream is the
official Toyota dealer software; with the Mini-VCI J2534 cable it reaches **all
ECUs** (engine, **A/C**, ABS, SRS, body), live data, freeze frames, and active
tests. This is the only tool that can diagnose the **air-conditioning** on this
2005 Prado — generic OBD (our app / any ELM327) cannot see the A/C ECU.

> **Why not the Chromebook?** Two hard walls: ChromeOS blocks FTDI USB
> passthrough into the Linux container, and Techstream is Windows-only .NET whose
> MVCI J2534 driver doesn't work under Wine reliably. The cable enumerates fine on
> Windows (it came up as `USB Serial Port (COM4)`, genuine FTDI ID
> `VID_0403 PID_6001`). Use Windows. See `docs/SESSION-LOG.md` (2026-06-30).

---

## Hardware status (already confirmed)

- Cable: **Toyota Diagnostic Mini VCI** (J2534), FT232R chip.
- On the desktop it enumerated cleanly as **COM4**, FTDI ID `0403:6001`, driver
  bound, status OK → it's very likely a **genuine-ID** FTDI (dodges the worst
  clone gotcha where counterfeit chips get bricked by FTDI's driver). Final proof
  is Techstream's firmware check passing.
- The bundled **CD-ROM is not needed** (and is years out of date). Download fresh.

---

## Download & cost (current — checked 2026-06-30)

You need three things. Two routes for the software itself:

### Route A — Official (licensed, paid) via `techinfo.toyota.com`
Legit, always-current, but priced for shops and overkill for one car:
- **~$35 — 2-day pass** (48 h full Professional access) ← the only sane official
  option for a one-off DIY job
- ~$55 / month · ~$580 / year (standard) · ~$1,500 / year (Professional Diagnostic,
  needed for GTS+ online programming — you do NOT need this for an aircon diagnosis)

This route needs the "Techstream Lite" + GTS+ agent and an active subscription.

### Route B — Standalone build (what every Mini-VCI clone ships with) — **$0, no key**
This is the offline, no-subscription Techstream the cable was designed for and what
the owner community uses for self-diagnosis. **Recommended version for this 2005
Prado: V17.30.011** (Nov-2022 vehicle data, explicitly Mini-VCI FT232-compatible,
runs Win7–Win11 32/64-bit). V16.20.023 and V18.00.008 also work; V17.30.011 is the
sweet spot. Offline diagnosis (Health Check, Data List, active tests) works without
any account — only *online programming* would need a paid TIS account, which this
job doesn't.

Get it from an established vendor blog: OBDII365, UOBDII, vxdiagshop, or autosvs
(search "Techstream 17.30.011 free download"). ⚠️ These unofficial mirrors can
bundle junk/adware — install on the **borrowed** laptop (not a daily driver), and
**let Claude vet the file list** before you run anything. Disable any "download
manager" and grab the direct archive.

> For a one-off self-diagnosis of your own car, Route B is the community norm and
> costs nothing. Route A's 2-day pass (~$35) is the clean licensed alternative if
> you prefer official. Your call — Claude will set up whichever you pick.

### The three files you end up with

1. **Techstream** (Route A or B above).
2. **MVCI / FTDI driver** — usually called "MVCI Driver for TOYOTA TIS" (XHorse).
   Plus the latest **FTDI VCP driver** (`ftdichip.com/drivers`) if Windows didn't
   already bind one.
3. **x64 registry fix** — `mvci-x64.reg` (merge it) so 64-bit Windows lets
   Techstream find the MVCI DLL. Required on Win10/11 64-bit.

> Claude will stage an exact checklist + the specific filenames/versions to keep
> vs. skip once you pick the version. Don't improvise from random links.

---

## Install order (do NOT skip the order)

1. Install **Techstream** (standalone). Don't launch it yet.
2. Install the **MVCI driver** (XHorse "MVCI Driver for TOYOTA TIS").
3. Install/confirm the **FTDI VCP driver** — plug in the cable, check Device
   Manager → Ports (COM & LPT) shows **USB Serial Port (COMx)**. Note the COM
   number.
4. Merge the **`mvci-x64.reg`** registry file (64-bit Windows only).
5. Run `FirmwareUpdateTool.exe` from
   `C:\Program Files (x86)\XHorse Electronics\MVCI Driver for TOYOTA TIS` → click
   **Device Info**. It must report the cable connected (this is the real
   genuine-vs-counterfeit test). Update firmware only if it prompts.
6. Launch Techstream. First run: set region/market (it doesn't affect connecting),
   and in **Setup → VIM Select**, choose the **XHorse MVCI** interface.

---

## Connecting to the Prado

1. Engine **running** (so live data and the A/C compressor are active), climate
   system **on**.
2. Plug the Mini-VCI into the OBD-II port (under the dash, driver's side) and the
   USB into the laptop.
3. Techstream → **Connect to Vehicle**. If VIN auto-read fails on this older
   diesel, pick manually: Area = your market, then **Land Cruiser Prado** / year
   **2005** / engine **1KD-FTV**.

---

## SAFETY — read before you click anything that writes

Reading data is safe. The danger is **writes**: active tests, "Utility"/reset
functions, customization, and any reflash. The golden rules:

- **Diagnosis first, and it's almost all read-only.** For the aircon:
  1. **Health Check** — scans *every* ECU for DTCs. Record everything.
  2. **A/C ECU → Data List** — live values (compressor request, evap temp,
     pressure switch, blower, servo positions, refrigerant pressure if equipped).
  3. **Freeze Frame** — conditions when an A/C DTC set.
  This is enough to diagnose most aircon faults and changes nothing on the car.
- **Active tests come later, only if needed**, and only with:
  - a **stable USB connection** (don't do them over a flaky hub),
  - the laptop on **mains power** (never let it die mid-write),
  - the engine in the state the test expects.
  The classic way to brick an ECU is losing power/USB **mid-write**. Avoid that
  and active tests are routine dealer operations.
- **Never** run reflash/calibration/immobiliser writes for an aircon diagnosis —
  they're unrelated and carry the real bricking risk.

A/C active tests you *might* use after diagnosis: **Magnetic Clutch / Compressor
ON**, blower-motor and air-mix-servo tests. Tell Claude what the Data List shows
first; decide together before any write.

---

## When you've connected

Tell Claude the Health Check results and the A/C Data List values (a screenshot or
typed values). Claude correlates them with the symptoms and the engine-side data
to pinpoint the aircon fault and the next step.
