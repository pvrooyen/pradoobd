# Free Mini-VCI work — single handover

Paste this into the next session (nothing else):

```
Follow docs/LAPTOP-NOW.md
```

**Now file (Windows laptop):** [`docs/LAPTOP-NOW.md`](LAPTOP-NOW.md). This file is the **full plan**. Do the work it orders. Do **not** invent a second plan.

**Already done on PierrePC (2026-08-28):** write gate, Windows serial (no libusb), `--open-only`, ISO15765→ISO14230→ISO9141 fallback in `dtc_reader`, write stubs, unit tests. **Not done:** cable on a machine, VIN/DTC at the Prado, live/Mode 22 capture writer.

- **Pierre types nothing** except that line (and physical steps at the car).
- **You run every command.** Report outcomes, not runbooks.
- **Do not spend TIS / Techstream money** from this file. Official 48-hour TIS is a **later weekend**, after this free path is done.
- **USB Mini-VCI.** Laptop stays on normal internet WiFi. Chat does not drop.

---

## What “done” means (free path)

1. This **new** Mini-VCI talks to the 2005 Prado (VIN and/or DTCs, or a clean “no DTCs”).
2. If CAN is silent, the same reads work on **K-line**.
3. Engine **live PIDs**, freeze frame, stored + pending DTCs, Mode 22 sweep, written to `captures/prado-*.{md,json}`.
4. Writes exist in the CLI but are **impossible to run by accident**.
5. Cable driver still FTDI VCP (COM port) so next-weekend Techstream is not sabotaged.

Until (1) passes, do not add live-data features. Cable talk first.

---

## Facts (do not relitigate)

| Item | Fact |
| --- | --- |
| Car | 2005 Toyota Land Cruiser Prado 120, **1KD-FTV 3.0 D-4D**, chassis KDJ120-0072377 |
| Cable | **Brand-new Mini-VCI J2534**, never used. Do **not** apply old ELM327 WiFi `BUS INIT: ERROR` results to this cable. |
| USB ID | FTDI **`0403:6001`**, serial **`A6VON31I`** (seen on Elvera laptop as **USB Serial Port (COM3)**) |
| Protocol expectation | Engine is **likely ISO 14230 / ISO 9141 K-line**. OpenMVCI today only connects **ISO 15765 CAN @ 500 kbit**. CAN-timeout ≠ dead cable. |
| This cable is not ELM327 | Do not send `ATZ` to COM3. python-obd / Torque / our `SerialTransport` (ELM ASCII) cannot drive it. |
| Our app | `packages/server` capture/watch speak ELM text. Mini-VCI needs **MVCI/J2534 framing** (`openmvci/`). |
| OpenMVCI today | `dtc_reader --read` / `--clear` / `--monitor`. Connects **ISO15765 only**. `--clear` is already a **write**. |
| Windows OpenMVCI today | `windows_transport.cpp` → **libusb only**. `serial_transport.cpp` is POSIX and **not compiled on WIN32**. Linux already prefers serial for Mini-VCI. |
| WiFi | Sorted. OBD is USB. Stay on home WiFi. |
| Next paid step | Official Toyota TIS **48-hour** Techstream (separate weekend). Not this file. |

Vehicle backlog this path can **inform** (engine codes / live / Mode 22): oil light, injectors uncoded (codes themselves are physical stamps, not a scan), fans not spinning (scan cannot **command** the fan for free without Toyota routine IDs).

Vehicle backlog this path **cannot** finish: A/C ECU Data List, fan Active Test, injector compensation + pilot learn, ABS/SRS/body Health Check. Those need Techstream.

---

## Safety contract (non-negotiable)

### Default: read-only

Every new binary and every new npm script **defaults to reads**. Unknown service byte = refuse (same idea as `packages/shared/src/safety.ts`).

**Reads (always allowed):**

| Service | Meaning |
| --- | --- |
| `01` | Live PIDs |
| `02` | Freeze frame — **keep**; paid weekend wants this |
| `03` / `07` / `0A` | Stored / pending / permanent DTCs |
| `06` | Monitor results (read) |
| `09` | VIN / cal IDs |
| `19` | UDS Read DTC Information |
| `1A` / `21` | KWP identification / local identifier |
| `22` | Toyota Mode 22 Read Data By Identifier |
| `23` | Read Memory By Address (read; do not add write-memory) |
| `3E` | Tester Present |

K-line **fast init / 5-baud init** is start-of-diagnostics, not a vehicle write. Allowed.

Address “are you there?” pings that only start communication + read are allowed.

### Writes: explicit command only

A write may run **only if all** of these are true:

1. Pierre typed the **exact flag name** in chat (not “go ahead”, not “do the rest”).
2. The process was started with **`--i-understand-this-writes`**.
3. The process was started with **one specific write flag** (see table).
4. Laptop on **mains power**, USB **direct** (no flaky hub), ignition in the state the command needs.

