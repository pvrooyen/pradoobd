/**
 * Bridge server entry point.
 *
 * Serves two things on one port:
 *   1. The built React UI (static files from packages/web/dist) — so you open
 *      http://localhost:8080 in Chrome and get the dashboard.
 *   2. A WebSocket endpoint at /ws that the UI uses to drive the adapter.
 *
 * The browser cannot open a raw TCP socket to the ELM327 WiFi dongle, so this
 * Node process is the bridge: WebSocket (browser side) <-> TCP (adapter side).
 *
 * Environment:
 *   PORT       HTTP/WS port (default 8080)
 *   MOCK=1     use the in-process simulated Prado instead of real WiFi
 *   LOG_LEVEL  debug | info | warn | error
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientCommand, ServerEvent } from '@pradoobd/shared';
import { BridgeSession } from './bridge/BridgeSession.js';
import { createLogger } from './util/logger.js';

const log = createLogger('http');

const PORT = Number(process.env.PORT) || 8080;
const USE_MOCK = process.env.MOCK === '1' || process.env.MOCK === 'true';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist layout: packages/server/dist/index.js -> ../../web/dist
const WEB_DIST = path.resolve(__dirname, '../../web/dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0] || '/');
  if (urlPath === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, mock: USE_MOCK }));
    return;
  }

  let filePath = path.join(WEB_DIST, urlPath === '/' ? 'index.html' : urlPath);
  // Prevent path traversal.
  if (!filePath.startsWith(WEB_DIST)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA fallback: serve index.html for unknown routes (client-side routing).
      const indexHtml = path.join(WEB_DIST, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.writeHead(200, { 'content-type': MIME['.html']! });
        fs.createReadStream(indexHtml).pipe(res);
      } else {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end(
          'Web UI not built yet. Run `npm run build` (or `npm run dev` for live dev with Vite on :5173).',
        );
      }
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  log.info('browser connected');
  const sendEvent = (event: ServerEvent) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
  };
  const bridge = new BridgeSession(sendEvent, { useMock: USE_MOCK });

  ws.on('message', (data) => {
    let cmd: ClientCommand;
    try {
      cmd = JSON.parse(data.toString()) as ClientCommand;
    } catch {
      sendEvent({ type: 'error', message: 'invalid JSON command' });
      return;
    }
    void bridge.handle(cmd);
  });

  ws.on('close', () => {
    log.info('browser disconnected');
    void bridge.dispose();
  });

  ws.on('error', (err) => log.warn('ws error', err.message));
});

server.listen(PORT, () => {
  log.info(`bridge server on http://localhost:${PORT}  (mock=${USE_MOCK})`);
  log.info(`websocket at ws://localhost:${PORT}/ws`);
  if (!fs.existsSync(WEB_DIST)) {
    log.warn('web UI not built. For dev, run the Vite dev server (npm run dev:web) on :5173.');
  }
});
