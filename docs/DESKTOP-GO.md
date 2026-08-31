# Desktop GO — 2026-08-31 handover

Paste this into Grok on **Pierre’s Windows desktop** (nothing else):

```
Follow docs/DESKTOP-GO.md
```

You run every command. Pierre types **go**, plugs the Mini-VCI, ignition ON. He clicks **Device Info** when you put the window in front of him. He does not use the terminal.

---

You are on **PierrePC (Windows desktop)**, not Elvera’s laptop. Elvera had **no CMake/MSVC**. This desktop already built OpenMVCI Windows serial (commit on `main`: write gate + `CreateFile` COM). Use that.

**2026-08-31:** Do **not** install Techstream on this PC. Pierre aborted V18 here. Techstream + Mini-VCI GUI is **`docs/LAPTOP-GO.md`** on Elvera’s Windows, pack on the Ventoy stick `prado-techstream\`.

## What “done” is for this session

1. Mini-VCI enumerated (FTDI `0403:6001`, some `COMx`).
2. `dtc_reader.exe --open-only --device serial:COMx --verbose` opens and closes (baud hunt: **115200**, ctrl **none** first — proven on Elvera).
3. Ignition ON / engine running: `dtc_reader.exe --read --device serial:COMx --verbose`. VIN and/or DTCs **or** a clean no-DTC list **or** an honest K-line timeout log. Write `captures/`.
4. Optional kit check: XHorse **Device Info** (not Update) for firmware **1.4.x vs 2.0.x**.
5. **Do not pay TIS.** Standalone Techstream Health Check only if Device Info connected **and** Pierre still wants the Takealot GUI.

---

## Facts (do not relitigate)

| Item | Fact |
| --- | --- |
| Car | 2005 Prado 120 **1KD-FTV** Euro III, chassis **KDJ120-0072377**, plate **ACZ 676 MC** |
| Bus | Engine is **K-line** (ISO 14230 / ISO 9141), **not** OBD CAN. CAN-silent is expected. |
| Cable | Takealot **Toyota Diagnostic Mini VCI + TIS Techstream**. FTDI **`0403:6001`**, serial **`A6VON31I`**. On Elvera laptop it was **COM3**. Desktop COM number **will differ**. |
| This cable is not ELM327 | Do not send `ATZ`. python-obd / our ELM `SerialTransport` cannot drive it. |
| Official TIS 48h | **Do not buy** to test this cable. Toyota validates **Mongoose-Plus/Pro** for Techstream Lite diagnostics, **not** Mini-VCI. Cheap TIS “Standard/Library” has **no Techstream**. |
| Mini-CD | **Never.** Documented malware. Pierre cannot use it anyway. |
| Firmware flash | **Never.** `FirmwareUpdateTool` **Device Info only**. Update bricks clones. |
| Zadig / WinUSB | **Never.** Keeps FTDI VCP for later TIS if ever. |
| Hypervisor | **Never** on the daily desktop (VBoxUSBMon killed Bluetooth 2026-07-01). |
| Elvera laptop | Staging + driver install happened **there**. Desktop does **not** inherit Program Files. Re-do driver install here. |

Repo: `https://github.com/pvrooyen/pradoobd.git`  
Typical desktop folder: `C:\Projects\pradoobd` (or Pierre’s Drive copy — `git pull` whichever is canonical).

---

## What 2026-08-31 already proved (Elvera laptop, engine running)

**Cable brain works.** Mini-VCI serial bootstrap **passed** at **115200 8N1, DTR/RTS off** (`ctrl=none`). All 13 post-bootstrap unlock steps ACKed. COM3 FTDI live.

**ECU did not answer the Node dump.** No VIN, 0 DTCs, 0 Mode 01, 0 Mode 22. RX was only Mini-VCI keepalive. Cause: `scripts/minivci-live-dump.mjs` unlocks the dongle then sends **ICVM/ISO15765** frames. Do **not** spend a day fixing that script. Desktop `dtc_reader` already has ISO14230/ISO9141 fallback — use that.

**“Lost all power” in park** is **unexplained**. Scan never saw RPM/coolant/rail.

Captures (local only, gitignored):  
`captures/prado-live-2026-08-31T14-23-58-823Z.md`

**Driver files were installed on Elvera only:**

