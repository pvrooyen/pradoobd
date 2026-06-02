/**
 * useObd — the single React hook that owns the WebSocket connection to the
 * bridge server and exposes typed command senders + reactive state.
 *
 * Everything the UI needs flows through here:
 *   - connection state, adapter id, protocol
 *   - supported PIDs (from a scan), DTCs, VIN
 *   - a ring buffer of live readings keyed by PID
 *   - a terminal log of raw commands/responses
 *   - Mode 22 probe results
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AdapterConfig,
  ClientCommand,
  ConnectionState,
  Dtc,
  LiveReading,
  PidDefinition,
  ProbeHit,
  ServerEvent,
} from '@pradoobd/shared';

export interface TerminalLine {
  dir: 'tx' | 'rx' | 'sys';
  text: string;
  elapsedMs?: number;
  t: number;
}

export interface LiveSeries {
  pidId: string;
  name: string;
  unit: string;
  latest: LiveReading | null;
  /** Recent samples for sparkline/graph (capped). */
  history: LiveReading[];
}

const HISTORY_CAP = 120;

function wsUrl(): string {
  // Explicit override always wins (set VITE_WS_URL in an .env file if needed).
  const override = import.meta.env.VITE_WS_URL as string | undefined;
  if (override) return override;

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';

  // In `vite dev` the UI is served from :5173 but the bridge listens on :8080.
  // Connecting straight to the bridge avoids relying on Vite's WebSocket proxy,
  // which can be flaky on Windows (localhost IPv6/IPv4 + upgrade handshake). In
  // a production build (DEV === false) the bridge serves the UI itself, so
  // same-origin is correct.
  if (import.meta.env.DEV) {
    const bridgePort = (import.meta.env.VITE_BRIDGE_PORT as string | undefined) ?? '8080';
    return `${proto}//${location.hostname}:${bridgePort}/ws`;
  }
  return `${proto}//${location.host}/ws`;
}

export interface ObdApi {
  state: ConnectionState;
  adapterId?: string;
  protocol?: string;
  supported: PidDefinition[];
  dtcs: Dtc[];
  vin?: string;
  live: Record<string, LiveSeries>;
  terminal: TerminalLine[];
  probeHits: ProbeHit[];
  probeMisses: number;
  progress?: { label: string; current: number; total: number };
  lastError?: string;

  connect: (config?: Partial<AdapterConfig>) => void;
  disconnect: () => void;
  raw: (command: string) => void;
  scanSupported: () => void;
  readDtcs: () => void;
  clearDtcs: () => void;
  readVehicleInfo: () => void;
  startLive: (pids: string[], intervalMs: number) => void;
  stopLive: () => void;
  probeMode22: (start: number, end: number) => void;
  clearTerminal: () => void;
}

