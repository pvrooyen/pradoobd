# Laptop GO — Techstream V18 on Elvera’s Windows (2026-09-01)

Paste this into Grok on **Elvera’s Windows laptop** (nothing else):

```
Follow docs/LAPTOP-GO.md
```

You run every command. Pierre types **go**. He clicks GUI and does physical USB/car actions. He does **not** use the terminal.

---

You are on **Elvera’s HP ProBook 455 G10** Windows partition, **not** PierrePC. Techstream does **not** belong on the daily desktop. Pierre aborted the V18 install there on 2026-08-31.

A Ventoy USB stick travels with him. The pack is:

`D:\prado-techstream\`  
(letter may change; volume **Ventoy**. Do **not** format the stick. Do **not** delete `Win11_Pro_en-US.iso`, `ubuntu-24.04.3-desktop-amd64.iso`, or `D:\drivers\`.)

If the stick is not plugged in, stop and ask Pierre to plug it. Do not re-download from MEGA (rate-limit **-6** / **-9** tonight). Yandex source is listed below only as backup.

## What “done” is (desk first, then car)

**Phase A — desk, no Prado.** Stop here until this is true:

1. Mini-VCI enumerated (FTDI `0403:6001`, some `COMx`).
2. XHorse **FirmwareUpdateTool → Device Info** (not Update): **Connected**, firmware **1.4.1**.
3. Techstream **V18.00.008** installed from the USB pack (stock Denso setup).
4. `TS_loader.exe` + `TSRegistration.exe` from the **same pack** are in `...\Techstream\bin\`. Desktop shortcut points at **TS_loader**, Working Directory = `bin`. Never the stock Techstream icon.
5. **Connect to Vehicle** on the desk opens a **vehicle-select** screen **or** a **communicate-fail** dialog.  
   **Not** `Register Techstream Software (S314-02)` empty Warning → OK → nothing.

**Phase B — car, only after Phase A.** Ignition ON / engine running. Health Check. Later: fans Active Test, injector compensation if Pierre has the four 30-char stamps.

## Operating contract

Pierre’s only jobs:

1. Talk in plain language.
2. Click the windows you put in front of him (UAC, installer Next, TSRegistration fields, Device Info, Connect).
3. Plug USB cable / stick / OBD; ignition; tell you when it is warm.

You run `git`, `Copy-Item`, Defender exclusions, `reg import`, hashes, process starts. Never a runbook of terminal steps for him.

---

## Facts (do not relitigate)

| Item | Fact |
| --- | --- |
| Car | 2005 Prado 120 **1KD-FTV** Euro III, chassis **KDJ120-0072377**, plate **ACZ 676 MC** |
| Bus | Engine is **K-line** (ISO 14230 / ISO 9141), **not** OBD CAN. CAN-silent is expected. |
| Cable | Takealot Mini-VCI J2534. FTDI **`0403:6001`**, serial **`A6VON31I`**. Elvera historically **COM3**. Not ELM327. No `ATZ`. |
| Firmware | Device Info **1.4.1**, model **MVCI-HC**, SN `MVCI006000001`. Tool window version ≠ cable fw. **Never flash.** |
| Product he bought | Takealot cable + TIS Techstream (PLID93817397). He got a **CD** and **no CD reader**. Official 48h TIS is a **different** product (Mongoose). Do not buy it. |
| Why “people buy this every day” still failed | The CD / 2021 ISO “Patch 64bit.lnk” is a **fake shortcut** to `Techstream.exe /395070/VM:1`. Working 2025–2026 Mini-VCI installs use **stock Techstream V18.00.008** plus a real **`TS_loader.exe` + `TSRegistration.exe`** from the same pack. Dummy `1111…5000…` keys open the shell; **Connect still wants TBR** and shows **S314-02**. |
| PierrePC 2026-08-31 | Cable + Device Info + J2534 VIM **proven**. V16 dummy key **rejected**. V12 Connect **S314-02**. xwolf `TS_loader` v0.1 on V12: **RUN no key grey** (already launched), Connect **same empty warning**. V12 then **uninstalled**. V18 installer started, Pierre said **stop — laptop only**. Leftover: `C:\Program Files (x86)\Toyota Diagnostics\Techstream.bak-v12-20260831160033`. |
| EDU | 2026-08-31 limp: mechanic cleaned **EDU (injector driver)** plug, driver-side inner wing. Health Check later should record EDU / injector DTCs. Not today’s desk blocker. |

---

## USB pack (verify hashes before you run anything)

All SHA256 below were computed on PierrePC 2026-08-31. Re-hash on the laptop. Mismatch = stop.

| Relative path | Bytes | SHA256 |
| --- | --- | --- |
| `Techstream\Techstream_Setup_V18.00.008.exe` | 271533864 | `3A799DE327E9EF46DFFAE8A066AD000EE899A0E1BBEDBD9BD090DD690186BC46` |
| `Techstream\TS_loader.exe` | 382464 | `838499AE948D3FDBED176FE4F625E4A8DFC4FC5DCAD1A9379F7C9E7B7FB3D954` |
| `Techstream\TSRegistration.exe` | 397312 | `5F6CA57B5635EFEBAB5BF291C7E71E3EB2896D15236A01B0C635AF56602476E7` |
| `Techstream\Techstream_18.00.008_Activation.rar` | 254877692 | `B4E2DAC8271FA4200099CFBB647878B0F6CE58403FD10403AD6D019F0BDB23DD` |
| `Driver\mvci-driver.rar` | 3772270 | `BD9377A01365D1C48A02AB983B1E9804C53390027D3BB22BB85F9B952127275F` |

RAR password **`123`**. Prefer the already-extracted EXEs so you do not need 7-Zip.

`TS_loader.exe` is Delphi **xwolf ver.0.1**. It auto-closes **S314-01** (the key dialog). It does **not** handle **S314-02**. Defender on PierrePC: **no threats**. No `http`/`powershell`/`schtasks` strings. Expected FP elsewhere: `Ymacco` / Keygen / PUA on the loader only. Named stealer/RAT or outbound C2 → discard.

Backup download if the stick is missing: `https://disk.yandex.ru/d/6V5E7rLArBkuQQ` file `Toyota Techstream 18.00.008+Activation_пар 123.rar`. Driver pack: same hashes as `docs/DESKTOP-GO.md`.

