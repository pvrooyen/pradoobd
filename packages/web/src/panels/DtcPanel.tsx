import type { ObdApi } from '../useObd.js';

/** Read stored + pending DTCs and (with confirmation) clear them. */
export function DtcPanel({ obd }: { obd: ObdApi }) {
  const connected = obd.state === 'connected';

  const clear = () => {
    if (
      window.confirm(
        'Clear all stored DTCs and freeze-frame data?\n\nThis also resets readiness monitors and cannot be undone. Only do this after you have read and recorded the codes.',
      )
    ) {
      obd.clearDtcs();
    }
  };

  return (
    <div className="panel">
      <h2>Diagnostic Trouble Codes</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn primary" disabled={!connected} onClick={() => obd.readDtcs()}>
          Read DTCs
        </button>
        <button className="btn danger" disabled={!connected} onClick={clear}>
          Clear DTCs
        </button>
      </div>

      {obd.dtcs.length === 0 ? (
        <p className="muted">No codes read yet (or none stored). Read DTCs to check.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Kind</th>
              <th>Category</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {obd.dtcs.map((d, i) => (
              <tr key={`${d.code}-${i}`}>
                <td className="mono">{d.code}</td>
                <td>
                  <span className={`badge ${d.kind === 'pending' ? 'pending' : 'stored'}`}>{d.kind}</span>
                </td>
                <td>{d.category}</td>
                <td className="muted">{d.description ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
