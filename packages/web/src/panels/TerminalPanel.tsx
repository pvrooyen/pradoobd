import { useEffect, useRef, useState } from 'react';
import type { ObdApi } from '../useObd.js';

/**
 * Raw terminal — send arbitrary AT or OBD hex commands and see exactly what the
 * adapter returns. Indispensable when reverse-engineering: try "ATDP", "0100",
 * "22 01 18", etc. Command history with arrow keys.
 */
export function TerminalPanel({ obd }: { obd: ObdApi }) {
  const connected = obd.state === 'connected';
  const [cmd, setCmd] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [obd.terminal.length]);

  const submit = () => {
    const c = cmd.trim();
    if (!c) return;
    obd.raw(c);
    setHistory((h) => [...h, c]);
    setHistIdx(-1);
    setCmd('');
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submit();
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
      if (history[idx] != null) {
        setHistIdx(idx);
        setCmd(history[idx]!);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx >= 0 && histIdx < history.length - 1) {
        setHistIdx(histIdx + 1);
        setCmd(history[histIdx + 1]!);
      } else {
        setHistIdx(-1);
        setCmd('');
      }
    }
  };

  const quick = ['ATI', 'ATDP', 'ATRV', '0100', '03', '0902', '22 01 18'];

  return (
    <div className="panel">
      <h2>Raw Terminal</h2>
      <div className="row" style={{ marginBottom: 10 }}>
        {quick.map((q) => (
          <button key={q} className="btn" disabled={!connected} onClick={() => obd.raw(q)}>
            {q}
          </button>
        ))}
        <button className="btn" onClick={() => obd.clearTerminal()} style={{ marginLeft: 'auto' }}>
          Clear log
        </button>
      </div>

      <div className="terminal" ref={scrollRef}>
        {obd.terminal.map((line, i) => (
          <div key={i} className={line.dir}>
            {line.dir === 'tx' ? '» ' : line.dir === 'rx' ? '« ' : '· '}
            {line.text}
            {line.elapsedMs != null && <span className="meta"> ({line.elapsedMs}ms)</span>}
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <input
          className="fld"
          style={{ flex: 1 }}
          placeholder={connected ? 'Enter AT or OBD command (↑/↓ history)…' : 'Connect first'}
          value={cmd}
          disabled={!connected}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={onKey}
        />
        <button className="btn primary" disabled={!connected} onClick={submit}>
          Send
        </button>
      </div>
    </div>
  );
}
