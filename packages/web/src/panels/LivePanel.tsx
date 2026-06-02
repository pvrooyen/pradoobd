import { useMemo, useState } from 'react';
import type { PidDefinition } from '@pradoobd/shared';
import type { ObdApi } from '../useObd.js';
import { Gauge } from '../components/Gauge.js';

/**
 * Discover which PIDs the ECU supports, pick the ones to watch, and stream them
 * as live gauges. On a 2005 diesel Prado, expect a subset of Mode 01 PIDs to be
 * available — the scan tells you exactly which.
 */
export function LivePanel({ obd }: { obd: ObdApi }) {
  const connected = obd.state === 'connected';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [interval, setInterval] = useState('400');
  const [streaming, setStreaming] = useState(false);

  // Only PIDs with a known decoder / unit make sensible gauges; show all
  // supported but pre-select the data-bearing ones.
  const selectablePids = useMemo(
    () => obd.supported.filter((p) => !p.isSupportBitmask),
    [obd.supported],
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const start = () => {
    const pids = [...selected];
    if (pids.length === 0) return;
    obd.startLive(pids, Number(interval) || 400);
    setStreaming(true);
  };
  const stop = () => {
    obd.stopLive();
    setStreaming(false);
  };

  const liveSeries = Object.values(obd.live);

  return (
    <>
      <div className="panel">
        <h2>Supported PID Discovery</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn primary" disabled={!connected} onClick={() => obd.scanSupported()}>
            Scan supported PIDs
          </button>
          <span className="muted">
            {obd.supported.length > 0
              ? `${selectablePids.length} data PIDs reported by the ECU`
              : 'Run a scan to see what your Prado exposes.'}
          </span>
        </div>

        {selectablePids.length > 0 && (
          <>
            <div className="checkbox-list">
              {selectablePids.map((p: PidDefinition) => (
                <label key={p.id} title={p.note}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  <span>{p.name}</span>
                  <span className="muted mono" style={{ marginLeft: 'auto' }}>{p.id}</span>
                </label>
              ))}
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <label className="lbl">
                Poll interval (ms)
                <input className="fld" style={{ width: 100 }} value={interval} onChange={(e) => setInterval(e.target.value)} />
              </label>
              {!streaming ? (
                <button className="btn primary" disabled={selected.size === 0} onClick={start}>
                  Start live ({selected.size})
                </button>
              ) : (
                <button className="btn danger" onClick={stop}>
                  Stop live
                </button>
              )}
              <button className="btn" onClick={() => setSelected(new Set(selectablePids.map((p) => p.id)))}>
                Select all
              </button>
              <button className="btn" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </div>
          </>
        )}
      </div>

      {liveSeries.length > 0 && (
        <div className="panel">
          <h2>Live Data</h2>
          <div className="grid">
            {liveSeries.map((s) => (
              <Gauge key={s.pidId} series={s} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
