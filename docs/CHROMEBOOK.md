# Running on a Chromebook (ChromeOS + Crostini Linux)

The target laptop is a **Chromebook** running the app inside the **Crostini Linux
container** (Debian, the "Linux development environment" / `penguin`). This page
records the two ChromeOS-specific realities and how they're handled. It is based
on how Crostini networking actually works (see Sources at the bottom), not
assumptions — with one item flagged as "verify on the car" because it can't be
confirmed without the adapter present.

## TL;DR

- **Running Node (install/build/watch/capture): works normally.** Crostini is
  plain Debian; use bash. Nothing special needed.
- **Browser → app UI: works via automatic localhost forwarding, no manual tunnel.**
  ChromeOS auto-tunnels container ports to the Chrome browser, *provided the
  server binds `0.0.0.0` and the port is ≥1024*. This repo already binds `0.0.0.0`
  on :8080 (bridge) and :5173 (Vite dev), so `http://localhost:8080` in the
  ChromeOS browser Just Works. (The UI is optional anyway — the main mode is the
  Claude-mechanic chat + auto-capture.)
- **Container → adapter WiFi (`192.168.0.10:35000`): should work via ChromeOS
  routing, but VERIFY on first attempt** (see below). This is the only unknown.

## 1. Browser access to the UI (the "tunnel" you asked about)

You do **not** need to set up a tunnel manually. ChromeOS runs a forwarding
mechanism (cicerone/chunnel) that automatically tunnels ports listening in the
Crostini container through to the Chrome browser on `localhost`, as long as:

- the server **binds to `0.0.0.0`** (all interfaces), not `127.0.0.1`, **and**
- the port is **≥ 1024** (privileged ports, plus 2222 and 5355, are not forwarded).

This repo is configured for that:
- Bridge (`npm start`) binds `0.0.0.0:8080` (`packages/server/src/index.ts`).
- Vite dev (`npm run dev:web`) uses `server.host: true` → `0.0.0.0:5173`
  (`packages/web/vite.config.ts`).

So in the ChromeOS Chrome browser:
- Production: `npm start` in the container → open **http://localhost:8080**.
- Dev: `npm run dev:server` + `npm run dev:web` → open **http://localhost:5173**.

If a port ever doesn't forward, ChromeOS also exposes a manual control at
**Settings → Advanced → Developers → Linux development environment → Port
forwarding** (or older builds: `chrome://flags/#crostini-port-forwarding`). You
shouldn't need it with `0.0.0.0` binding.

> Note on the dev WebSocket: `packages/web/.env` pins `VITE_WS_URL=ws://localhost:8080/ws`
> so the browser talks to the bridge directly. Under Crostini, `localhost:8080`
> in the browser is auto-forwarded to the container's bridge, so this still works.

## 2. The Crostini ⇄ adapter-WiFi question (verify on the car)

Crostini has **layer-3 (IP) networking only** and is NAT'd behind ChromeOS at
`100.115.92.x`. It cannot do bridging or raw-interface access. When the
**Chromebook** joins the ELM327's WiFi, ChromeOS makes that the active network and
routes the container's outbound IP traffic through it. In practice a TCP connect
from the container to `192.168.0.10:35000` is expected to succeed — but because
Crostini's NAT/routing to a captive, no-internet AP is the kind of thing that can
behave differently per ChromeOS version, **treat the first connection as a test,
not a given.**

How the tooling de-risks this:

- `npm run watch` polls the adapter with a quick TCP probe and only captures once
  it's genuinely reachable — so if Crostini can't see the adapter, the watcher
  simply keeps waiting (it won't silently "succeed" with no data).
- A fast way to check reachability from inside the container, with the Chromebook
  on the adapter WiFi:
  ```bash
  # should connect (no error) if Crostini can reach the adapter:
  node -e "const n=require('net');const s=n.connect(35000,'192.168.0.10',()=>{console.log('REACHABLE');s.end()});s.on('error',e=>{console.log('NOT reachable:',e.message);process.exit(1)});s.setTimeout(3000,()=>{console.log('timeout');process.exit(1)})"
  ```

### If the container CANNOT reach the adapter

Two fallbacks, in order of preference:

1. **USB ELM327 instead of WiFi.** A USB ELM327 appears as a serial device
   (`/dev/ttyUSB0`). USB can be shared into Crostini (Settings → Linux → USB
   preferences / `vmc` `usb-attach`). This avoids the WiFi/NAT issue entirely. A
   future `SerialTransport` (implementing the same `Transport` interface) would
   drive it — not built yet, but the architecture is ready for it.
2. **Run the bridge/capture on a different machine** that can reach the adapter
   (e.g. a Windows laptop or a Raspberry Pi on the adapter WiFi), and just use the
   Chromebook's browser/chat to drive it. The repo runs anywhere Node ≥20 runs.

The Claude-mechanic chat workflow is unaffected either way: whatever machine runs
the watcher writes `captures/*.md`, and Claude reads those.

## 3. Prerequisites in the Crostini container

```bash
# Node ≥ 20. If the container's Node is older, install a current one, e.g.:
#   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
node --version   # expect v20+ (developed on v23)
git --version
```

Then the normal flow (Claude runs these, not the user):

```bash
git clone https://github.com/pvrooyen/pradoobd.git
cd pradoobd
npm install
npm run build
npm run watch:mock   # self-test: writes a capture to captures/ and exits
```

## Sources

- [ChromeOS Crostini — ArchWiki (layer-3 networking, container access)](https://wiki.archlinux.org/title/Chrome_OS_devices/Crostini)
- [Accessing Ports Between Crostini and ChromeOS — Coder.Haus](https://coder.haus/2019/03/11/accessing-ports-between-crostini-and-chromeos/)
- [Port forwarding and tunneling in ChromeOS — ChromiumOS docs (cicerone/chunnel auto-forward, ≥1024, exceptions)](https://www.chromium.org/chromium-os/developer-library/reference/security/port-forwarding/)
- [Chrome OS 86 makes Linux port forwarding generally available](https://www.aboutchromebooks.com/chrome-os-86-adds-port-forwarding-for-linux-chromebooks/)
