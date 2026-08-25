# START — OpenMVCI cable test (2005 Prado diesel)

Prove the Mini-VCI K-line talks **before** any TIS spend. Free OpenMVCI only. No cracked Techstream.

Folder: `C:\Users\pierr\My Drive\Projects\pradoobd`  
OpenMVCI lives in `openmvci/`. Remote: `https://github.com/pvrooyen/pradoobd.git`

VIN printed or DTCs listed = the cable talks. Then you can consider TIS. Not before.

## Which machine

| Machine | Role |
| --- | --- |
| **Windows desktop** | Create and commit the project. Drive sync + `git push`. No truck needed. |
| **Mint live USB on the HP x360** | Real portable test at the Prado. Use this. |
| **Crostini (ChromeOS Linux)** | 30-second check only. FTDI passthrough usually fails. If `lsusb` shows nothing, stop and boot Mint live. |
| **Windows at the truck** | Last resort if Mint live cannot see the adapter. |

Look for USB IDs **`0403:6001`** or **`0403:6010`** (FTDI Mini-VCI).

## Chromebook: boot Mint live (x360 14-da)

1. Plug in the Linux Mint live USB (the SanDisk installer).
2. Shut down the Chromebook.
3. Hold **Esc + Refresh**, tap **Power**, then at the screen press **Ctrl+D** only if you already use ChromeOS developer mode — for USB boot you want **Ctrl+U** (USB). If Ctrl+U does nothing, the x360 is not in developer mode yet: turn it on first (Recover + wait through the warning), then reboot and **Ctrl+U**.
4. Boot Mint **Try**, do not install over ChromeOS.
5. At the truck: ignition **ON** (engine can stay off). Plug Mini-VCI into the OBD port and the Chromebook.

## Chromebook: start OpenMVCI (Mint live)

```bash
sudo apt update
sudo apt install -y git cmake g++ pkg-config libusb-1.0-0-dev
git clone https://github.com/pvrooyen/pradoobd.git
cd pradoobd/openmvci
cmake -S . -B build -DBUILD_SHARED_LIBS=ON
cmake --build build -j"$(nproc)"
lsusb
# expect 0403:6001 or 0403:6010
sudo usermod -aG dialout "$USER"
# log out/in once if /dev/ttyUSB0 is permission denied
./build/dtc_reader --read --device 0403:6001
```

If you already cloned earlier today:

```bash
cd pradoobd && git pull
cd openmvci && cmake --build build -j"$(nproc)"
./build/dtc_reader --read --device 0403:6001
```

If the binary landed under `build/tools/`, run that path instead.

## Crostini 30s check (optional)

Settings → Linux → USB → share the Mini-VCI. In penguin:

```bash
lsusb
```

If there is no `0403:6001` / `0403:6010`, do not debug Crostini. Boot Mint live.

## Windows (desk, or last-resort truck)

Needs MSVC + CMake + libusb. Many Mini-VCI clones also need Zadig → WinUSB.

```powershell
cd "C:\Users\pierr\My Drive\Projects\pradoobd\openmvci"
cmake -S . -B build -A x64 -DBUILD_SHARED_LIBS=ON
cmake --build build --config Release
.\build\Release\dtc_reader.exe --read --device 0403:6001
```

## Pass / fail

- **Pass:** `dtc_reader --read` prints a VIN and/or DTCs (or a clean “no DTCs”). Cable talks.
- **Fail:** no USB ID, or the reader never gets a VIN/DTC. Try the other ID, then Windows at the truck. Still no: the adapter is not talking — do not buy TIS yet.

Do not clear DTCs (`--clear`) on the first run.