If any check fails: print why, send nothing, exit non-zero.

**Do not** run writes “while we are here.” Pierre said they will **probably not be used**. Implement the gate anyway so the free path is complete.

| Flag | Service | What it does | When it might ever be used |
| --- | --- | --- | --- |
| `--clear` | OBD `04` / UDS `14` | Erases DTCs **and freeze frames** | Almost never before TIS weekend |
| `--io-control <hex>` | UDS `2F` | Force an actuator | Only with a known payload |
| `--routine <hex>` | UDS `31` | Active test / utility routine | Fan, etc. — **IDs unknown without Techstream** |
| `--ecu-reset` | UDS `11` | Reset ECU | Never for diagnosis |
| `--security-access` | UDS `27` | Unlock writes | Never |
| `--write-did <hex>` | UDS `2E` / KWP `3B` | Write identifier | Injector coding lives here / in Techstream Utility |
| `--write-memory` | UDS `3D` | Write memory | Never |
| `--reflash` | `34`–`38` | Download/transfer | Never |
| `--control-dtc` | UDS `85` | Silence DTC setting | Never |

**`--clear` already exists** in `openmvci/tools/dtc_reader.cpp` **without** the dual-flag gate. **First code change:** refuse `--clear` unless `--i-understand-this-writes` is also present. Same for any new write.

Do **not** invent Toyota fan/injector routine IDs. If `--routine` / `--io-control` is passed without a hex payload file, refuse. Stub is correct. Guessing payloads is how you move a fan **or** a turbo vane.

### Never, even with flags

- **Zadig / WinUSB** on this Mini-VCI (steals FTDI; breaks next-weekend Techstream).
- **FirmwareUpdateTool → Update** (bricks clones). Device Info only, and only if Pierre asks.
- Mini-CD that shipped with a cable (malware).
- VirtualBox / hypervisor / USB-filter drivers.
- Cracked Techstream (this file is free **open-source** only).
- Clearing DTCs “to see if they come back” before the TIS weekend.

---

## Operating model

You are the mechanic. Pierre is hands at the car.

His jobs: plug 16-pin into the Prado OBD port (under dash, driver side), USB into the laptop, ignition ON (engine **running** for live data / Mode 22 that needs rpm), rev to ~2500 when you say, tell you cold vs warm.

Your jobs: detect COM port, build, run, read capture files, interpret RAW bytes.

Because this is USB, **do not** start a “go offline” watcher dance. Run the tool while chat is live.

---

## Phase 0 — machine + cable (no car protocol yet)

On the Windows PC that will talk to the car:

1. Confirm Git + Node ≥ 20. Repo: `https://github.com/pvrooyen/pradoobd.git` (typical folder `C:\Projects\pradoobd`). `git pull origin main`.
2. Confirm Mini-VCI:

```powershell
Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue |
  Where-Object { $_.InstanceId -match 'FTDIBUS|VID_0403' } |
  Select-Object Status, FriendlyName, InstanceId | Format-Table -AutoSize
```

Expect `USB Serial Port (COMx)` with `VID_0403+PID_6001`. Note the **COM number** (was COM3 on Elvera’s laptop; it can differ).

3. **Do not** reinstall FTDI, do not Zadig, do not flash firmware.

If no COM port: unplug/replug USB, retry once, then stop and tell Pierre the cable is not enumerating.

---

## Phase 1 — Windows OpenMVCI build (serial, not WinUSB)

**Blocker today:** OpenMVCI on Windows is libusb-only. Libusb on an FTDI device usually wants WinUSB. That is incompatible with “keep FTDI for TIS next weekend.”

**Required work:** Windows **serial** backend that speaks the same Mini-VCI bootstrap + MVCI packets as `src/platform/serial_transport.cpp`, using Win32 `CreateFile` on `COMx`.

Implementation notes for the builder:

- Compile `serial_transport` on Windows **or** add `src/platform/windows_serial_transport.cpp` that duplicates framing/bootstrap from the POSIX file (do not leave Windows on libusb-only).
- Mirror Linux dispatch (`linux_transport.cpp`): if `--device` is `COM3`, `COM3:`, `serial:COM3`, or `0403:6001`, **open serial first**. Fall back to libusb **only** if serial open fails **and** Pierre has explicitly accepted that TIS may break (he has not; so **do not implement a WinUSB path as default**).
- Prefer making `LibUSB` **optional** on Windows when serial works, so cmake does not force vcpkg + WinUSB.
- Need MSVC (Build Tools) + CMake. Typical:

```powershell
cd C:\Projects\pradoobd\openmvci
cmake -S . -B build -A x64 -DBUILD_SHARED_LIBS=ON
cmake --build build --config Release
```

