# Setting up on a new machine (the laptop)

Everything needed to run this is in the repo. After cloning:

> **On a Chromebook?** The app runs in the Crostini Linux container — see
> [`CHROMEBOOK.md`](CHROMEBOOK.md) for ChromeOS specifics (browser access works
> with no manual tunnel; one adapter-WiFi item to verify). Commands below use
> bash, which is what Crostini uses.

## Prerequisites

- **Node.js ≥ 20** (developed on 23) and npm ≥ 10. Get it from <https://nodejs.org>.
  Verify: `node --version` and `npm --version`.
- A modern Chrome browser.
- Git (to clone).

## Get the code onto the laptop

Pick whichever applies (the repo is currently **local-only** on the desktop — no
remote yet; see README "Repo / getting the code" for how to create one):

```powershell
# If you pushed it to GitHub:
git clone <your-repo-url> pradoobd
cd pradoobd

# Or if you copied the folder across (USB / network share):
#   just copy C:\_dev\pradoobd — but DELETE node_modules and packages/*/dist
#   first so you install fresh on the laptop.
```

## Install + verify

```bash
npm install            # installs all workspaces (~100 packages)
npm run build          # builds shared, server, and the React UI
npm run watch:mock     # proves the whole stack works — writes a capture and exits
```

If `watch:mock` prints "✔ capture written" to `captures/`, the machine is set up.

## Run it

- **Auto-capture watcher (main at-the-car tool):** `npm run watch`
- **Live dashboard (optional):** `npm start` → <http://localhost:8080>
- **Dev (hot reload):** `npm run dev:server` and `npm run dev:web` (two terminals)
  → <http://localhost:5173>
- **Mock (no car):** prefix with `MOCK=1`, e.g. `MOCK=1 npm start`

> On Windows/PowerShell instead of bash, set env vars with `$env:MOCK="1";` before
> the command. On Crostini/macOS/Linux use the `MOCK=1 cmd` form shown above.

## What's committed vs. generated

| Committed (in git) | Generated locally (gitignored) |
| --- | --- |
| All source (`packages/*/src`), configs, docs | `node_modules/` |
| `packages/web/.env` (dev WS URL — no secrets) | `packages/*/dist/` (build output) |
| `captures/.gitkeep` | `captures/*.json` / `*.md` (your real data + VIN) |
| `packages/server/smoke-test.mjs` | `.env.local` (personal overrides) |

There are **no machine-specific paths or IPs in the committed code** (verified).
The adapter address defaults to `192.168.0.10:35000` and is configurable.

## Troubleshooting

- **"WebSocket error" in the browser during `npm run dev`:** the UI (:5173)
  connects directly to the bridge (:8080) via `packages/web/.env`'s
  `VITE_WS_URL`. Ensure the bridge terminal (`dev:server`) is actually running.
  If you edited env files, restart Vite with `npm run dev:web -- --force`.
- **`npm start` says "Web UI not built":** run `npm run build` first.
- **Adapter won't connect at the car:** confirm the laptop is on the adapter's
  WiFi (not home WiFi), ignition is ON, and the host/port match the adapter
  (try `192.168.4.1` if `192.168.0.10` fails).
