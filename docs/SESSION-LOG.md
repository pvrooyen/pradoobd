# Session log

Newest first. Each entry: what we tried at the car, what we learned, what changed in
the code, and what to do next. Keep it short and factual.

---

## 2026-08-31 — Stop Techstream on PierrePC; laptop GO + USB pack

**Decision:** do **not** install Techstream on the daily desktop. Tomorrow: Elvera’s HP ProBook 455 Windows. Pierre says **go**. Agent follows **`docs/LAPTOP-GO.md` only**.

**Why V12 died:** S314-02 empty warning on Connect is a **license gate**. Cable, Device Info 1.4.1, and VIM XHorse were already fine. Dummy 5000-day key + ISO MainMenu open the shell; `[TBR - EU]` stays empty. ISO “Patch 64bit.lnk” is a fake (`Techstream.exe /395070/VM:1`). xwolf `TS_loader` v0.1 on V12: **RUN no key** grey (already launched), Connect still S314-02. That loader auto-closes **S314-01**, not S314-02. Matching path is **stock V18.00.008 + TS_loader + TSRegistration from the same Activation pack**.

**Desktop leftover:** V12 uninstalled. V18 wizard was showing “update 12.20.024 → 18.00.008”; Pierre aborted. Folder `C:\Program Files (x86)\Toyota Diagnostics\Techstream.bak-v12-20260831160033`. XHorse driver still installed. Do not continue V18 here.

**USB (Ventoy, do not format, do not delete ISOs):** `D:\prado-techstream\` (~514 MB). Hashes verified after copy. RAR password `123`.

| USB file | SHA256 |
| --- | --- |
| `Techstream\Techstream_Setup_V18.00.008.exe` | `3A799DE3…86BC46` |
| `Techstream\TS_loader.exe` | `838499AE…B3D954` |
| `Techstream\TSRegistration.exe` | `5F6CA57B…2476E7` |
| `Techstream\Techstream_18.00.008_Activation.rar` | `B4E2DAC8…DB23DD` |
| `Driver\mvci-driver.rar` | `BD9377A0…27275F` |

**Tomorrow Phase A (desk):** driver Device Info → install V18 from stick → copy loader+TSRegistration into `bin` → always launch TS_loader → Connect must be vehicle-select **or** comm-fail, **not** S314-02. Then car Health Check. Injectors still need 30-char stamps.

**Do not:** flash, Zadig, mini-CD, 48h TIS, hypervisor, dummy keys, mix binaries, format Ventoy.

---

## 2026-08-31 — Compact follow-up: real TS_loader found and launched (Connect not proven yet)

**Why the Takealot CD failed:** the 2021 ISO’s “Techstream Patch 64bit.lnk” is a fake (targets `Techstream.exe /395070/VM:1`). Dummy 5000-day key + patched MainMenu open the shell; **Connect still hits S314-02** because `[TBR - EU]` stays empty. Daily working installs launch via a resident **TS_loader.exe** that auto-closes the license dialog. S314-02 = license, not the cable.

**Got the real files** from AutoBoss Yandex `https://disk.yandex.ru/d/6V5E7rLArBkuQQ` pack `Toyota Techstream 18.00.008+Activation_пар 123.rar` (SHA256 `B4E2DAC8271FA4200099CFBB647878B0F6CE58403FD10403AD6D019F0BDB23DD`, 254877692 bytes, password `123`). Defender: no threats. No http/powershell/schtasks in the loader.

| File | Size | SHA256 | Date |
| --- | --- | --- | --- |
| `TS_loader.exe` | 382464 | `838499AE948D3FDBED176FE4F625E4A8DFC4FC5DCAD1A9379F7C9E7B7FB3D954` | 2017-10-06 |
| `TSRegistration.exe` | 397312 | `5F6CA57B5635EFEBAB5BF291C7E71E3EB2896D15236A01B0C635AF56602476E7` | 2023-02-23 |