Binary path may be `build\Release\dtc_reader.exe` or `build\tools\Release\dtc_reader.exe` — use whatever CMake actually emits.

- Unit tests: `ctest --test-dir build -C Release --output-on-failure` for host tests. They do not need the car.
- **Do not** run `--clear` during this phase.

If cmake/MSVC/libusb fights you: serial-first is the hill to die on, not a full libusb stack.

---

## Phase 2 — stock reader on the car (CAN first, then stop or fall through)

At the car: 16-pin in, USB in, **ignition ON**. Engine running if Pierre can (better). You still have internet.

```text
dtc_reader.exe --read --device serial:COM3 --verbose
```

(Use the COM you found. Also try `--device 0403:6001` if serial selector wiring uses VID/PID.)

| Result | Meaning | Next |
| --- | --- | --- |
| VIN and/or DTCs / “no DTCs” | Cable talks on **CAN** | Phase 4 (live + Mode 22) on ISO15765 |
| Open fails | Software/driver, not the ECU | Fix serial backend; do not blame the car |
| Open OK, VIN/DTC **timeout** | Expected if this ECU is **K-line** | Phase 3. **Do not** declare the new cable dead |

Log the exact command, COM port, and stderr into the capture notes.

**Do not `--clear`.**

---

## Phase 3 — K-line (ISO 14230 / ISO 9141)

Add J2534 protocol IDs (SAE):

- `PROTOCOL_ISO9141 = 0x0003`
- `PROTOCOL_ISO14230 = 0x0004`

(Already have `PROTOCOL_CAN = 0x0005`, `PROTOCOL_ISO15765 = 0x0006`.)

`PassThruConnect` today only stores the protocol in a map; it does **not** fail unknown IDs. The cable still needs the right **framed** protocol on write, plus **fast init** (ISO 14230) or **5-baud init** (ISO 9141). Use existing Mini-VCI traces (`openmvci/tools/*trace*`, `run_minivci_mapping.sh`) rather than guessing byte-by-byte if traces show init.

`dtc_reader` / new CLI:

1. Try ISO15765 @ 500000 (today).
2. If timeout: ISO14230 **fast init** (typical 10400 baud).
3. If timeout: ISO9141 5-baud init.
4. Print which protocol answered.

KWP target: Toyota engine is often address **`0x10`**. Functional / broadcast if the stack has it. Do not spray write services at random addresses.

Pass = VIN and/or DTCs on **any** protocol. That is the OpenMVCI cable proof (`START.md` meaning), now valid for this new USB adaptor.

---

## Phase 4 — more **reads** than OpenMVCI has today

Still read-only. Prefer **one CLI** so Pierre never juggles tools. Suggested name: keep `dtc_reader` for the proof, add `openmvci/tools/prado_scan.cpp` (or subcommands) that writes the same capture shape as `packages/server/src/watch.ts`.

### 4a. SAE J1979

- Mode `01` supported-PID bitmap (`0100`, `0120`, …) then every supported live PID.
- Mode `02` freeze frame if a stored DTC exists.
- Mode `03` stored, `07` pending, `0A` permanent.
- Mode `09` VIN / cal.

Six snapshots ~5 s apart; print `>>> REV TO ~2500 RPM AND HOLD NOW <<<` on snapshot 4 (same as the Node watcher).

### 4b. Toyota Mode 22

Reuse identifiers and ranges from `packages/shared/src/toyota.ts`. Default sweep `0x0100–0x01FF` (env `MODE22_START` / `MODE22_END` already used by the Node watcher).

Record **raw bytes**. Do **not** mark decoders `confirmed` from a single capture. Idle vs rev (and if possible cold vs warm) before trusting a scaling.

### 4c. Module ping (read-only)

KWP/UDS “start + tester present + read ident” on a small address list (engine `0x10` first, then a documented Toyota diagnostic address table if you add one from public sources). **Timeout = absent.** Do not clear, do not IO-control.

This is “who answered,” not A/C Data List.

### 4d. Capture files

Write `captures/prado-<stamp>.md` + `.json` in the **same markdown sections** the Node watcher already produces (adapter, protocol, VIN, PID table with raw hex, DTCs, Mode 22 hits). Next session diagnoses from the `.md` without Pierre pasting.

Optional later: Node `J2534Transport` / child-process wrapper around the C++ reader so `npm run watch` uses Mini-VCI. **Not required** if the C++ writer already emits those files. Do not spend a week on the React UI.

---

## Phase 5 — write flags (implement, do not use)

After reads work:

