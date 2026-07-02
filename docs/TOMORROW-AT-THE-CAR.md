# Tomorrow at the car — the run sheet (borrowed Windows laptop)

One page. Follow top to bottom. Claude drives the terminal; you plug things in,
click inside Techstream when told, and read values back. The Mini-VCI is USB, so
you STAY ONLINE the whole time — Claude is with you live, no offline capture.

Target: 2005 Prado, 1KD-FTV 3.0 D-4D. Jobs today: (1) whole-car Health Check,
(2) cooling fans — Active Test to isolate relay vs. motor vs. input logic.
Injector coding is DEFERRED (needs the 30-char injector codes we don't have).

---

## Phase 0 — before the car (at a desk, online)

1. **System Restore point** (reversibility; built-in, no drivers).
2. **Download** free Techstream **V16.20.023** + MVCI driver + `mvci-x64.reg`
   from a reputable source (OBDII365 / UOBDII / ih8mud pack).
   ⛔ NOT the mini-CD that shipped with the cable (documented malware vector).
3. **Vet before running** (you at the browser; Claude interprets):
   - Drag the archive onto **virustotal.com**. Paste the result URL to Claude.
   - Rubric verdict (from `docs/TECHSTREAM-SANDBOX-VETTING.md`):
     - Expected-OK: a `Riskware`/`Keygen`/`PUA`/`Ymacco` flag on the **launcher only**.
     - DISCARD: any named stealer/RAT (RedLine, Vidar, Lumma, njRAT, AsyncRAT…),
       OR the Behavior/Contacted-Domains tab shows **any outbound connection**
       (a local OBD tool has no reason to phone home).
   - Keep the laptop **OFFLINE while Techstream runs**.

## Phase 1 — prove the cable (30 seconds)

Plug the Mini-VCI USB into the laptop. Claude runs:

    powershell -ExecutionPolicy Bypass -File scripts\check-cable.ps1

PASS = `RESULT: CABLE LIVE (Status OK)`. If it says phantom/not-live, replug and
re-run. If NOT FOUND, install the FTDI VCP driver first.

## Phase 2 — install (order matters; you click, Claude guides)

1. Install **Techstream** (don't launch yet).
2. Install **MVCI driver** (XHorse "MVCI Driver for TOYOTA TIS").
3. Confirm **FTDI VCP driver** bound (re-run check-cable.ps1 → COMx).
4. Merge **`mvci-x64.reg`** (64-bit Windows).
5. Run **`FirmwareUpdateTool.exe`** → **Device Info**. It must report the cable
   connected. THIS is the definitive genuine-cable proof. ⛔ NEVER click the
   firmware flash/update button — it bricks clone cables.
6. Launch Techstream → **Setup → VIM Select → XHorse MVCI**.

## Phase 3 — connect to the Prado

1. Engine **running**, climate **on**, cable in the OBD port (under dash, driver side).
2. Techstream → **Connect to Vehicle**. If VIN auto-read fails: pick market →
   **Land Cruiser Prado** / **2005** / **1KD-FTV** manually.

## Phase 4 — diagnose (READ-ONLY first — changes nothing)

1. **Health Check** → scans EVERY ECU (engine, A/C, ABS, SRS, body). Record ALL
   DTCs (screenshot or type them to Claude). This is your "whole-car status."
2. Tell Claude the results. Claude correlates and decides next step.

## Phase 5 — cooling fans (the fan question)

Only after Health Check, and only deliberately:
1. Engine/A-C ECU **Data List** — see if the fan is being *commanded* on and
   whether inputs (coolant temp, A/C pressure) look sane.
2. Fan **Active Test** — command the fan ON.
   - Fan spins → fan + wiring + relay OK → fault is upstream (a sensor/logic
     telling it not to run). Then check the specific fuse/relay for that circuit
     with a $3 test light.
   - Fan does NOT spin → fault is the fan motor, its relay, or its wiring.

### WRITE-SAFETY (Active Test is a WRITE)

Before ANY active test: laptop on **mains power**, **stable USB** (no flaky hub),
engine in the expected state. Losing power/USB mid-write is how ECUs get bricked.
NEVER run reflash / calibration / immobiliser writes for this job.

---

## Deferred (not today)

- **Injector coding** — needs the 30-char code etched on each of the 4 injectors
  (or on the fitment receipt / injector boxes / install photos). Without them it
  is impossible. Revisit if those turn up. Not needed for fans or Health Check.
