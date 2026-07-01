# START HERE — fresh Claude Code session on the borrowed Windows laptop

If you are a Claude Code session that just started on a **Windows laptop** the user
(Pierre) borrowed to run **Toyota Techstream**: this file is your mission. Read it
first, then `docs/TECHSTREAM-WINDOWS.md` + `docs/TECHSTREAM-SANDBOX-VETTING.md` for
the vetting rubric, and `docs/SESSION-LOG.md` (newest entries) for full context.

## ⛔ HARD RULE — do NOT install VirtualBox / any hypervisor / any USB-filter driver

On 2026-07-01, installing VirtualBox on Pierre's **desktop** loaded VBoxUSBMon, which
faulted the onboard Intel Bluetooth radio and killed mouse + keyboard + Bluetooth at
once, forcing a hard reboot. **DECISION: run the cracked Techstream DIRECTLY on this
laptop — no VM, no VirtualBox.** The borrowed laptop (not a daily machine) is itself
the isolation. Do not install a hypervisor or USB-filter driver here either. If you
think you need a VM, STOP and ask Pierre first. See the memory notes
[[no-hypervisor-on-desktop]] / [[techstream-belongs-on-laptop]].

## The one-line goal

Get **Techstream + the Mini-VCI J2534 cable** working DIRECTLY on THIS laptop, safely
(see the safest-practices checklist below), and diagnose Pierre's **2005 Toyota Land
Cruiser Prado (120-series, 1KD-FTV 3.0 D-4D diesel)**. Aircon is FIXED. Real targets:
1. **Cooling fans not moving** — Health Check → Engine/A-C ECU Data List → fan
   **Active Test** to isolate relay vs. motor vs. input logic.
