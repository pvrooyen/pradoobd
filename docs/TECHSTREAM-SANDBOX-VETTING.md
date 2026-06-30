# Vetting the cracked Techstream safely — VM sandbox procedure + red-flag rubric

The user chose the **free cracked standalone Techstream** (the official path is $80/48h —
declined). The standalone is pirated Toyota software bundled with a license-bypass
patcher, hosted on anonymous mirrors. This file is how we make that "as safe as
possible": **detonate + inspect it in a hardened VirtualBox VM before it ever
touches a real machine.** Derived from a two-track deep investigation (2026-06-30).

> **The single most decisive test:** Techstream is a *local* diagnostic app that
> talks to a USB/WiFi OBD adapter. It has **no legitimate reason to contact the
> internet.** If it makes **any** outbound connection in the VM → **do not run it
> on real hardware.** That one rule catches most of the real risk.

---

## What the crack actually is (so you know the legit footprint)

- A **license-bypass patcher** ("Toyota Launcher.exe"), not a keygen or a service.
  After install you run the patch once; thereafter you launch Techstream via
  "Toyota Launcher" and click **Cancel** on the dealer-registration prompt.
- Legit footprint = files ONLY under
  `C:\Program Files (x86)\Toyota Diagnostics\Techstream\` and
  `C:\Program Files (x86)\XHorse Electronics\MVCI Driver for TOYOTA TIS\`, plus the
  `PassThruSupport.04.04` registry keys the `mvci-x64.reg` merge adds. **Anything
  outside that footprint is suspect.**
- **Expected-and-OK AV noise:** `Win32/Ymacco.AA5C` (or a `Riskware`/`HackTool`/
  `Keygen`/`PUA` flag) on the **patcher/launcher only**; the Techstream installer
  itself scans clean. That pattern matches every clean community report.

## Malware history (the honest picture)

Named detections DO exist in the wild for these cracks (`Virut`, `Tiggre`,
`Conteban`, `Sality`, `Occamy`) — but they cluster in the **keygen / loader / the
mini-CD installer**, not the Techstream binary. The **mini-CD shipped with cables
is the documented infection vector** (PriusChat: "AVG found 4 trojans"). We are NOT
using that CD. Source matters: download from **OBDII365 / UOBDII** or the
**FT86CLUB / ih8mud Google-Drive pack** (highest reputation, no infection reports).
No canonical checksum exists for cracked software, so source reputation + our own
VirusTotal scan + behavioral observation is the substitute.

---

## VM build (hardened — do this BEFORE the clean snapshot)

Commodity crack-loaders increasingly stay **dormant if they detect a VM**, so a
naïve VM gives a weak "clean" signal. Harden it:

1. **Do NOT install VirtualBox Guest Additions.** This is the biggest single win —
   most VM-detection checks look for the `VBox*` drivers/processes/registry keys
   that Guest Additions creates. Without it, those checks find nothing.
2. **Realistic specs:** ≥2 CPU cores, ≥4 GB RAM, a large disk (malware flags tiny
   VMs). Windows 11 guest (the ISO we staged).
3. **Disable Shared Folders, Shared Clipboard, Drag-and-Drop** (contamination /
   escape vectors).
4. **No real accounts** in the guest — no browser logins, no credentials, no
   wallet. Info-stealers harvest those in seconds.
5. (Optional, stronger) mask VM artifacts: change MAC off the `08:00:27` VirtualBox
   OUI, edit ACPI/BIOS strings to drop `VBOX`, disable paravirt/3D. Tools:
   `VBoxHardenedLoader`, `VBoxCloak`.
6. **Pre-install the analysis toolkit** (all Microsoft-signed Sysinternals +
   RegShot): **Process Monitor (Procmon), Process Explorer, Autoruns, TCPView,
   RegShot**. Optional: Wireshark, Noriben, and **Pafish/Al-Khaser** to test the
   hardening (if Pafish reports few/no VM detections, commodity anti-VM will be
   mostly blind too).
7. **Take the clean snapshot now.** Revert to it after every run.

## Two-stage detonation

You have competing goals (isolation vs. observing a phone-home). So run twice:

- **Run #1 — fully OFFLINE** (VM network adapter OFF). Install Techstream → MVCI
  driver → merge `mvci-x64.reg` → run the patch → launch via Toyota Launcher →
  click around (you can't connect to a car, but the app + patch fully execute).
  Capture local behaviour with zero exfil risk.
- **Run #2 — CONTAINED network** (host-only adapter + a fake-net like INetSim/
  FakeNet on a REMnux VM, OR a throwaway network you can pull instantly). Watch for
  the outbound C2 attempt **without** giving it real reachability. **Never** bridge
  the VM to your real LAN.

Revert to the clean snapshot between runs.

## What to watch (with the exact tool)

1. **New processes** (Procmon Process Tree / Process Explorer): red flag if the
   installer spawns `powershell` (esp. `-enc`), `cmd`, `schtasks`, `reg`, `mshta`,
   `wscript`, or **AutoIt**, or any unsigned exe that persists.
2. **Files dropped outside the two legit folders** (Procmon `WriteFile` / RegShot
   diff): executables in `%APPDATA%`, `%LOCALAPPDATA%`, `%TEMP%`, `System32`,
   `C:\Users\Public`, `ProgramData` = hallmark of malware, not an installer.
3. **Persistence** (Autoruns before+after, diff; enable Verify Signatures + Check
   VirusTotal + Hide Microsoft): new **Run/RunOnce** keys, **Startup-folder** exes,
   **Scheduled Tasks** (corroborate Event ID 106), new **Services**, or **WMI event
   subscriptions**. A license patch needs NONE of these.
4. **Outbound network** (TCPView, `netstat -ab`, Wireshark on the fake-net leg):
   **~ZERO is correct.** Any external endpoint, beaconing, raw-IP (no DNS), or odd
   port = red flag. Read the request in Wireshark/Fiddler (host, user-agent, POST
   body).
5. **Defender tampering** (Procmon/RegShot on these keys, then confirm manually):
   `WinDefend\TamperProtection` → 0/4; `…\Real-Time Protection\
   DisableRealtimeMonitoring=1`; `DisableAntiSpyware=1`; and especially a **new
   `Windows Defender\Exclusions\{Paths,Extensions,Processes}`** entry whitelisting
   the crack.

## VirusTotal interpretation — name beats count

Bucket each detection NAME:

- **Bucket A — benign-crack class (OK by itself):** `Riskware`, `RiskTool`,
  `HackTool`, `Keygen`, `not-a-virus`, `PUA`/`PUP`, `Patcher`, `Crack`, `Tool:`.
  Says "this is a hacktool," not "this steals data."
- **Bucket B — generic/heuristic (low confidence):** `Generic`, `GenericKD`,
  `Gen:Variant`, `HEUR`, `*.gen`, `!ml`, `AI:`, `Packed`, `Suspicious`. Packing
  alone trips these. Weight low unless C also fires.
- **Bucket C — named family (HIGH concern):** stealers `RedLine`, `Vidar`,
  `Lumma`/`LummaC2`, `Raccoon`, `Stealc`, `Agent Tesla`; RATs `njRAT`, `AsyncRAT`,
  `Remcos`, `Quasar`; `CoinMiner`/`XMRig` (as Trojan); `Backdoor`, `PWS`,
  `TrojanSpy`, `Ransom`.

| Pattern | Verdict |
|---|---|
| 0–3, all Bucket A, clean Behavior | Likely benign crack — tolerable |
| 4–10, A+B mix, no family, clean Behavior | Probably packed-loader FP — verify Behavior + Contacted Domains |
| Even ONE Bucket C corroborated by a 2nd engine or behavior | Malicious — discard |
| 15–30 with several Bucket C converging | Malicious — discard |

Always read the **Behavior tab + Contacted Domains/IPs**, not just the score. A low
count is not proof — counts climb after a threat is disclosed; re-scan later.

## Trust priority (most → least decisive)

1. **Runtime behaviour in the hardened VM** (network / drops / persistence / Defender)
2. VT **Behavior tab + Contacted Domains**
3. VT detection **names**
4. VT detection **count**

## The one-line decisions

- **ANY outbound internet connection in the VM → do NOT use on the real laptop.**
- Persistence / drops outside the 2 folders / Defender tamper / a named Bucket-C
  family → **discard, find a different source.**
- Only the expected `Ymacco`/`Riskware` flag on the launcher + inert behaviour +
  zero network → **acceptable; proceed to use on the (isolated) borrowed laptop.**
- **VM-clean ≠ bare-metal-clean.** "Clean" means "no malicious behaviour observed,"
  never a guarantee. That's why real use goes on the **borrowed** laptop, not the
  daily desktop.
- **Never flash the cable's firmware** (FirmwareUpdateTool "Device Info" check only
  — the update/flash function bricks clone cables).