- `C:\Program Files (x86)\XHorse Electronics\MVCI Driver for TOYOTA TIS\`  
  `FirmwareUpdateTool.exe`, `MVCI32.dll`, `ftd2xx.dll`, `setting.ini`, `Language\`
- `HKLM\SOFTWARE\WOW6432Node\PassThruSupport.04.04\XHorse - MVCI` → that DLL
- VC++ 2015–2022 **x86** redist; 7-Zip; System Restore point `Before Mini-VCI Techstream install`
- Desktop launcher `MiniVCI-DeviceInfo.bat` (also `scripts/MiniVCI-DeviceInfo.bat`)

**FirmwareUpdateTool “UAC then nothing”:** Run-as-admin sets cwd to `System32`, so the 2010 GUI dies. **Do not Run as administrator.** Use the `.bat` which `cd`s into the driver folder first.

Device Info was **never completed**. That is the first thing you do on the desktop.

---

## Driver pack to re-use (no mini-CD)

Yandex public folder (driver + J2534 files, **not** full Techstream):  
https://disk.yandex.ru/d/jLtF9tZdxqF1dA  

RAR password: **`123`**  
Size **3772270**  
SHA256 `BD9377A01365D1C48A02AB983B1E9804C53390027D3BB22BB85F9B952127275F`  
MD5 `65BB9A8AA5CC7D204B4B2EEF5D397E69`

Copy into `C:\Program Files (x86)\XHorse Electronics\MVCI Driver for TOYOTA TIS\`:

- `FirmwareUpdateTool.exe` (SHA256 `A422B08070153FF2D6F29770B9BF6A3207F28C23129FD3BE335520E8628EDA47`)
- `MVCI32.dll`
- `ftd2xx.dll`
- `setting.ini` + `Language\`

**Do not** copy `ProgramFilesFolder\...\IT3System.ini` (Techstream crack).  
**Do not** install the bundled 2016 `ftdibus.inf` over a working FTDI VCP.  
**Do not** install `driver-dl\toyota-mvci-8.10.021-driver.zip` (126 MB = Techstream **8.10.021 + MainMenu.exe patch**). Same risk class as the mini-CD.

Registry: `scripts/mvci-x64.reg` (import **after** the DLL exists at that path).

---

## Steps you run when Pierre says **go**

### 0. Machine

```powershell
hostname
git -C C:\Projects\pradoobd pull origin main
git -C C:\Projects\pradoobd log -3 --oneline
```

If the repo lives elsewhere, pull that path.

### 1. Cable (read-only)

```powershell
powershell -File C:\Projects\pradoobd\scripts\check-cable.ps1
```

Need Status OK, VID_0403/PID_6001, a COMx. Note the COM number. Unplug/replug once if missing. **No Zadig.**

### 1b. OpenMVCI `--open-only` then `--read` (primary, already built here)

Binary: `openmvci\build\Release\dtc_reader.exe` (rebuild if missing; VS 2022 + CMake as in `docs/LAPTOP-NOW.md`).

```text
.\openmvci\build\Release\dtc_reader.exe --open-only --device serial:COM3 --verbose
```

Use the COM you found. Elvera needed **115200** and **DTR/RTS none**. If env vars exist (`MVCI_SERIAL_BAUD`, `MVCI_SERIAL_CTRL_MODE=none`), set those.

Then at the car, ignition ON (engine running if he can):

```text
.\openmvci\build\Release\dtc_reader.exe --read --device serial:COM3 --verbose
```

Do **not** `--clear`. Protocol fallback should try ISO15765 then ISO14230 then ISO9141. CAN timeout ≠ dead cable.

### 2. MVCI driver on **this** PC

If `FirmwareUpdateTool.exe` is missing under Program Files (x86)\XHorse…:

1. Download the Yandex RAR, verify hashes.
2. Extract (7-Zip). Password `123`.
3. Copy the four bullets above into the XHorse folder.
4. `reg import C:\Projects\pradoobd\scripts\mvci-x64.reg`
5. Install **VC++ 2015–2022 x86** if SysWOW64 lacks `vcruntime140.dll`:  
   `https://aka.ms/vs/17/release/vc_redist.x86.exe`

### 3. Device Info (Pierre clicks)

```powershell
powershell -File C:\Projects\pradoobd\scripts\MiniVCI-DeviceInfo.bat
```

Tell him: **Device Info only. Not Update.** Not Run as admin.

Record: connected y/n, firmware string.

| Firmware | Meaning |
| --- | --- |
| **1.4.x** | Good K-line bet for this 2005 1KD. Continue to Techstream. |
| **2.0.4** | Known clone K-line bugs. Still try Techstream once; do not flash “to fix it”. |
| Not connected | Stop. Driver/cable. No TIS money. |

### 4. Standalone Techstream (only after Device Info connected)

Need the **Takealot software folder** (USB / seller download), **not** the mini-CD, **not** the 8.10.021 crack zip.

Install order (`docs/TECHSTREAM-WINDOWS.md`): Techstream → (driver already done) → VIM Select **XHorse - MVCI** → Connect to Vehicle. If VIN auto-read fails: market + **Land Cruiser Prado / 2005 / 1KD-FTV**.

Then **Health Check** (read-only). Save screenshot + text into `captures/techstream-healthcheck-<iso>.md`.

Do **not** Active Test, injector Utility, clear DTCs, or reflash unless Pierre types the exact flag names in chat.

### 5. Stop. Paid TIS is a different weekend

Only after Health Check works **or** Device Info failed honestly. Official 48h TIS still wants a **Mongoose** for a supported diagnostic VIM.

---

## Safety

Reads only until Pierre names a write. Laptop on charger for any later write. USB direct, no flaky hub.

---

## Open vehicle backlog (scan can inform, not finish)

Oil light (confirm **yellow A/T oil temp** vs **red oil-can**), turbo oil-feed leak, injectors replaced **uncoded** (need 30-char stamps — scan cannot invent them), fans not spinning (needs Techstream Active Test IDs).
