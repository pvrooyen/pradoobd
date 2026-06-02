// Standalone smoke test for the bridge: connects over WS (mock mode) and
// exercises connect -> init -> scan -> read DTCs -> probe -> raw. Run with the
// server already listening in MOCK mode. Exits non-zero on failure.
import WebSocket from 'ws';

const URL = process.env.WS_URL || 'ws://localhost:8080/ws';
const ws = new WebSocket(URL);
const seen = [];
let connectedOk = false;
let supportedCount = 0;
let dtcCount = 0;
let probeHits = 0;
let rawOk = false;

const timeout = setTimeout(() => finish('timeout waiting for events'), 8000);

ws.on('open', () => {
  send({ type: 'connect' });
});

ws.on('message', (data) => {
  const evt = JSON.parse(data.toString());
  seen.push(evt.type);
  if (evt.type === 'connectionState' && evt.state === 'connected') {
    connectedOk = true;
    send({ type: 'scanSupported' });
  }
  if (evt.type === 'supported') {
    supportedCount = evt.definitions.length;
    send({ type: 'readDtcs' });
  }
  if (evt.type === 'dtcs') {
    dtcCount = evt.dtcs.length;
    send({ type: 'probeMode22', start: 0x0115, end: 0x0125 });
  }
  if (evt.type === 'probeResult') {
    probeHits = evt.hits.length;
    send({ type: 'raw', command: 'ATI' });
  }
  if (evt.type === 'raw' && evt.command === 'ATI') {
    rawOk = /ELM327/i.test(evt.response);
    finish();
  }
});

ws.on('error', (e) => finish('ws error: ' + e.message));

function send(cmd) {
  ws.send(JSON.stringify(cmd));
}

function finish(err) {
  clearTimeout(timeout);
  const dtcCodes = seen.includes('dtcs');
  const pass =
    !err && connectedOk && supportedCount > 0 && dtcCount === 2 && probeHits > 0 && rawOk;
  console.log('--- smoke test result ---');
  console.log('connected:        ', connectedOk);
  console.log('supported PIDs:   ', supportedCount);
  console.log('DTCs read:        ', dtcCount, dtcCodes ? '' : '(no dtcs event!)');
  console.log('Mode22 probe hits:', probeHits);
  console.log('raw ATI ok:       ', rawOk);
  console.log('events seen:      ', [...new Set(seen)].join(', '));
  if (err) console.log('ERROR:', err);
  console.log(pass ? 'PASS' : 'FAIL');
  ws.close();
  process.exit(pass ? 0 : 1);
}