Repo: `https://github.com/pvrooyen/pradoobd.git`  
Typical laptop folder: `C:\Projects\pradoobd`. `git pull` first if it exists.

---

## Never

- Firmware **Update** / flash (bricks clones). Device Info only.
- Zadig / WinUSB.
- Mini-CD / ISO `toyota mini vci 16.00.017.iso` “Patch 64bit.lnk”.
- Dummy key `1111111111111111111111111111111150001703161820` as the Connect fix.
- Mix V12 MainMenu onto V16, or KEY `Techstream.exe` 12.0.0.10 with MainMenu 12.2.0.9.
- Official 48h TIS (Mongoose, not this cable).
- Hypervisor / VirtualBox (killed Bluetooth on PierrePC 2026-07-01). Fine to skip even on the laptop unless Pierre asks.
- Clock rollback.
- `--clear` on OpenMVCI.
- Send Pierre to the Prado while Connect is still S314-02.
- Format the Ventoy stick. Delete LinuxMint partition. Touch `D:\drivers\` HP driver EXEs.
- Run FirmwareUpdateTool or TS_loader **as Administrator** if that sets cwd to `System32`. Shortcut Working Directory must be the real folder.

---

## You run (in order)

### 0. Machine + stick

Confirm you are on Elvera’s Windows, not PierrePC.

Find the pack:

```powershell
Get-CimInstance Win32_LogicalDisk | Where-Object { $_.VolumeName -eq 'Ventoy' } |
  Select-Object DeviceID, VolumeName, @{N='FreeGB';E={[math]::Round($_.FreeSpace/1GB,1)}}
