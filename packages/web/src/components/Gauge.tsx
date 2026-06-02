import type { LiveSeries } from '../useObd.js';
import { Sparkline } from './Sparkline.js';

/** A single live value tile with a sparkline of recent history. */
export function Gauge({ series }: { series: LiveSeries }) {
  const latest = series.latest;
  const value = latest?.value;
  const display =
    value == null
      ? latest?.text ?? '—'
      : Math.abs(value) >= 100
        ? value.toFixed(0)
        : value.toFixed(1);

  const history = series.history.map((r) => r.value).filter((v): v is number => v != null);

  return (
    <div className="gauge">
      <div className="name">{series.name}</div>
      <div>
        <span className="val">{display}</span>
        {series.unit && value != null && <span className="unit">{series.unit}</span>}
      </div>
      <Sparkline values={history} />
      {latest?.rawHex && <div className="raw">raw: {latest.rawHex}</div>}
    </div>
  );
}