2. **Injectors replaced but never coded** (running inefficiently) — Engine → Utility →
   **Injector Compensation** (enter each injector's 30-char code) THEN **Pilot /
   Small Quantity Learning** (separate, engine warm). BLOCKER: need the 30-char codes
   etched on each injector (receipt / boxes / install photos).

## ✅ Already proven (2026-07-01, in a since-deleted VM): the crack works

The community package (ih8mud MEGA link) is a pre-built VM image
`TechStream 12.20.024-v2.ova` (SHA256 A5F25A5FAC213892CF7787885F04A71E39277838BD3BCB4240BAC3AA61535E95).
In that VM, **Techstream 12.20.024 launched, the crack activated** ("Subscription
Expiration 1904d"), and **the Mini-VCI enumerated as a USB Serial Port** with the
**XHorse MVCI J2534 v1.4.7** driver loaded. So the software + cable are known-good.
On this laptop we install the SAME Techstream, but natively (not from the OVA) — get
a Techstream **installer** package (not the .ova), or extract the app from a
standard OBDII365/UOBDII/ih8mud installer bundle. Version 12.x or 16.20.023 both fine.

## ✅ Safest-practices checklist (direct install, no VM) — follow in order

1. Create a **System Restore point** first (built-in, no drivers) — reversibility.
2. Get the Techstream package from a reputable source (OBDII365 / UOBDII / the
   ih8mud "Techstream in 5 minutes" thread). **NEVER the mini-CD** that shipped with
   the cable — that's the documented malware vector.
3. **Scan before running**: Windows Defender + upload the archive to VirusTotal.
   Rubric (see TECHSTREAM-SANDBOX-VETTING.md): a `Riskware`/`Keygen`/`PUA` flag on the
   "Toyota Launcher" is the EXPECTED false-positive; a named stealer/RAT, OR any
   outbound network connection = discard.
4. Install Techstream → MVCI driver → FTDI driver → merge `mvci-x64.reg`. Keep the
   laptop **OFFLINE** while running Techstream (a local OBD tool needs no internet).
   Add a Defender exclusion ONLY for the known Toyota Launcher FP if it quarantines it.
5. Plug in the Mini-VCI, run **MVCI FirmwareUpdateTool → Device Info** (read-only
   connectivity check). ⛔ NEVER the flash/update function — it bricks clone cables.
6. Then the car work: Health Check → fan Active Test → injector coding + pilot learn.

## Operating contract (unchanged — see CLAUDE.md)

**The user does not use the terminal. YOU run every command** via your tools and
report outcomes. The user's jobs: talk to you, do physical things (plug the cable
into the OBD port under the dash, ignition/engine, climate on), and click inside
the **Techstream GUI** when you guide him (Techstream is a Windows GUI app — you
can't click its buttons, so for THAT app you tell him exactly what to click and he
reports what he sees / pastes screenshots).

## Why we're on Windows (don't relitigate)

- The Mini-VCI is a **J2534** cable, **not an ELM327**. Our own app cannot drive it.
  Only **Techstream** speaks its protocol, and only Techstream's closed
  ECU-definition DB knows how to talk to the **A/C ECU**. No open-source/Linux port
  exists (checked 2026-06-30).
- The cheap **ELM327 WiFi adapter is redundant** for this goal and can't even init
  this car's K-line (proven June 2026). Don't suggest it. Don't suggest the
  Chromebook. This laptop + Techstream is the path.
- The cable already enumerated on the user's desktop as `COM4`, genuine FTDI ID
  `0403:6001` (good sign — likely not a bricked counterfeit). On THIS laptop, the
  COM number may differ — check Device Manager → Ports.

## Today's sequence (you drive)

1. **Verify the repo built** (optional; our app isn't used for the diagnosis, but
   keep it green): `npm install` then `npm run build`. The `serialport` optional
   dep may be absent — that's fine, it's a dynamic import.
2. **Detect the cable:** run a PowerShell check for the FTDI COM port (see snippet
   below) and tell the user the COM number you find.
3. **Download Techstream + drivers** — guide the user; see the "Download & cost"
   section below and `docs/TECHSTREAM-WINDOWS.md`. Vet the files; tell him which to
   keep/skip.
4. **Install in order:** Techstream → MVCI driver → FTDI VCP driver → merge
   `mvci-x64.reg` (64-bit) → `FirmwareUpdateTool.exe` "Device Info" must see the
   cable (the real genuine-vs-clone test).
5. **Connect to the car:** engine running, climate on, cable in OBD port. In
   Techstream: Connect to Vehicle → if VIN auto-read fails, pick Prado / 2005 /
   1KD-FTV manually.
6. **Diagnose (read-only):** Health Check (record ALL DTCs) → A/C ECU Data List
   (compressor request, evap temp, pressure switch, blower, servo positions,
   refrigerant pressure) → Freeze Frame for any A/C DTC. Have the user paste values
   / screenshots; you correlate with the symptoms.
7. **Only if needed, active tests** (Magnetic Clutch / Compressor ON, blower, air-
   mix servo) — see safety. Decide together first.

### Cable-detect snippet (you run this)

```powershell
Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue |
  Where-Object { $_.InstanceId -match 'FTDIBUS|VID_0403' } |
  Select-Object Status, FriendlyName, InstanceId | Format-Table -AutoSize
```
A line like `USB Serial Port (COM5) … FTDIBUS\VID_0403+PID_6001…` = cable present.

## SAFETY (the bricking risk is WRITES, not reads)

- **Reads are safe**: Health Check, Data List, Freeze Frame change nothing.
- **Active tests / Utility / customization / reflash are WRITES.** The classic way
  to brick an ECU is losing **power or USB mid-write**. So before ANY write:
  laptop on **mains power**, **stable USB** (no flaky hub), engine in the expected
  state. Never run reflash/immobiliser/calibration for an aircon job — unrelated
  and the real risk.
- Our app's read-only guard does NOT protect Techstream (different software). In
  Techstream, safety = sticking to read functions until you and the user
  deliberately choose an active test.

## Download & cost (tell the user this)

Two routes — see the "Download & cost (current)" section in
`docs/TECHSTREAM-WINDOWS.md` for the full breakdown. Summary:

- **Official (licensed):** Toyota TIS at `techinfo.toyota.com` — **~$35 for a
  2-day pass**, ~$55/month, ~$580/yr standard. Legit but overkill for one car.
- **Standalone build (CHOSEN — $0, no key):** **V16.20.023 primary** (best-tested
  with Mini-VCI, full 1KD injector/Utility UI), V17.30.011 + V13.x fallbacks, **skip
  V18**. Source by reputation: OBDII365 / UOBDII / the FT86CLUB-ih8mud Google-Drive
  pack. ⚠️ **Do NOT use the mini-CD bundled with the cable — documented malware
  vector.** The crack is **vetted in a hardened VirtualBox VM first** (see
  `docs/TECHSTREAM-SANDBOX-VETTING.md` — two-stage detonation + VirusTotal + a
  red-flag rubric; the decisive rule: a local OBD tool making ANY outbound
  connection = don't use it). ⛔ **Never flash the cable firmware.**

The user declined the official $80/48h pass (the cheap $30 TIS tier is docs-only, no
Techstream). The bundled CD is not used (malware vector + the user can't read it).
