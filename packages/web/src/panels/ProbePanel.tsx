import { useState } from 'react';
import { TOYOTA_ENHANCED_PIDS, TOYOTA_PROBE_RANGE } from '@pradoobd/shared';
import type { ObdApi } from '../useObd.js';

/**
 * Mode 22 prober — the genuinely advanced, Prado-specific feature.
 *
 * Standard apps don't do this: we sweep a range of manufacturer "Read Data By
 * Identifier" (service 0x22) identifiers and record which ones your ECU answers.
 * Each hit shows the raw payload; you then confirm scaling empirically by
 * watching values move while you manipulate the engine. Named candidates (boost,
 * rail pressure, EGR, injector correction…) are labelled when matched.
 */
export function ProbePanel({ obd }: { obd: ObdApi }) {
  const connected = obd.state === 'connected';
  const [start, setStart] = useState(toHex(TOYOTA_PROBE_RANGE.start));
  const [end, setEnd] = useState(toHex(TOYOTA_PROBE_RANGE.end));

  const run = () => {
    const s = parseInt(start, 16);
    const e = parseInt(end, 16);
    if (Number.isNaN(s) || Number.isNaN(e)) return;
    obd.probeMode22(s, e);
  };

  return (
    <div className="panel">
      <h2>Mode 22 Prober — Toyota Enhanced PIDs</h2>
      <div className="notice">
        Manufacturer PIDs aren't standardized. This sweep finds which identifiers
        your 1KD-FTV answers. Treat decoded values as <strong>provisional</strong>{' '}
        until you confirm scaling by watching the raw bytes change (rev the engine,
        let it warm up, etc.). Confirmed PIDs can then graduate to real gauges.
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="lbl">
          Start (hex)
          <input className="fld" style={{ width: 100 }} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="lbl">
          End (hex)
          <input className="fld" style={{ width: 100 }} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <button className="btn primary" disabled={!connected} onClick={run}>
          Probe range
        </button>
        <span className="muted">{TOYOTA_ENHANCED_PIDS.length} named candidates seeded</span>
      </div>

      {obd.probeHits.length > 0 || obd.probeMisses > 0 ? (
        <>
          <p className="muted">
            {obd.probeHits.length} identifiers answered · {obd.probeMisses} rejected/no-data
          </p>
          <table>
            <thead>
              <tr>
                <th>ID (hex)</th>
                <th>Name</th>
                <th>Raw payload</th>
              </tr>
            </thead>
            <tbody>
              {obd.probeHits.map((h) => (
                <tr key={h.pid}>
                  <td className="mono">0x{h.pid.toString(16).toUpperCase().padStart(4, '0')}</td>
                  <td>{h.name ?? <span className="muted">unnamed</span>}</td>
                  <td className="mono">{h.rawHex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="muted">No probe run yet.</p>
      )}
    </div>
  );
}

function toHex(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, '0');
}
