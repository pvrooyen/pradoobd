/**
 * ELM327-over-WiFi transport.
 *
 * The common ELM327 WiFi dongle exposes a raw TCP server (default
 * 192.168.0.10:35000). It behaves like a telnet line device:
 *   - You write an ASCII command terminated by CR ('\r').
 *   - It echoes characters back and streams the response.
 *   - It signals "ready for next command" by sending the prompt char '>'.
 *
 * So the framing rule is simple and robust: a response is complete when we see
 * the '>' prompt. We buffer everything until then, strip the prompt and the
 * echoed command, normalize whitespace, and resolve.
 *
 * Commands are serialized through an internal queue because the device can only
 * handle one at a time.
 */

import net from 'node:net';
import { Emitter } from '../util/Emitter.js';
import { createLogger } from '../util/logger.js';
import type { SendOptions, Transport, TransportEvents } from './Transport.js';

const PROMPT = '>';
const log = createLogger('elm-wifi');

interface PendingCommand {
  command: string;
  resolve: (response: string) => void;
  reject: (err: Error) => void;
  timeoutMs: number;
}

export interface ElmWifiOptions {
  host: string;
  port: number;
  /** Default per-command timeout. */
  commandTimeoutMs: number;
  /** TCP connect timeout. */
  connectTimeoutMs?: number;
}

export class ElmWifiTransport implements Transport {
  readonly kind = 'ELM327-WiFi';

  private socket: net.Socket | null = null;
  private buffer = '';
  private readonly queue: PendingCommand[] = [];
  private active: PendingCommand | null = null;
  private activeTimer: NodeJS.Timeout | null = null;
  private readonly emitter = new Emitter<TransportEvents>();
  private opening: Promise<void> | null = null;

  constructor(private readonly opts: ElmWifiOptions) {}

  get isOpen(): boolean {
    return this.socket !== null && !this.socket.destroyed && this.socket.readyState === 'open';
  }

  on<E extends keyof TransportEvents>(event: E, listener: TransportEvents[E]): () => void {
    return this.emitter.on(event, listener);
  }

  open(): Promise<void> {
    if (this.isOpen) return Promise.resolve();
    if (this.opening) return this.opening;

    this.opening = new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      this.socket = socket;
      socket.setEncoding('utf8');
      socket.setNoDelay(true);

      const connectTimeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connect timeout to ${this.opts.host}:${this.opts.port}`));
      }, this.opts.connectTimeoutMs ?? 5000);

      socket.once('connect', () => {
        clearTimeout(connectTimeout);
        log.info(`connected to ${this.opts.host}:${this.opts.port}`);
        this.emitter.emit('open');
        resolve();
      });

      socket.on('data', (chunk: string) => this.onData(chunk));

      socket.on('error', (err) => {
        clearTimeout(connectTimeout);
        log.error('socket error', err.message);
        this.emitter.emit('error', err);
        this.failActiveAndQueue(err);
        reject(err);
      });

      socket.on('close', () => {
        log.info('socket closed');
        this.failActiveAndQueue(new Error('Connection closed'));
        this.emitter.emit('close');
        this.socket = null;
        this.opening = null;
      });

      socket.connect(this.opts.port, this.opts.host);
    });

    return this.opening;
  }

  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    this.opening = null;
    if (socket && !socket.destroyed) {
      await new Promise<void>((resolve) => {
        socket.end(() => resolve());
        // Hard cap so a half-open socket never blocks shutdown.
        setTimeout(() => {
          socket.destroy();
          resolve();
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
    this.buffer = '';

    if (!this.socket || !this.isOpen) {
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
    this.socket.write(next.command + '\r');
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
   * newlines, trim. (We leave echo on by default and strip here, rather than
   * relying on ATE0, so a mis-init never corrupts parsing.)
   */
  private cleanResponse(raw: string, command: string): string {
    let text = raw.replace(/\r/g, '\n');
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    // Drop a leading line that's just the echoed command.
    if (lines[0] && lines[0].replace(/\s/g, '').toUpperCase() === command.replace(/\s/g, '').toUpperCase()) {
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
