/**
 * ELM327-over-USB-serial transport.
 *
 * A USB ELM327 / STN adapter (OBDLink SX = STN1110, or a genuine FTDI/CH340
 * ELM327) enumerates as a serial port — /dev/ttyUSB0 (FTDI/CH340) or
 * /dev/ttyACM0 (CDC) on Linux/Crostini. Electrically it behaves exactly like the
 * WiFi dongle: write an ASCII command + CR, read text until the '>' prompt. So
 * this mirrors ElmWifiTransport's queue/framing logic; only the byte pipe differs
 * (a serial port instead of a TCP socket).
 *
 * WHY USB FOR THIS CAR
 * --------------------
 * The 2005 1KD-FTV Prado talks K-line (ISO 9141-2 / ISO 14230 KWP). The cheap
 * WiFi ELM327 clone proved it cannot initialise that bus (BUS INIT: ERROR on
 * every K-line protocol; it doesn't even implement ATSI/ATFI). STN-based USB
 * adapters do robust K-line init internally, which is the whole point of moving
 * to USB. Bonus: USB is not a network, so the laptop keeps its internet — no more
 * switching off Wi-Fi to reach the adapter; captures can run with Claude online.
 *
 * `serialport` is loaded via a DYNAMIC import so this file compiles and the rest
 * of the app runs on machines that don't have the (native) module installed — it
 * is an optionalDependency. The import only happens inside open().
 */

import { Emitter } from '../util/Emitter.js';
import { createLogger } from '../util/logger.js';
import type { SendOptions, Transport, TransportEvents } from './Transport.js';

const PROMPT = '>';
const log = createLogger('elm-serial');

/** Minimal structural type for a `serialport` SerialPort, so we don't depend on
 *  the package's types at compile time (it's a dynamic, optional import). */
interface SerialLike {
  readonly isOpen: boolean;
  open(cb: (err: Error | null) => void): void;
  close(cb?: (err?: Error | null) => void): void;
  write(data: string, cb?: (err?: Error | null) => void): boolean;
  on(event: 'data', cb: (chunk: Buffer) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  on(event: 'close', cb: () => void): void;
  removeAllListeners(): void;
  destroy(err?: Error): void;
}

interface PendingCommand {
  command: string;
  resolve: (response: string) => void;
  reject: (err: Error) => void;
  timeoutMs: number;
}

export interface SerialOptions {
  /** Serial device path, e.g. /dev/ttyUSB0 (FTDI/CH340) or /dev/ttyACM0 (CDC). */
  path: string;
  /** Baud rate. OBDLink SX defaults to 115200; many genuine ELM327 USB use 38400. */
  baudRate: number;
  /** Default per-command timeout. */
  commandTimeoutMs: number;
}

export class SerialTransport implements Transport {
  readonly kind = 'ELM327-USB';

  private port: SerialLike | null = null;
  private buffer = '';
  private readonly queue: PendingCommand[] = [];
  private active: PendingCommand | null = null;
  private activeTimer: NodeJS.Timeout | null = null;
  private readonly emitter = new Emitter<TransportEvents>();
  private opening: Promise<void> | null = null;

  constructor(private readonly opts: SerialOptions) {}

  get isOpen(): boolean {
    return this.port !== null && this.port.isOpen;
  }

  on<E extends keyof TransportEvents>(event: E, listener: TransportEvents[E]): () => void {
    return this.emitter.on(event, listener);
  }