1. Gate `--clear` behind `--i-understand-this-writes`.
2. Parse the other write flags; **refuse** without the dual flags; **refuse** `--routine` / `--io-control` / `--write-did` without explicit hex.
3. Log to stderr: `WRITE BLOCKED: …` or `WRITE SENT: <service> at <timestamp>` .
4. Unit-test the gate (flag missing → no TX).

**Do not run these at the car** unless Pierre types the flag names in chat. Before TIS weekend, **refuse `--clear` even if he asks**, and remind him freeze frames are for Techstream — unless he overrides that reminder in the same message.

---

## Phase 6 — stop. Paid weekend is a different doc

When captures exist and DTCs are **still stored**:

- Stop free writes.
- Leave FTDI VCP bound.
- Paid path: `docs/WINDOWS-LAPTOP-START-HERE.md` + `docs/TECHSTREAM-WINDOWS.md` (official TIS 48-hour). Health Check + Data Lists first. Active tests / injector Utility only after reads, laptop on mains.

This file does **not** install Techstream.

---

## What you may use from other open source

| Use | Why |
| --- | --- |
| This repo’s OpenMVCI + `safety.ts` + `toyota.ts` + capture markdown | Already ours |
| Public J2534 protocol IDs, ISO 14230 fast-init description, SAE J1979 PID list | Standards |
| OBDb / community Mode 22 **candidates** | Seed list only, same as `toyota.ts` |

| Do not rely on | Why |
| --- | --- |
| python-obd, Torque, Freediag, our ELM `SerialTransport` | Wrong cable protocol |
| J2534Diag / GenericDiagnosticTool | Need a registered J2534 DLL; still no Toyota A/C dictionary |
| Zadig + random libusb examples | Breaks TIS |

Do not vendor cracked Techstream as “free.”

---

## Implementation order (builder)

Do in this order. Do not skip ahead to Mode 22 before the cable talks.

1. **`--clear` dual-flag gate** on existing `dtc_reader` (safety first, small diff).
2. **Windows serial transport** + `--device serial:COMx` (no Zadig).
3. Desk test: `PassThruOpen` + version/IO on COM port with cable plugged into laptop only (no car). Open/close must work.
4. At car: **`--read`** CAN.
5. **K-line connect + init**; `--read` again.
6. **Live PIDs + freeze frame + Mode 22 + capture markdown.**
7. **Module ping.**
8. **Remaining write flags** as refuse-by-default stubs (+ `--clear` already gated).
9. Stop.

Commit as you go if Pierre wants; this handover commit is the plan only.

---

## Pierre’s physical script (you prompt him)

**Read sessions:**

1. Laptop on home WiFi + **charger**.
2. Mini-VCI USB in the laptop, 16-pin in the Prado.
3. Ignition ON; engine running for live/Mode 22.
4. He tells you “in and on.”
5. You run the reader. He revs ~2500 when you say.
6. He says “done.” You read `captures/*.md`.

**Writes:** only if he types the flag. Then charger, no hub, engine state you specify. Prefer **not** before TIS weekend.

---

## Success / fail

| Gate | Pass |
| --- | --- |
| COM port | `VID_0403` `PID_6001` present |
| Serial OpenMVCI | `PassThruOpen` on `serial:COMx` without WinUSB |
| Cable talks | VIN or DTCs or explicit no-DTC on CAN **or** K-line |
| Engine capture | `captures/prado-*.md` with raw live PIDs and Mode 22 hits or honest empties |
| Write gate | `--clear` without `--i-understand-this-writes` sends **zero** bytes (test without the car) |
| TIS-ready | Freeze frames not wiped; FTDI VCP still bound |

Fail of CAN-only `--read` is **not** end of this file. Fail of serial open **is** a software stop. Fail of CAN **and** K-line after a real init attempt: report raw logs; still do not flash firmware; TIS weekend becomes the next protocol test of the same cable.

---

## Files you are expected to touch (when building)

- `openmvci/include/mvci/j2534.hpp` — ISO9141 / ISO14230 IDs
- `openmvci/src/platform/` — Windows serial + dispatch (keep FTDI)
- `openmvci/CMakeLists.txt` — serial on WIN32; libusb optional if possible
- `openmvci/tools/dtc_reader.cpp` — protocol fallback, write gate
- `openmvci/tools/` — live/Mode 22/capture writer (new)
- `openmvci/src/uds.cpp` — keep CAN path; add KWP/K-line request path as needed
- Tests next to existing `openmvci/tests/`
- `captures/` — runtime only, do not commit car captures unless Pierre asks

Do **not** need to change the React UI for this path.

---

## Out of scope (say no)

- Paying TIS from this session
- Injector 30-char entry (need stamps + Techstream)
- Fan Active Test payloads (need Toyota routine IDs)
- A/C ECU dictionary
- Chromebook / ELM327 WiFi re-debug
- Hypervisors, cable firmware, Zadig
)
