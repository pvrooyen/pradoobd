import { useState } from 'react';
import { useObd } from './useObd.js';
import { ConnectionPanel } from './panels/ConnectionPanel.js';
import { LivePanel } from './panels/LivePanel.js';
import { DtcPanel } from './panels/DtcPanel.js';
import { ProbePanel } from './panels/ProbePanel.js';
import { TerminalPanel } from './panels/TerminalPanel.js';

type Tab = 'connection' | 'live' | 'dtc' | 'probe' | 'terminal';

const TABS: { id: Tab; label: string }[] = [
  { id: 'connection', label: 'Connection' },
  { id: 'live', label: 'Live Data' },
  { id: 'dtc', label: 'Trouble Codes' },
  { id: 'probe', label: 'Mode 22 Prober' },
  { id: 'terminal', label: 'Terminal' },
];

const STATE_LABEL: Record<string, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting…',
  initializing: 'Initializing…',
  connected: 'Connected',
  error: 'Error',
};

export function App() {
  const obd = useObd();
  const [tab, setTab] = useState<Tab>('connection');

  return (
    <div className="app">
      <header className="topbar">
        <h1>Prado OBD</h1>
        <span className="sub">2005 Land Cruiser Prado · 1KD-FTV 3.0 D-4D</span>
        <div className="spacer" />
        <span>
          <span className={`dot ${obd.state}`} />
          {STATE_LABEL[obd.state] ?? obd.state}
        </span>
        {obd.protocol && <span className="sub mono">{obd.protocol}</span>}
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {obd.lastError && <div className="error-banner">{obd.lastError}</div>}

      {obd.progress && (
        <div style={{ padding: '0 16px' }}>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            {obd.progress.label} ({obd.progress.current}/{obd.progress.total})
          </div>
          <div className="progress">
            <span style={{ width: `${(obd.progress.current / Math.max(1, obd.progress.total)) * 100}%` }} />
          </div>
        </div>
      )}

      <main className="content">
        {tab === 'connection' && <ConnectionPanel obd={obd} />}
        {tab === 'live' && <LivePanel obd={obd} />}
        {tab === 'dtc' && <DtcPanel obd={obd} />}
        {tab === 'probe' && <ProbePanel obd={obd} />}
        {tab === 'terminal' && <TerminalPanel obd={obd} />}
      </main>
    </div>
  );
}