  open(): Promise<void> {
    if (this.isOpen) return Promise.resolve();
    if (this.opening) return this.opening;

    this.opening = (async () => {
      let SerialPortCtor: new (o: { path: string; baudRate: number; autoOpen: boolean }) => SerialLike;
      try {
        const mod = (await import('serialport')) as unknown as {
          SerialPort: new (o: { path: string; baudRate: number; autoOpen: boolean }) => SerialLike;
        };
        SerialPortCtor = mod.SerialPort;
      } catch (err) {
        this.opening = null;
        throw new Error(
          `'serialport' module not available (${(err as Error).message}). ` +
            `Install it in the server workspace: npm install --save-optional serialport -w @pradoobd/server`,
        );
      }

      const port = new SerialPortCtor({ path: this.opts.path, baudRate: this.opts.baudRate, autoOpen: false });
      this.port = port;
      this.buffer = '';

      port.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf8')));
      port.on('error', (err: Error) => {
        log.error('serial error', err.message);
        this.emitter.emit('error', err);
        this.failActiveAndQueue(err);
      });
      port.on('close', () => {
        log.info('serial port closed');
        this.failActiveAndQueue(new Error('Connection closed'));
        this.emitter.emit('close');
        this.port = null;
        this.opening = null;
      });

      await new Promise<void>((resolve, reject) => {
        port.open((err) => {
          if (err) {
            this.port = null;
            this.opening = null;
            reject(new Error(`Cannot open serial port ${this.opts.path}: ${err.message}`));
            return;
          }
          log.info(`opened ${this.opts.path} @ ${this.opts.baudRate} baud`);
          this.emitter.emit('open');
          resolve();
        });
      });
    })();

    return this.opening;
  }

  async close(): Promise<void> {
    const port = this.port;
    this.port = null;
    this.opening = null;
    if (port && port.isOpen) {
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        port.close(() => finish());
        // Hard cap so a stuck port never blocks shutdown.
        setTimeout(() => {
          try {
            port.destroy();
          } catch {
            /* already gone */
          }
          finish();
        }, 500);
      });
    }
  }

  send(command: string, opts?: SendOptions): Promise<string> {
    if (!this.isOpen) {
      return Promise.reject(new Error('Transport not open'));
    }
    return new Promise<string>((resolve, reject) => {
      this.queue.push({
        command,
        resolve,
        reject,
        timeoutMs: opts?.timeoutMs ?? this.opts.commandTimeoutMs,
      });
      this.pump();
    });
  }

  /** Start the next queued command if none is in flight. */
  private pump(): void {
    if (this.active || this.queue.length === 0) return;
    const next = this.queue.shift()!;
    this.active = next;
    // Discard any unsolicited bytes left from a previous reply so a response is
    // never mis-framed onto the next command (the ATRV-reads-garbage symptom).
    this.buffer = '';

    if (!this.port || !this.isOpen) {
      this.active = null;
      next.reject(new Error('Transport not open'));
      return;
    }

    this.activeTimer = setTimeout(() => {
      const cmd = this.active;
      this.active = null;
      this.activeTimer = null;
      if (cmd) {
        cmd.reject(new Error(`Command timeout after ${cmd.timeoutMs}ms: "${cmd.command}"`));
      }
      this.pump();
    }, next.timeoutMs);

    log.debug('>>', JSON.stringify(next.command));
    this.port.write(next.command + '\r', (err) => {
      if (err) {
        const cmd = this.active;
        if (this.activeTimer) {
          clearTimeout(this.activeTimer);
          this.activeTimer = null;
        }
        this.active = null;
        cmd?.reject(new Error(`Serial write failed: ${err.message}`));
        this.pump();
      }
    });
  }

  private onData(chunk: string): void {
    this.emitter.emit('data', chunk);
    this.buffer += chunk;

    // A complete response ends with the prompt '>'.
    const promptIdx = this.buffer.indexOf(PROMPT);
    if (promptIdx === -1) return;

    const raw = this.buffer.slice(0, promptIdx);
    this.buffer = this.buffer.slice(promptIdx + 1);

    const cmd = this.active;
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    this.active = null;

    if (cmd) {
      const cleaned = this.cleanResponse(raw, cmd.command);
      log.debug('<<', JSON.stringify(cleaned));
      cmd.resolve(cleaned);
    }
    this.pump();
  }

  /**
   * Normalize an ELM327 reply: strip the echoed command, collapse CRs to single
   * newlines, trim. Identical rules to the WiFi transport so the protocol layer
   * sees the same shape regardless of the byte pipe.
   */
  private cleanResponse(raw: string, command: string): string {
    const text = raw.replace(/\r/g, '\n');
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (
      lines[0] &&
      lines[0].replace(/\s/g, '').toUpperCase() === command.replace(/\s/g, '').toUpperCase()
    ) {
      lines.shift();
    }
    return lines.join('\n').trim();
  }

  private failActiveAndQueue(err: Error): void {
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    const active = this.active;
    this.active = null;
    active?.reject(err);
    while (this.queue.length) {
      this.queue.shift()!.reject(err);
    }
  }
}
