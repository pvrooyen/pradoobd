# HANDOVER — orders to the next Grok

> **Pierre said GO on Elvera’s Windows laptop (Techstream, 2026-08-31+)?**
> Ignore everything below. Read [`docs/LAPTOP-GO.md`](docs/LAPTOP-GO.md).
> Paste prompt: `Follow docs/LAPTOP-GO.md`
> USB pack on the Ventoy stick: `prado-techstream\` (do not format the stick).
>
> **Pierre said GO on the Windows desktop?** Read
> [`docs/DESKTOP-GO.md`](docs/DESKTOP-GO.md). Do **not** install Techstream on
> PierrePC — that job moved to the laptop.
>
> **On Elvera's Windows laptop and the job is OpenMVCI only (no Techstream)?**
> Follow [`docs/LAPTOP-NOW.md`](docs/LAPTOP-NOW.md). Full plan:
> [`docs/FREE-MINIVCI.md`](docs/FREE-MINIVCI.md).

You are on Pierre's HP Chromebook x360 14-da (board SONA). He types little. Do the work. Do not send him through Recovery. Chrome OS Linux (Crostini) is already on.

Goal: OpenMVCI Mini-VCI K-line test on the 2005 Prado diesel. No cracked Techstream. No TIS until VIN and/or DTCs print.

## 1. Find the cable now

Search for the Mini-VCI. Do all of this without asking him to wander Settings unless a click only he can do is required:

- Chrome OS Settings → Linux → USB → share the Mini-VCI / FTDI device to Linux
- `lsusb` — look for `0403:6001` or `0403:6010`
- `dmesg -T | tail -80` and `ls -l /dev/ttyUSB* /dev/ttyACM*`
- Try both IDs. Unplug/replug once, share again, recheck

If found: build and run immediately (ignition ON if he is at the truck):

```bash
sudo apt update
sudo apt install -y git cmake g++ pkg-config libusb-1.0-0-dev
cd ~/pradoobd/openmvci 2>/dev/null || cd openmvci
cmake -S . -B build -DBUILD_SHARED_LIBS=ON
cmake --build build -j"$(nproc)"
./build/dtc_reader --read --device 0403:6001
```

If that ID is missing, use `--device 0403:6010`. VIN and/or DTCs (or a clean no-DTC list) = pass. Stop. Cable talks.

## 2. If not found: enable Mint boot for next restart

He has been in developer mode for weeks. Do NOT Esc+Refresh+Ctrl+D. That powerwashes. Do NOT install UEFI Full ROM. Do NOT open the laptop.

Prefer, in this order:

1. Real Chrome OS shell (`chronos`) if you can reach it: `sudo crossystem dev_boot_usb=1 dev_boot_legacy=1`
2. Else VT2 at the login screen: Ctrl+Alt+Right-arrow, login `chronos` (no password), then the same `crossystem` line
3. Else only: `cd; curl -LOf https://mrchromebox.tech/firmware-util.sh && sudo bash firmware-util.sh` — option 1 RW_LEGACY only

Tell him the next restart: Mint USB in, at OS verification is OFF press **Ctrl+L** (not Ctrl+U), Esc, pick USB. Then clone this repo again and say: continue as per HANDOVER.md

No Windows PC. He stays on this Chromebook.