```

Expect a `prado-techstream` folder on that drive. Re-hash the five files in the table. Copy the pack onto the laptop disk (e.g. `C:\Users\pierr\prado-techstream`) so Defender exclusions are a local path.

`git pull` this repo if present; else clone. You need this file.

Create a **System Restore point**.

### 1. Defender — before copy into Program Files

Add exclusions, then keep real-time on:

- `C:\Program Files (x86)\Toyota Diagnostics\Techstream`
- `C:\Program Files (x86)\XHorse Electronics`
- the local copy of `prado-techstream`

If the loader vanishes after copy, Defender ate it — restore from the USB and confirm the exclusion.

Need **VC++ 2015–2022 x86** redistributable and a current **.NET 4.x**. Install with winget if missing.

### 2. Cable + XHorse driver (desk)

Ask Pierre to plug Mini-VCI **USB into the laptop** (not the car yet).

```powershell
Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue |
  Where-Object { $_.InstanceId -match 'FTDIBUS|VID_0403' } |
  Select-Object Status, FriendlyName, InstanceId | Format-Table -AutoSize
```

Expect `VID_0403` + `PID_6001` and a `COMx`.

If XHorse is not already in `C:\Program Files (x86)\XHorse Electronics\MVCI Driver for TOYOTA TIS\` with `FirmwareUpdateTool.exe` + `MVCI32.dll`:

1. Copy USB `Driver\MVCI Driver for TOYOTA TIS\` to that path (or extract `mvci-driver.rar` password `123`).
2. Merge `Driver\mvci-x64.reg` (elevated).
3. Desktop launcher: copy `MiniVCI-DeviceInfo.bat` — it `cd`s into the driver folder then starts the EXE. **Do not Run as administrator.**
4. Pierre clicks **Device Info** only. Need **Connected / 1.4.1**. If blank: driver bind, COM, not flash.

### 3. Uninstall leftover Techstream if any

If any Techstream is installed, uninstall it completely. Do not layer V18 on V12. Do not keep patched MainMenu from the ISO.

### 4. Install stock V18 — do not launch it

Run `Techstream_Setup_V18.00.008.exe` from the pack. Pierre clicks the wizard:

1. Language **English**.
2. **Next**.
3. Accept license → **Next**.
4. Name/company anything → **Next**.
5. **Install**.
6. Uncheck **Launch Techstream** if shown → **Finish**.

Default path: `C:\Program Files (x86)\Toyota Diagnostics\Techstream\`

If the wizard says it will “update 12.20.024 to 18.00.008”, you still have V12 leftovers — cancel, uninstall, delete the Techstream folder, run setup again as a **fresh** install.

### 5. Loader files + TISFunction

Copy from the pack (after hash check):

- `TS_loader.exe` → `...\Techstream\bin\TS_loader.exe`
- `TSRegistration.exe` → `...\Techstream\bin\TSRegistration.exe`

In `...\Techstream\Env\IT3System.ini` set **`TISFunction=0`** if it is `1`. Save.

Create a desktop shortcut:

- Target: `C:\Program Files (x86)\Toyota Diagnostics\Techstream\bin\TS_loader.exe`
- Start in: `C:\Program Files (x86)\Toyota Diagnostics\Techstream\bin`

Delete or ignore Public/`Desktop` stock `Techstream.lnk`. Always start from **TS_loader**.

### 6. TSRegistration (Pierre clicks; you stage the window)

Working directory = `bin`. Not System32.

1. Start `TSRegistration.exe`.
2. Pierre: region **Europe**, language **English**.
3. User type: leave **Official Dealer / Repairer**. **Not Independent** (Independent was set on PierrePC V12).
4. Junk dealer name/phone/code. Country **United Kingdom** is fine for EU English.
5. The tool writes `EU_LicKey.txt` (or similar) in `bin`. If a key dialog appears, paste from that file. **Do not** paste the V12 dummy `1111…50001703161820`.
6. If **Register Techstream Software (S314-01)** appears (key entry, not the empty warning): **Cancel** is OK once the loader is in play; S314-01 is what xwolf auto-closes.
7. **Setup → VIM Select → XHorse - MVCI**. Status bar must show a **DLL version** (`v1.4.6` / `1.4.7` / `1.4.8`), not just the name.
8. Close Techstream.

### 7. Desk Connect test

Cable still in USB. **No car.**

1. Start **TS_loader**. Leave the small **Toyota TS loader** window open. Grey **RUN no key** means Techstream is already running — that is normal. Do not close the loader.
2. Pierre clicks **Connect to Vehicle**.

| Result | Meaning |
| --- | --- |
| Vehicle year/model confirm, or communicate-fail / unable to connect to VIM | **Phase A done.** License is not the blocker. |
| Empty **S314-02** Warning → OK → nothing | License still dead. Do not go to the car. See fallbacks. |

Keep the laptop **offline** for this first Connect so TIS cannot invalidate the bypass.

### 8. Car (only after Phase A)

Ignition ON, engine running if you want live data. Cable in OBD under the dash.

Connect to Vehicle → if VIN fails, pick Prado / 2005 / 1KD-FTV manually.

Then:

1. **Health Check** — record every DTC. EDU / injector / immobiliser matter after the 2026-08-31 limp.
2. Fans: Engine and A/C ECU Data List, then **Active Test** only after you agree a write is needed (mains power, stable USB).
3. Injectors: Engine → Utility → **Injector Compensation** (#1 front) → then Utility → **Pilot Quantity Learning** (engine warm). Blocker: four **30-character** Denso IDs on the injectors. Do not invent codes.

Write captures under `captures/` (gitignored). Read them yourself.

---

## Fallbacks if Phase A still S314-02

In order. Do not invent a fourth plan.

1. Confirm you launched **TS_loader**, not `MainMenu.exe` / stock icon. Loader window still open.
2. Confirm `TS_loader.exe` hash still matches (Defender did not replace it).
3. Re-run `TSRegistration.exe` from `bin`, Europe, Official Dealer, keys from `EU_LicKey.txt`.
4. `IT3UserCustom.ini`: `[TBR - EU]` empty is the PierrePC failure mode. TSRegistration / loader should populate license state or skip the gate in memory. Dummy keys will not fill TBR.
5. Do **not** mix ISO MainMenu/KEY binaries onto V18.
6. Do **not** install V12 “because the Prado is old” unless V18 menus are missing 1KD Utility **after Connect already works**. V12 Connect is a known dead end on this cable/key set in 2026.
7. If you need another loader EXE, it must be a real PE (`MZ`), tens or hundreds of KB, **not** a `.lnk` and **not** a 352-byte zip. Yandex folder `https://disk.yandex.ru/d/6V5E7rLArBkuQQ` also has `18.00.008 +Driver+Utils` and `+crack + driver pass 1234` (password **1234**). Prefer those over MEGA.

