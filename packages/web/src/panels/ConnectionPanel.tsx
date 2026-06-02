import { useState } from 'react';
import { DEFAULT_ADAPTER_CONFIG } from '@pradoobd/shared';
import type { ObdApi } from '../useObd.js';

/**
 * Connection + adapter config. Defaults to the standard ELM327 WiFi address
 * (192.168.0.10:35000) but everything is editable, since you'll eventually point
 * this at other adapters.
 */
export function ConnectionPanel({ obd }: { obd: ObdApi }) {
  const [host, setHost] = useState(DEFAULT_ADAPTER_CONFIG.host);
  const [port, setPort] = useState(String(DEFAULT_ADAPTER_CONFIG.port));
  const [timeout, setTimeout] = useState(String(DEFAULT_ADAPTER_CONFIG.commandTimeoutMs));

  const connected = obd.state === 'connected';
  const busy = obd.state === 'connecting' || obd.state === 'initializing';

  return (
    <div className="panel">
      <h2>Adapter Connection</h2>
      <div className="notice">
        The browser can't talk TCP to the ELM327 directly — this UI drives a local
        bridge server that does. Make sure your laptop is joined to the adapter's
        WiFi network before connecting.
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="lbl">
          Host
          <input className="fld" value={host} onChange={(e) => setHost(e.target.value)} disabled={connected} />
        </label>
        <label className="lbl">
          Port
          <input className="fld" value={port} onChange={(e) => setPort(e.target.value)} disabled={connected} style={{ width: 90 }} />
        </label>
        <label className="lbl">
          Cmd timeout (ms)
          <input className="fld" value={timeout} onChange={(e) => setTimeout(e.target.value)} disabled={connected} style={{ width: 110 }} />
        </label>
      </div>
      <div className="row">
        {!connected ? (
          <button
            className="btn primary"
            disabled={busy}
            onClick={() =>
              obd.connect({
                host,
                port: Number(port) || DEFAULT_ADAPTER_CONFIG.port,
                commandTimeoutMs: Number(timeout) || DEFAULT_ADAPTER_CONFIG.commandTimeoutMs,
              })
            }
          >
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        ) : (
          <button className="btn danger" onClick={() => obd.disconnect()}>
            Disconnect
          </button>
        )}
        <button className="btn" disabled={!connected} onClick={() => obd.readVehicleInfo()}>
          Read VIN
        </button>
      </div>

      {(obd.adapterId || obd.protocol || obd.vin) && (
        <div style={{ marginTop: 14 }}>
          <table>
            <tbody>
              {obd.adapterId && (
                <tr>
                  <th style={{ width: 140 }}>Adapter</th>
                  <td className="mono">{obd.adapterId}</td>
                </tr>
              )}
              {obd.protocol && (
                <tr>
                  <th>Protocol</th>
                  <td className="mono">{obd.protocol}</td>
                </tr>
              )}
              {obd.vin && (
                <tr>
                  <th>VIN</th>
                  <td className="mono">{obd.vin}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