export function useObd(): ObdApi {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [adapterId, setAdapterId] = useState<string>();
  const [protocol, setProtocol] = useState<string>();
  const [supported, setSupported] = useState<PidDefinition[]>([]);
  const [dtcs, setDtcs] = useState<Dtc[]>([]);
  const [vin, setVin] = useState<string>();
  const [live, setLive] = useState<Record<string, LiveSeries>>({});
  const [terminal, setTerminal] = useState<TerminalLine[]>([]);
  const [probeHits, setProbeHits] = useState<ProbeHit[]>([]);
  const [probeMisses, setProbeMisses] = useState(0);
  const [progress, setProgress] = useState<ObdApi['progress']>();
  const [lastError, setLastError] = useState<string>();

  const pushTerminal = useCallback((line: Omit<TerminalLine, 't'>) => {
    setTerminal((prev) => [...prev.slice(-400), { ...line, t: Date.now() }]);
  }, []);

  const send = useCallback((cmd: ClientCommand) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(cmd));
    } else {
      setLastError('WebSocket not open — is the bridge server running?');
    }
  }, []);

  // Open the WS once on mount; auto-reconnect on drop.
  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const open = () => {
      if (closed) return;
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (closed) {
          // The effect was torn down while we were still connecting (common in
          // React 18 StrictMode's double-mount). Now that the socket is OPEN we
          // can close it cleanly without the "closed before established" error.
          ws.close();
          return;
        }
        setLastError(undefined);
        pushTerminal({ dir: 'sys', text: 'WS connected to bridge' });
      };
      ws.onclose = () => {
        if (closed) return; // deliberate teardown — no reconnect, no noise
        pushTerminal({ dir: 'sys', text: 'WS disconnected from bridge — retrying…' });
        retry = setTimeout(open, 1500);
      };
      ws.onerror = () => {
        // A socket aborted by our own teardown fires onerror; ignore it. Only a
        // live socket's error is worth surfacing.
        if (closed) return;
        setLastError('WebSocket error — is the bridge server running on :8080?');
      };
      ws.onmessage = (ev) => {
        if (closed) return;
        let evt: ServerEvent;
        try {
          evt = JSON.parse(ev.data as string) as ServerEvent;
        } catch {
          return;
        }
        handleEvent(evt);
      };
    };

    const handleEvent = (evt: ServerEvent) => {
      switch (evt.type) {
        case 'connectionState':
          setState(evt.state);
          if (evt.adapterId) setAdapterId(evt.adapterId);
          if (evt.protocol) setProtocol(evt.protocol);
          if (evt.message) pushTerminal({ dir: 'sys', text: `[state ${evt.state}] ${evt.message}` });
          break;
        case 'raw':
          pushTerminal({ dir: 'tx', text: evt.command });
          pushTerminal({ dir: 'rx', text: evt.response, elapsedMs: evt.elapsedMs });
          break;
        case 'supported':
          setSupported(evt.definitions);
          break;
        case 'dtcs':
          setDtcs(evt.dtcs);
          break;
        case 'cleared':
          pushTerminal({ dir: 'sys', text: evt.ok ? 'DTCs cleared' : 'Clear failed' });
          if (evt.ok) setDtcs([]);
          break;
        case 'vehicleInfo':
          setVin(evt.vin);
          break;
        case 'live':
          setLive((prev) => {
            const next = { ...prev };
            for (const r of evt.readings) {
              const series = next[r.pidId] ?? {
                pidId: r.pidId,
                name: r.name,
                unit: r.unit,
                latest: null,
                history: [],
              };
              next[r.pidId] = {
                ...series,
                latest: r,
                history: [...series.history.slice(-(HISTORY_CAP - 1)), r],
              };
            }
            return next;
          });
          break;
        case 'probeResult':
          setProbeHits(evt.hits);
          setProbeMisses(evt.misses.length);
          setProgress(undefined);
          break;
        case 'progress':
          setProgress(evt.current >= evt.total ? undefined : { label: evt.label, current: evt.current, total: evt.total });
          break;
        case 'error':
          setLastError(evt.message);
          pushTerminal({ dir: 'sys', text: `ERROR: ${evt.message}` });
          break;
      }
    };

    open();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      // If still CONNECTING, the onopen handler above closes it once ready —
      // calling close() on a CONNECTING socket is what throws the console error.
    };
  }, [pushTerminal]);

  return {
    state,
    adapterId,
    protocol,
    supported,
    dtcs,
    vin,
    live,
    terminal,
    probeHits,
    probeMisses,
    progress,
    lastError,
    connect: (config) => send({ type: 'connect', config }),
    disconnect: () => send({ type: 'disconnect' }),
    raw: (command) => send({ type: 'raw', command }),
    scanSupported: () => send({ type: 'scanSupported' }),
    readDtcs: () => send({ type: 'readDtcs' }),
    clearDtcs: () => send({ type: 'clearDtcs' }),
    readVehicleInfo: () => send({ type: 'readVehicleInfo' }),
    startLive: (pids, intervalMs) => {
      setLive({});
      send({ type: 'startLive', pids, intervalMs });
    },
    stopLive: () => send({ type: 'stopLive' }),
    probeMode22: (start, end) => {
      setProbeHits([]);
      setProbeMisses(0);
      send({ type: 'probeMode22', start, end });
    },
    clearTerminal: () => setTerminal([]),
  };
}
