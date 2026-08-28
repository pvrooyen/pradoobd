# Windows laptop — NOW (free Mini-VCI)

Paste this into the next session (nothing else):

```
Follow docs/LAPTOP-NOW.md
```

You are on **Elvera’s Windows laptop**. Pierre types nothing. You run every command. Report outcomes, not runbooks.

This file is the **only** job this week. Do **not** start Techstream, TIS, cracked software, Chromebook/ELM debug, or mock-watcher setup.

Full plan (do not invent a second one): [`docs/FREE-MINIVCI.md`](FREE-MINIVCI.md).

---

## What is already done (PierrePC, 2026-08-28)

OpenMVCI Windows path is **written and compiled**. Unit tests passed. No car yet. Cable was **not** plugged into the desktop.

| Done | Not done |
| --- | --- |
| `--clear` needs `--i-understand-this-writes` or it sends **zero** bytes | Live PIDs / freeze frame / Mode 22 capture files |
| Windows **serial** (FTDI VCP `CreateFile` on `COMx`) — **no libusb, no Zadig, no WinUSB** | Cable proof at the Prado |
| `--device serial:COM3` / `COM3` / `0403:6001` | Module ping |
| `--open-only` desk open/close | TIS / Techstream (later weekend, different doc) |
| Auto protocol: ISO15765 → ISO14230 fast-init → ISO9141 | |
| Other write flags are stubs (still send nothing) | |

Binary (after you build on **this** laptop): `openmvci\build\Release\dtc_reader.exe`  
(DLL next to it: `openmvci.dll`. `openmvci/build/` is gitignored — you must build here.)

---

## Facts (do not relitigate)

- Car: 2005 Prado 120, **1KD-FTV**, chassis KDJ120-0072377. Engine is **likely K-line**. CAN timeout ≠ dead cable.
- Cable: **new** Mini-VCI, FTDI **`0403:6001`**, serial **`A6VON31I`**. Not ELM327. Do not send `ATZ`.
- USB. Stay on **home WiFi**. Chat stays up.
- Never: Zadig / WinUSB, firmware flash, mini-CD, VirtualBox, cracked Techstream, `--clear` this week.

---

## You run (in order)

Repo: `https://github.com/pvrooyen/pradoobd.git`  
Folder: `C:\Projects\pradoobd`

### 1. Code + toolchain

`git pull origin main` (clone that folder if it does not exist).

Need **CMake** + **VS 2022 Build Tools** (MSVC, workload VCTools). Install with winget if missing — same as PierrePC. No VirtualBox.

```powershell
cd C:\Projects\pradoobd\openmvci
cmake -S . -B build -G "Visual Studio 17 2022" -A x64 -DBUILD_SHARED_LIBS=ON
cmake --build build --config Release
ctest --test-dir build -C Release --output-on-failure
```

Pass = all tests green, `build\Release\dtc_reader.exe` exists.

### 2. Cable on the laptop (no car)

Ask Pierre to plug Mini-VCI **USB into this laptop**. Then:

```powershell
Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue |
  Where-Object { $_.InstanceId -match 'FTDIBUS|VID_0403' } |
  Select-Object Status, FriendlyName, InstanceId | Format-Table -AutoSize
```

Expect `USB Serial Port (COMx)` and `VID_0403` + `PID_6001`. Note **COM**.

```text
.\build\Release\dtc_reader.exe --open-only --device serial:COM3 --verbose
```

(Use the COM you found.)

**Pass:** `PassThruOpen OK` then `Open/close desk test passed`.  
**Fail open:** software/driver — stop. Do not Zadig. Do not blame the car.

### 3. At the Prado (reads only)

Pierre: 16-pin under dash, USB in laptop, ignition **ON**, engine running if he can, laptop on charger. He says “in and on.”

```text
.\build\Release\dtc_reader.exe --read --device serial:COM3 --verbose
```

It tries CAN, then KWP, then ISO9141. Print the exact command, COM, and stderr.

| Result | Meaning | Next |
| --- | --- | --- |
| VIN and/or DTCs / “No active DTCs” | **Cable talks** | Phase 4 below |
| Open fails | Software | Fix serial; do not flash |
| Open OK, VIN/DTC timeout on **all** protocols | Log raw output; still no firmware flash; TIS weekend tests the same cable |

**Do not `--clear`.**

### 4. Only after the cable talks

Implement FREE-MINIVCI **phase 4**: live PIDs, freeze frame, Mode 22 sweep, write `captures/prado-<stamp>.{md,json}` (same markdown as the Node watcher). Record **raw bytes**. Do not mark Toyota decoders `confirmed` from one capture.

Then stop. Paid TIS weekend is `docs/WINDOWS-LAPTOP-START-HERE.md` — **not this file**.

---

## Pierre’s jobs

Plug USB + 16-pin, ignition, charger, say “in and on”, rev ~2500 when you say, say “done.”

Writes: only if he types the **exact flag name**. This week: refuse `--clear` even then (freeze frames are for TIS).
