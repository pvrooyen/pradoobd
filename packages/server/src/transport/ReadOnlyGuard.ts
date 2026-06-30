/**
 * ReadOnlyGuard — a Transport decorator that enforces read-only safety.
 *
 * Wraps any Transport. When `enabled`, it inspects every outbound command via
 * the shared classifier (shared/src/safety.ts) and THROWS before the command
 * reaches the wire if it would write to / change the state of the vehicle
 * (clear DTCs, force actuators, active tests, ECU reset, security access,
 * reflash, …). AT/ST adapter-config commands and all read services pass through.
 *
 * This is the single choke point: ObdSession, the bridge, the terminal, the
 * watcher and any future caller all reach the car through Transport.send(), so
 * guarding here means NO path can emit a vehicle write while read-only is on.
 * Defense-in-depth: even a fat-fingered `04` in the terminal is stopped.
 *
 * It is a pure pass-through for open/close/events and for any allowed command,
 * so wrapping has no behavioural cost in normal (read) operation.
 */

import { classifyCommand } from '@pradoobd/shared';
import type {
  SendOptions,
  Transport,
  TransportEvents,
} from './Transport.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('readonly');

/** Thrown when a vehicle-write command is attempted in read-only mode. */
export class ReadOnlyViolationError extends Error {
  constructor(public readonly command: string, public readonly reason: string) {
    super(
      `READ-ONLY MODE: refused "${command.trim()}" — ${reason}. ` +
        `No write was sent to the vehicle. Disable read-only (READ_ONLY=0) to allow writes.`,
    );
    this.name = 'ReadOnlyViolationError';
  }
}

export class ReadOnlyGuard implements Transport {
  constructor(
    private readonly inner: Transport,
    /** When true, vehicle-write commands are refused. */
    public enabled = true,
  ) {}

  get kind(): string {
    return this.enabled ? `${this.inner.kind} [read-only]` : this.inner.kind;
  }

  get isOpen(): boolean {
    return this.inner.isOpen;
  }

  open(): Promise<void> {
    if (this.enabled) log.info('read-only mode ON — vehicle writes will be refused');
    return this.inner.open();
  }

  close(): Promise<void> {
    return this.inner.close();
  }

  send(command: string, opts?: SendOptions): Promise<string> {
    if (this.enabled) {
      const cls = classifyCommand(command);
      if (cls.isVehicleWrite) {
        log.warn(`blocked vehicle-write "${command.trim()}" (${cls.reason})`);
        return Promise.reject(new ReadOnlyViolationError(command, cls.reason));
      }
    }
    return this.inner.send(command, opts);
  }

  on<E extends keyof TransportEvents>(event: E, listener: TransportEvents[E]): () => void {
    return this.inner.on(event, listener);
  }
}

/**
 * Wrap a transport in a ReadOnlyGuard iff read-only mode is requested.
 * Reads the READ_ONLY env when `enabled` is not given explicitly.
 *
 * READ_ONLY semantics: "1"/"true"/"yes"/"on" → guarded; "0"/"false"/"no"/"off"
 * → pass-through. Unset → defaults to the provided `defaultEnabled`.
 */
export function withReadOnlyGuard(
  inner: Transport,
  enabled?: boolean,
  defaultEnabled = false,
): Transport {
  const on = enabled ?? readReadOnlyEnv(defaultEnabled);
  return on ? new ReadOnlyGuard(inner, true) : inner;
}

/** Parse the READ_ONLY environment variable. */
export function readReadOnlyEnv(defaultEnabled = false): boolean {
  const v = (process.env.READ_ONLY ?? '').trim().toLowerCase();
  if (v === '') return defaultEnabled;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}