---

## Pierre click cheat-sheet (say only this)

**Desk**

1. Plug Mini-VCI into the laptop USB. Plug the Ventoy stick if the pack is not already copied.
2. UAC **Yes** when Windows asks.
3. Device Info — never Update.
4. V18 installer: English → Next → accept → Next → Install → do not launch → Finish.
5. TSRegistration: Europe, English, Official Dealer, junk name, paste key from the notepad it creates if asked.
6. Setup → VIM Select → XHorse - MVCI → OK.
7. Close Techstream. Open **Techstream Loader** shortcut.
8. Leave the small loader window. Click **Connect to Vehicle**. Screenshot.

**Car (after Connect is past S314-02)**

1. Plug cable into the OBD port under the dash.
2. Ignition ON, engine running for live data.
3. Connect to Vehicle. Screenshot Health Check.

---

## Related docs (after this file)

- `docs/SESSION-LOG.md` — newest entries, failed attempts.
- `docs/TECHSTREAM-SANDBOX-VETTING.md` — Defender / VT rubric.
- `docs/WINDOWS-LAPTOP-START-HERE.md` — older laptop checklist; **this file wins** on recipe (V18 + TS_loader, not V12 dummy keys).
- `docs/DESKTOP-GO.md` — PierrePC only. Do not install Techstream there again.
- `docs/vehicle/notes.md` — EDU connector 2026-08-31, injectors uncoded, fans.

OpenMVCI `dtc_reader` on this laptop is **optional**. Techstream is the job. If you have CMake/MSVC and want a second opinion after Phase A, `--open-only` then `--read` with `MVCI_SERIAL_BAUD=115200` and `MVCI_SERIAL_CTRL_MODE=none`. Do not spend the session fixing K-line framing if Techstream already talks.