Copied into `C:\Program Files (x86)\Toyota Diagnostics\Techstream\bin\`. Desktop shortcut `Techstream Loader.lnk`. Launched: **Toyota TS loader** window with **RUN no key** + Techstream V12.20.024 still showing **VIM - XHorse - MVCI J2534 DLL v1.4.6**. TSRegistration **not** run yet (it is labelled V18 key form).

**Pierre’s next click (desk only):** **RUN no key**, then **Connect to Vehicle**. Success = vehicle-select **or** communicate-fail. Fail = S314-02 empty warning again. Do **not** go to the car until that.

**Do not:** firmware Update, Zadig, mini-CD, 48h TIS, hypervisor, mix V12/V16 binaries again.

---

## 2026-08-31 — Power-loss consult (car talk only; no OBD)

**Scope:** driveability after the Inhambane return. Pierre thought protected mode; 2 and L still had pull, D did not. Then almost no power after ~30 s in any gear; in Park the pedal would not take it past ~1500 rpm. Last metres home: pushed, pedal on the floor. Mechanic cleaned a connector on a big black box, driver-side inner wing (left of the engine viewed from the front).

**Verdict:** fail-safe **and** the injectors barely being driven. Not the gearbox, not the turbo, not the accelerator pedal.

That box is the **EDU (injector driver)**. Cabin ECU only *asks*; the EDU fires the injectors and must confirm. A dirty plug both starves the drive and makes the ECU think the injectors have failed, so it enters fail-safe (CEL, ~1500 rpm wall, pedal ignored). Last week 2/L still moved it because a short gear hid the limited engine. At the end the plug was so bad there was almost no injection under load — idle in Park still ran (sip of fuel); moving the car needed a gulp that was not there. Fail-safe is meant to limp you home; this went past that.

Cleaning is a valid fix. It will come back if the seal is torn or the pins are green — then replace the plug or the EDU, not another spray. Watch it after rain or a dusty run.

No code changes. Not the Mini-VCI / Techstream track.

**Next:** none on this topic unless the limp returns.

---

## 2026-08-31 — PierrePC desktop GO: cable + Device Info OK; Techstream Connect blocked (S314-02)

**AFTER COMPACT — FIRST ACTION (do not skip):** launch a **multi-agent deep investigation**. Not more random GUI clicks. Question to answer: Mini-VCI kits are sold every day; how do buyers in 2025–2026 actually get **Connect to Vehicle** working on **Windows 10/11 x64** with this exact hardware (FTDI `0403:6001` fw **1.4.1**), and how do we get past **Register Techstream Software (S314-02)** empty warning → OK → **nothing**. Deliver: working recipe + a real `Toyota Launcher` / `Techstream Patch 64bit` **EXE** (not a `.lnk` to `Techstream.exe /395070/VM:1`) + hashes + how to run it. Then implement that recipe on this PC. Do **not** go to the car until Connect opens a vehicle screen **or** a communicate-fail dialog on the desk.

**Machine:** PierrePC. Repo `C:\Projects\pradoobd` on `main`. User types nothing; agent runs commands.

**Product Pierre bought:** Takealot Mini-VCI + TIS Techstream (PLID93817397). Cable + software. He only got a **CD** and has **no CD reader**. Official Toyota 48h TIS is a **different product** (Mongoose). Do not tell him to buy it. Do not flash firmware. No Zadig. No hypervisor on this desktop.

**Proven on this PC today**

| Item | Result |
| --- | --- |
| Cable | COM4, `VID_0403/PID_6001`, serial `A6VON31I`, Status OK |
| OpenMVCI `--open-only` | Pass. Bootstrap 115200, `MVCI_SERIAL_CTRL_MODE=none` |
| OpenMVCI `--read` | Dongle unlocks; ECU silent. ICVM/CAN frames. Honest timeout. Logs in `captures/` |
| XHorse Device Info | **Connected**. Model **MVCI-HC**. Firmware **1.4.1**. SN `MVCI006000001`. Tool window 1.4.8 ≠ cable fw |
| J2534 from Techstream | Status bar **VIM - XHorse - MVCI MVCI J2534 DLL v1.4.6**. `j2534_*.log`: PTOpen OK, fw `J2534 MINIV1.03` |
| Driver pack | Yandex RAR hashes matched; files in `C:\Program Files (x86)\XHorse Electronics\MVCI Driver for TOYOTA TIS\`; `scripts/mvci-x64.reg` imported; restore point created |

**Techstream state (blocked)**

- Installed then **uninstalled** genuine Denso **V16.20.023** (dummy disc key rejected; Software ID was `9BB2CF36167F6F1F0ADE4E09E23EC002`).
- Now: **V12.20.024** from kit ISO `techstream-staging/cd-iso/toyota mini vci 16.00.017.iso` (681 MB, MEGA vxdas). Desktop shortcut Public `Techstream.lnk`.
- `IT3System.ini`: `TISFunction=0`, VIM `XHorse - MVCI`.
- Disc key entered and **stored** in `IT3UserCustom.ini` `[Registration - EU]` / `[Sdfhrusauhno]`: `1111111111111111111111111111111150001703161820`. `[TBR - EU]` **empty**.
- **Connect to Vehicle** and **Generic OBD II** both: dialog **Register Techstream Software (S314-02)** empty **Warning!** → OK → **no next window**. MainMenu never starts `Techstream.exe`. That is a **license gate on this PC**, not a missing car. Do not send him to the Prado for this.

**Tried and failed (do not repeat blindly)**

- Dummy 5000-day key on **genuine V16** MainMenu: dialog bounced empty.
- Swap V12 patched `MainMenu.exe` onto **V16**: Connect did **nothing** (version mix).
- V12 patched `MainMenu.exe` (ISO `Techstream_12.20.024\MainMenu.exe`, 2842624, ver 12.2.0.9) + stock V12 `Techstream.exe`: key “sticks” on main UI; Connect still S314-02.
- ISO “Techstream Patch 64bit.lnk” is **not a patcher**. Target = `...\bin\Techstream.exe` args `/395070/VM:1`. Direct launch: process, **no window**, exits.
- Mix KEY `Techstream.exe` (ISO `Techstream_13.00.022\KEY\`, ver 12.0.0.10) with V12.2 MainMenu: Connect dead. Restored stock V12 exe.
- Matched KEY pair (both 12.0.0.10): still S314-02.
- MEGA rate-limit **-6**; folder `7VZzBQgZ` **-9**. Could not fetch OBDII365 “Techstream Patch 64bit” / Toyota Launcher tonight.
- YouTube Dropbox pack: 352-byte stub zip, useless.
- Clock-rollback test aborted (w32tm hang). Clock is **2026** again. `w32time` running.

**Local files (gitignored `techstream-staging/`)**

- `v16/Techstream_Setup_V16.20.023.exe` (Denso, Defender clean)
- `v12/Techstream_12.20.024\` setup + patched MainMenu
- `cd-iso\toyota mini vci 16.00.017.iso` + extracted KEY binaries
- `mega_get.py` anonymous MEGA downloader
- Backups: `bin\MainMenu.exe.bak-stock-v12`, `bin\Techstream.exe.bak-stock-v12`

**Captures (gitignored):** `captures/prado-dtc-reader-2026-08-31T13-16-47.md`, `captures/techstream-deviceinfo-2026-08-31.md`, `captures/dtc-reader-*.log`

**Why “people buy this every day” still failed here:** the Takealot box is cable + a **malware-class mini-CD**. Working installs use a **separate loader EXE** (Toyota Launcher / Techstream Patch 64bit) plus XHorse J2534. We installed the real Denso app and the 2021 ISO’s fake `.lnk` “patch”. Dummy keys + MainMenu swap open the shell; **Connect still wants TBR/CUW**. No CD drive to run TISKEY.exe. MEGA mirrors died tonight.

**Do not:** firmware Update, Zadig, mini-CD, 8.10.021 crack zip, official 48h TIS, VirtualBox on PierrePC, `--clear`, injector Utility until Connect works **and** Pierre has the four 30-char stamps.

**Injector coding (later, after Connect works at the car):** Engine and ECT → Utility → Injector Compensation (#1 front) → then Utility → Pilot Quantity Learning. Need physical 30-char codes.

---

## 2026-08-31 — Live Mini-VCI at the Prado (Elvera laptop); hand to desktop

**Scope:** Pierre driving then idle in park. Mini-VCI on COM3. Wanted data then Techstream-path test without paying TIS 48h. Wrapped so desktop Grok can take `go`.

**Cable:** Takealot Mini-VCI + TIS Techstream. FTDI `0403:6001` serial `A6VON31I` = **USB Serial Port (COM3)**. Not ELM327.

**Dump:** `scripts/minivci-live-dump.mjs`. Bootstrap **OK** at **115200, DTR/RTS none**. ECU **silent** (no VIN, 0 DTCs, 0 PIDs, 0 Mode 22). Expected: 1KD is K-line; dump sent OpenMVCI ICVM/CAN frames. Honest empties in `captures/prado-live-2026-08-31T14-23-58-823Z.md` (gitignored). Elvera had **no CMake/MSVC**, so `dtc_reader` was not built there.

**Do not pay TIS to test this cable.** Toyota Techstream Lite diagnostics are validated on Mongoose, not Mini-VCI. Mini-CD banned. No firmware flash.

**Driver (Elvera only):** XHorse files + `mvci-x64.reg`. FirmwareUpdateTool **UAC/admin → silent exit** (cwd System32). Launcher: `scripts/MiniVCI-DeviceInfo.bat` (no admin). Device Info **not finished**.

**Next:** desktop `git pull`, paste `Follow docs/DESKTOP-GO.md`. Desktop already has Windows serial OpenMVCI. First: `--open-only` / `--read` **and** Device Info. No TIS.

**Docs:** `docs/DESKTOP-GO.md`. Pointers in `HANDOVER.md`.

---

## 2026-08-28 — Free Mini-VCI: Windows serial + write gate (PierrePC)

**Scope:** implement FREE-MINIVCI phases 1–2 on the desktop. No car. Cable not plugged in here.

**Built:** `--clear` dual-flag gate; Windows FTDI serial (`CreateFile` / no libusb); `dtc_reader --open-only`; protocol fallback ISO15765 → ISO14230 → ISO9141; write stubs; tests (6/6 Release). `--clear` without `--i-understand-this-writes` prints `WRITE BLOCKED` and does not open the port.

**Desk `--open-only`:** `no FTDI Mini-VCI COM port` — expected; nothing on USB.

**Not built:** live PIDs / Mode 22 capture writer (waits until the cable talks).

**Next (superseded 2026-08-31):** car session happened on Elvera; continue on desktop via DESKTOP-GO.

---

## 2026-08-28 — Handover: OBD tests on Elvera's Windows laptop

**Scope:** get this repo runnable on Elvera's machine so Grok there can take over.
No car session today. Desktop (MSI PierrePC) only wrote docs + commit.

**What "active" means:** `npm run watch:mock` writes `captures/prado-*.md` and
exits. That proves Node + the capture stack. Live ELM327 on this 2005 1KD still
cannot init K-line (2026-06-04). Mini-VCI / OpenMVCI / Techstream stay later.

**Docs:** `docs/ELVERA-MACHINE.md` (paste-prompt + steps). Pointers in
`CLAUDE.md`, `HANDOVER.md`, `README.md`, `docs/SETUP-NEW-MACHINE.md`.

**Next:** Pierre `git pull` on Elvera's laptop, paste the prompt from
`docs/ELVERA-MACHINE.md` into Grok there. That Grok runs install/build/mock.

---

## 2026-08-13 — Oil-light consult; 1500 km trip is a go; vehicle file imported

**Scope:** this project is the whole Prado, not just the OBD tool. Search is
closed — Pel bought the car ~2026-06-11. Plate ACZ 676 MC, chassis
KDJ120-0072377, 1KD-1391817 Euro III. Vehicle history lives in `docs/vehicle/`
(imported once from the old Pel Car Drive folder, which is deprecated / will be
deleted). Do not look for Pel Car again.

**Today's topic (only):** yellow oil light + oil leak, and whether a **1500 km**
drive to diagnose/fix is acceptable.

**Verdict:** drive it. Warm-only light (never from cold, on after a few km) on a
1KD is level / thin oil / sender — not a dying bottom end. Keep oil on the stick
every fuel stop; 5 L of diesel oil in the back. Expected extra damage if level is
held: none you will feel.

**Yellow, not red:** a 120 Prado oil-**pressure** lamp is **red** (oil-can).
Yellow/amber is almost certainly **A/T oil temp** (the ATF cooler is in the
radiator that was opened 1 Jun) or a misread MIL. Confirm the symbol once in the
shade. Engine leak and this light may be two separate things.

**Fuel (current):** ~6 L / 50 km. Official gasóleo **116.25 MZN/L** (Petromoc,
still current 10 Aug 2026; Inhambane a couple of Mt higher). **~700 MZN / 50 km.**
1500 km budget ~180–210 L.

**Lessons learned**
- On this cluster, colour of the lamp matters more than the word “oil.” Red
  oil-can = stop. Amber after a few km after radiator work = think gearbox temp.
- A 1KD with oil in the sump will do a long tar run on a warm-only warning.
  The trip-killing risk is an emptying leak nobody checks, or a knock you ignore.
- Consult like a mechanic: one topic, a verdict, then stop. Don’t reopen fans /
  keys / injectors when the user scoped oil.

**Next:** glance the dash symbol (red can vs A/T OIL TEMP). Dipstick every stop
on the 1500 km. On arrival: find the leak, change oil if it smells of diesel,
then the rest of the backlog (keys, fans, springs, injector codes).

No code changes this session.

---

## 2026-07-01 — VM route PROVED the crack works, then BROKE the desktop; pivot to direct-on-laptop

**Big result AND a serious incident.** Built a hardened VirtualBox VM, unattended-
installed Win11, then imported a community OVA (`TechStream 12.20.024-v2.ova`, SHA256
A5F25A5F…, from the ih8mud MEGA link). **Techstream 12.20.024 launched, crack active
("Subscription Expiration 1904d"), and the Mini-VCI cable enumerated inside the VM as
a USB Serial Port with the XHorse MVCI J2534 v1.4.7 driver loaded.** So the software +
cable are confirmed working.

**INCIDENT:** Installing VirtualBox loaded `VBoxUSBMon`, which faulted the onboard
Intel Wireless Bluetooth radio (USB\VID_8087&PID_0025) into an Error state — killing
the BT mouse, BT keyboard, and a wired USB keyboard simultaneously, forcing a hard
reboot. Known VirtualBox-vs-onboard-Bluetooth conflict. Recovery (verified): reset the
BT radio via Disable/Enable-PnpDevice; uninstalled VirtualBox; `sc delete` its filter
drivers. VBoxUSBMon service GONE, no VBox services/kernel drivers loaded, Bluetooth OK,
0 devices in Error. Remaining inert residue (2 locked VBoxNet*.sys files + 5 phantom
80EE:CAFE USB nodes) clears on the pending cold `shutdown /s /f /t 0`. Reclaimed 32GB
of VM/ISO/OVA files. Memory rules written: [[no-hypervisor-on-desktop]],
[[techstream-belongs-on-laptop]].

**DECISION (Pierre):** Drop the VirtualBox/VM route. Run the cracked Techstream
**directly on the borrowed laptop** (not a daily machine = acceptable isolation),
following safest practices. No hypervisor / USB-filter driver on either machine
without asking. See the rewritten `docs/WINDOWS-LAPTOP-START-HERE.md` for the direct
(no-VM) checklist: System Restore point → reputable source (NOT the mini-CD) →
Defender+VirusTotal per the rubric → install → keep offline → Device-Info check
(never flash) → Health Check + fan Active Test + injector coding & pilot learning.

**Next session = on the borrowed laptop.** git pull, then Claude reads
WINDOWS-LAPTOP-START-HERE.md and drives the direct install. The crack + cable are
already proven, so this is lower-risk than going in blind.

---

## 2026-06-30 (cont. 2) — VT-x was already ON; hardened VM built + boot-tested

**Correction:** the earlier "enable VT-x in BIOS" ask was a MISTAKE. `Win32_Processor.
VirtualizationFirmwareEnabled=False` is an unreliable flag — it reads False whenever
Windows VBS/Hyper-V already holds the virtualization extensions. VT-x was **enabled
all along**. Verified authoritatively: `systeminfo` ("a hypervisor has been
detected"), `HyperVisorPresent=True`, and actually starting a hvm VirtualBox VM
(`VMState=running`). No BIOS change was ever needed. Lesson: to check VT-x, use
systeminfo/HyperVisorPresent or just start a VM — never that WMI flag.

**Built the sandbox VM (autonomous):** `techstream-sandbox` in VirtualBox —
4GB RAM, 2 CPU, EFI, 61GB disk, Win11 ISO attached to boot, clipboard + drag-drop
disabled, **NIC=none** (fully offline for the clean baseline + Run #1 detonation;
attach a fake-net manually for Run #2). **Boot-tested OK** (VMState=running). Build
script: `C:\_dev\pradoobd-sandbox\build-vm.ps1` (also copied to `docs/build-vm.ps1`
for the borrowed laptop). Gotchas fixed: `--tpm-type` not `--tpm-version`;
`--nic1 none` (a bare `hostonly` with no named adapter errors on boot);
`$ErrorActionPreference=Continue` so a benign VBox stderr doesn't abort.

**Autonomous runway ends here.** Remaining steps need a human at the VirtualBox GUI
window (can't be driven from a shell): (1) install Windows 11 in the VM — click
through setup, use the TPM/SecureBoot bypass, LOCAL account, no real logins; (2)
copy in `guest-tools\SysinternalsSuite.zip`, take a `clean-baseline` snapshot, NO
Guest Additions; (3) download Techstream V16.20.023 in the VM browser; (4) run the
two-stage detonation per `docs/TECHSTREAM-SANDBOX-VETTING.md`. Do this here (Pierre
at the desktop VirtualBox window) or on the borrowed laptop.

---

## 2026-06-30 (cont.) — scope = full diagnostics + coding; cracked route + VM sandbox

**Scope change:** not aircon-only. **Aircon is FIXED**; remaining jobs are (1) **cooling
fans not moving** (diagnose via Engine/A-C ECU Data List → Active Test on the fan
output), and (2) **injectors were replaced and NOT coded** → running inefficiently.
Injector job is TWO steps on the 1KD-FTV: **Injector Compensation** (enter each
injector's 30-char code per cylinder, Engine→Utility) **THEN Pilot/Small Quantity
Learning** (separate Utility routine, engine warm) — skipping the 2nd is a known
cause of rough/inefficient running. **BLOCKER:** need the 30-char codes etched on
each new injector (receipt/boxes/install photos) — nothing can recover these.

**Cost decision:** official Techstream is **$80/48h** (NOT the $30 tier — that's
Library/docs only, no Techstream; confirmed from the user's screenshot of the TIS
price table). User **declined $80**; chose the **free cracked standalone**, "as safe
as possible." So the plan is: **vet the crack in a hardened VirtualBox VM, then run
it on the borrowed laptop** (not the daily desktop).

**Chromebook/Wine ruled out earlier; desktop can't go to the car (it's a desktop).**
This session's machine is the Windows **desktop** — used to PREP + sandbox-vet; the
**borrowed laptop (available tomorrow)** does the real at-the-car work.

**Deep investigation (2 agents) — key findings:**
- **Cable is the RIGHT hardware:** genuine FT232RL fw 1.4.x has CAN+K-Line chips,
  ideal for a 2005 K-line 1KD. The newer VXDIAG Nano would be WORSE (fails K-line).
  **⛔ Never flash the cable firmware** (FirmwareUpdateTool "Device Info" check only;
  flashing bricks clones).
- **Version:** **V16.20.023 primary**, V17.30.011 + V13.x fallbacks, **skip V18**.
- **Source:** OBDII365 / UOBDII / FT86CLUB-ih8mud Google-Drive pack. **The mini-CD
  bundled with cables is the documented malware vector — do NOT use it** (user can't
  read it anyway).
- **Crack = a license-bypass patcher ("Toyota Launcher.exe")**, not a service.
  Expected AV noise = `Win32/Ymacco.AA5C`/`Riskware`/`Keygen` on the patcher ONLY;
  the Techstream installer scans clean. Named families (RedLine/Lumma/AsyncRAT/
  CoinMiner…) or ANY outbound network = real threat, discard.
- **Sandbox method:** hardened VM (NO Guest Additions, realistic specs, no real
  logins), Sysinternals toolkit pre-staged in the clean snapshot, **two-stage
  detonation** (offline run, then fake-net run), watch processes/drops/persistence/
  network/Defender. **Decisive rule: a local OBD tool should make ZERO internet
  connections — any phone-home → don't run on real hardware.** VM-clean ≠
  bare-metal-clean, so real use stays on the borrowed (non-daily) laptop.
  Full rubric: `docs/TECHSTREAM-SANDBOX-VETTING.md`.

**Prep staged this session (autonomous, on the desktop):**
- VirtualBox 7.2.10 installed (official, winget). MEGAcmd installed (to pull the
  MEGA-hosted archive). Staging dirs under `C:\_dev\pradoobd-sandbox` (OUTSIDE the
  git repo — nothing huge/risky committed).
- Windows 11 sandbox ISO downloading (8 GB, BITS background, resumable) via a
  genuine `software.download.prss.microsoft.com` URL (Fido).
- New docs: `TECHSTREAM-SANDBOX-VETTING.md`; updated `TECHSTREAM-WINDOWS.md`
  (V16.20.023, source reputation, no-flash rule) + `WINDOWS-LAPTOP-START-HERE.md`.

**Prep COMPLETED autonomously (end of 2026-06-30 session):**
- ✅ Windows 11 ISO fully downloaded + finalized: `C:\_dev\pradoobd-sandbox\iso\
  Win11_25H2_x64.iso` (7.89 GB / 8,471,603,200 bytes).
- ✅ VirtualBox 7.2.10 installed. ✅ Sysinternals suite staged (184 MB) at
  `guest-tools\SysinternalsSuite.zip` (goes into the clean VM snapshot).
- ✅ Hardened VM-build script ready: `C:\_dev\pradoobd-sandbox\build-vm.ps1`
  (no Guest Additions, 2 CPU/4GB/61GB, no shared folders/clipboard, NIC
  disconnected for the offline run). Run it AFTER VT-x is on.
- ⚠️ **Crack archive NOT downloaded yet.** MEGAcmd `get` on the public link failed
  ("Not logged in") — MEGA blocks anonymous CLI fetches of this file. **Fix
  tomorrow:** download the archive via the **VM's own browser** from the MEGA web
  link (`mega.nz/file/xxU1ACTT#...`, from obd2gate/vxdiagshop) — doing it INSIDE
  the sandbox VM is actually cleaner (the file never touches the host). Or use an
  OBDII365/UOBDII/Google-Drive mirror. Then VirusTotal + detonate per
  `docs/TECHSTREAM-SANDBOX-VETTING.md`. Quarantine dir is empty as of now.
