# HANDOVER — OpenMVCI cable test

OpenMVCI Mini-VCI K-line test on the 2005 Prado diesel. No cracked Techstream. No TIS until VIN and/or DTCs print.

Crostini is `lsusb` only. This file is for Mint live after clone.

## After clone

```bash
cd pradoobd/openmvci
sudo apt update
sudo apt install -y git cmake g++ pkg-config libusb-1.0-0-dev
cmake -S . -B build -DBUILD_SHARED_LIBS=ON
cmake --build build -j"$(nproc)"
lsusb
./build/dtc_reader --read --device 0403:6001
```

Ignition ON. Expect `0403:6001` or `0403:6010`. Try `--device 0403:6010` if the first ID is missing.

## Pass / fail

- Pass: VIN and/or DTCs print (or a clean no-DTC list). Cable talks.
- Fail: no USB ID, or no VIN/DTCs.

## Next

- Pass: stop. Cable is proven. TIS is allowed to consider after this.
- Fail: other USB ID, then Windows at the truck last. Still no VIN/DTCs = do not buy TIS.
