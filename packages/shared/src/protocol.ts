/**
 * The WebSocket message contract between the React UI and the bridge server.
 *
 * Every message is a JSON object with a `type` discriminator. Client→server
 * messages are "commands"; server→client are "events". Commands may carry an
 * `id` (correlation id) that the matching reply echoes, so the UI can await a
 * specific response without coupling to ordering.
 */

import type { PidDefinition } from './obd.js';
import type { Dtc } from './dtc.js';

/** Adapter connection settings (the ELM327 WiFi defaults baked in). */
export interface AdapterConfig {
  host: string;
  port: number;
  /** Milliseconds to wait for a single command's '>' prompt before timing out. */
  commandTimeoutMs: number;
  /** Protocol to force, or 0 for ELM327 auto-detect ("ATSP0"). */
  protocol: number;
}

export const DEFAULT_ADAPTER_CONFIG: AdapterConfig = {
  host: '192.168.0.10',
  port: 35000,
  commandTimeoutMs: 4000,
  protocol: 0,
};

/** High-level connection lifecycle state reported to the UI. */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'initializing'
  | 'connected'
  | 'error';

// ---------------------------------------------------------------------------
// Client → Server commands
// ---------------------------------------------------------------------------

export interface CmdConnect {
  type: 'connect';
  id?: string;
  config?: Partial<AdapterConfig>;
}
export interface CmdDisconnect {
  type: 'disconnect';
  id?: string;
}
/** Send an arbitrary raw line to the adapter (AT command or OBD hex). */
export interface CmdRaw {
  type: 'raw';
  id?: string;
  command: string;
}
/** Discover which standard Mode 01 PIDs and DTCs the ECU exposes. */
export interface CmdScanSupported {
  type: 'scanSupported';
  id?: string;
}
/** Read DTCs (stored Mode 03 + pending Mode 07). */
export interface CmdReadDtcs {
  type: 'readDtcs';
  id?: string;
}
/** Clear DTCs (Mode 04). Destructive — UI must confirm. */
export interface CmdClearDtcs {
  type: 'clearDtcs';
  id?: string;
}
/** Start streaming a set of PIDs at an interval. */
export interface CmdStartLive {
  type: 'startLive';
  id?: string;
  /** PID ids (e.g. "01:0C") to poll. */
  pids: string[];
  intervalMs: number;
}
export interface CmdStopLive {
  type: 'stopLive';
  id?: string;
}
/** Probe a range of Mode 22 identifiers to find which the ECU answers. */
export interface CmdProbeMode22 {
  type: 'probeMode22';
  id?: string;
  start: number;
  end: number;
}
/** Read the VIN and calibration ids (Mode 09). */
export interface CmdReadVehicleInfo {
  type: 'readVehicleInfo';
  id?: string;
}

export type ClientCommand =
  | CmdConnect
  | CmdDisconnect
  | CmdRaw
  | CmdScanSupported
  | CmdReadDtcs
  | CmdClearDtcs
  | CmdStartLive
  | CmdStopLive
  | CmdProbeMode22
  | CmdReadVehicleInfo;

// ---------------------------------------------------------------------------
// Server → Client events
// ---------------------------------------------------------------------------

export interface EvtConnectionState {
  type: 'connectionState';
  state: ConnectionState;
  /** Adapter identity string from ATI / ATDP, when known. */
  adapterId?: string;
  protocol?: string;
  message?: string;
  /**
   * True when the server is enforcing read-only safety: vehicle-write commands
   * (clear DTCs, active tests, ECU reset, reflash…) are refused at the transport.
   * The UI uses this to disable/hide write affordances (e.g. the Clear DTCs
   * button). Sent on every connectionState so the client always knows the mode.
   */
  readOnly?: boolean;
}
/** Echo + result of a raw command (also used for the terminal view). */
export interface EvtRaw {
  type: 'raw';
  id?: string;
  command: string;
  response: string;
  /** Round-trip in ms, for the terminal/latency display. */
  elapsedMs: number;
}
export interface EvtSupported {
  type: 'supported';
  id?: string;
  /** PID ids the ECU reported as supported. */
  supportedPidIds: string[];
  /** The full definitions for those PIDs (so the UI can render gauges). */
  definitions: PidDefinition[];
}
export interface EvtDtcs {
  type: 'dtcs';
  id?: string;
  dtcs: Dtc[];
}
export interface EvtCleared {
  type: 'cleared';
  id?: string;
  ok: boolean;
}
/** A single reading in a live stream. */
export interface LiveReading {
  pidId: string;
  key: string;
  name: string;
  unit: string;
  value: number | null;
  text?: string;
  rawHex: string;
  /** ms since the live stream started (server clock). */
  t: number;
}
export interface EvtLive {
  type: 'live';
  readings: LiveReading[];
}
export interface ProbeHit {
  pid: number;
  /** "62 01 18 .." positive response payload hex, mode+pid stripped. */
  rawHex: string;
  /** Matched named candidate, if any. */
  key?: string;
  name?: string;
}
export interface EvtProbeResult {
  type: 'probeResult';
  id?: string;
  hits: ProbeHit[];
  /** Identifiers that returned a negative/no response (for completeness). */
  misses: number[];
}
export interface EvtVehicleInfo {
  type: 'vehicleInfo';
  id?: string;
  vin?: string;
  calibrationIds?: string[];
}
export interface EvtError {
  type: 'error';
  id?: string;
  message: string;
  /** Optional machine code, e.g. "TIMEOUT", "NO_DATA", "NOT_CONNECTED". */
  code?: string;
}
/** Progress ticks for long operations (probe sweep, full scan). */
export interface EvtProgress {
  type: 'progress';
  id?: string;
  label: string;
  current: number;
  total: number;
}

export type ServerEvent =
  | EvtConnectionState
  | EvtRaw
  | EvtSupported
  | EvtDtcs
  | EvtCleared
  | EvtLive
  | EvtProbeResult
  | EvtVehicleInfo
  | EvtError
  | EvtProgress;