- Note: `C:\_dev\pradoobd-sandbox\` is the staging root, OUTSIDE the git repo.

**Next session (resume fast):**
1. **User:** wired keyboard → MSI BIOS (`Del`→`F7`→`OC → CPU Features → Intel
   Virtualization Tech = Enabled`→`F10`) to enable VT-x (currently OFF). Say "done".
2. **Claude:** verify VT-x on → run `build-vm.ps1` → install Win11 in the VM (local
   account, NO real logins) → copy in Sysinternals → take `clean-baseline` snapshot
   → download V16.20.023 via the VM browser → VirusTotal → two-stage detonation
   against the rubric → if clean, the user explores the real Techstream UI safely.
3. **User (no rush):** find the 30-char injector codes (per-injector, for coding).

---

## 2026-06-30 — Mini-VCI + Techstream cable arrived; built read-only safe mode

**What arrived:** a **Toyota Diagnostic Mini VCI (J2534) cable + TIS Techstream**
(photo: the labelled cable + a CD-ROM the user no longer has). This is exactly the
"real path" the 2026-06-04 research recommended for comprehensive / A/C-ECU data.

**Key hardware finding:** plugged into the Windows **desktop**, the cable
enumerated cleanly as `USB Serial Port (COM4)`, FTDI ID **`VID_0403 PID_6001`**,
driver bound, status OK → very likely a **genuine-ID FTDI** (dodges the worst
clone gotcha). The bundled CD is unneeded (out of date); download Techstream
fresh.

**Critical correction (don't lose this):** the Mini-VCI is a **J2534** cable, not
an ELM327. **Our app cannot drive it** — our `Transport` speaks ELM327 AT-commands
over a serial port; the Mini-VCI has no AT interpreter and only speaks Toyota's
proprietary J2534/UDS protocol that **only Techstream** implements. So plugging
this cable into our app yields nothing. The A/C-ECU diagnosis the user wants is
**only** reachable via **Techstream**, whose closed ECU-definition database is the
one place the 2005 Prado A/C diagnostic dictionary exists (no open-source port
exists — checked: OpenVehicleDiag has Mercedes defs only; the NikolaKozina Linux
J2534 driver is for the Tactrix OpenPort, not the Mini-VCI; the SavvyCAN
Mini-VCI-on-Linux thread closed unresolved).

**Chromebook verdict (researched, then ruled out):** two hard walls — (1) ChromeOS
deliberately blocks FTDI USB passthrough into Crostini (`#crostini-usb-allow-
unsupported` whitelists Arduino-class, not this), and (2) Techstream is
Windows-only .NET whose MVCI J2534 driver doesn't work reliably under Wine. The
genuine-FTDI `0403:6001` *is* named in the Crostini whitelist, so a serial port
*might* appear — but a serial port is useless because nothing on Linux speaks the
Mini-VCI's J2534 framing. **Plan: Techstream on a borrowed Windows laptop.**

**What we built this session (read-only safe foundation):**
- `shared/src/safety.ts` (NEW) — `classifyCommand()` / `isVehicleWrite()`: the
  single source of truth for "does this command write to the car?" Deny-list keyed
  on the OBD/UDS service byte (04, 2F, 31, 2E/3B, 3D, 27, 28, 11, 85, 34–38);
  AT/ST and reads (01/02/03/07/09/0A/22/19/3E) allowed; unknown → fail-safe block.
- `server/src/transport/ReadOnlyGuard.ts` (NEW) — a `Transport` decorator that
  rejects vehicle-write commands at the choke point (every command goes through
  `Transport.send()`), so NO path (terminal, bridge, watcher, future) can write
  when read-only is on. `withReadOnlyGuard()` + `READ_ONLY` env.
- `watch.ts` / `capture.ts` — default `READ_ONLY` **ON** (pure read tools), wrap
  the transport, print a SAFETY banner.
- `bridge/BridgeSession.ts` — default read-only ON, wraps transport, refuses
  `clearDtcs` with a structured `READ_ONLY` error, advertises `readOnly` in
  `connectionState`. `web/useObd.ts` exposes it; `DtcPanel` hides the Clear button
  and shows a 🔒 note.
- npm scripts `safe-read` / `safe-read:mock` (root + server) = watcher with
  `READ_ONLY=1` forced.
- Verified: 26/26 checks (reads pass, every write service blocked, unknown
  fail-safe, disabled-guard pass-through) + full `safe-read:mock` capture written.
  Whole monorepo builds clean (installed the optional `serialport` dep so `tsc`
  resolves the dynamic import on this desktop).
- Docs: `docs/CHROMEBOOK-READONLY.md` (the safe Chromebook step) and
  `docs/TECHSTREAM-WINDOWS.md` (download sources, driver/registry order, version
  pick for the 2005 Prado, and the active-test safety rules).

**Plan from here:**
1. **Chromebook (safe, optional):** `npm run safe-read` for a read-only ELM327
   pass. Expect the same K-line-clone wall (no ECU data) — but it's safe and free.
2. **Windows laptop (the real diagnosis):** follow `docs/TECHSTREAM-WINDOWS.md` —
   install Techstream + MVCI/FTDI driver + x64 reg fix, connect, run **Health
   Check** then **A/C ECU Data List** (all read-only). Active tests only after,
   on mains power + stable USB.

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
