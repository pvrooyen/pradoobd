/**
 * Transport abstraction — the seam that future-proofs this project.
 *
 * A Transport is the lowest layer: it knows how to (a) open/close a link to a
 * diagnostic adapter and (b) exchange a *line* of text — send a command string,
 * get back the adapter's textual reply up to its prompt. It knows NOTHING about
 * OBD modes, PIDs, or decoding — that lives in the protocol layer above.
 *
 * Today the only real implementation is ElmWifiTransport (ELM327 over TCP).
 * Tomorrow, a J2534Transport, DoIpTransport, or BluetoothTransport can implement
 * this same interface and everything above it (protocol, decoders, WS bridge,
 * React UI) keeps working unchanged. THAT is why the app is built around this
 * interface rather than around the ELM327 directly.
 *
 * Note: ELM327 is inherently a request/response, one-command-at-a-time device.
 * The interface reflects that: `send` is serialized by the implementation, so
 * callers can `await` each command without interleaving.
 */

export interface TransportEvents {
  /** Underlying link opened (TCP socket connected), before any init. */
  open: () => void;
  /** Link closed (remote hung up, or we disconnected). */
  close: (reason?: string) => void;
  /** Transport-level error (socket error, etc.). */
  error: (err: Error) => void;
  /**
   * Raw bytes/text observed from the adapter, for the terminal/sniffer view.
   * Emitted in addition to being returned from `send`.
   */
  data: (chunk: string) => void;
}

export interface SendOptions {
  /** Override the default per-command timeout for this one call. */
  timeoutMs?: number;
}

export interface Transport {
  /** A short label for logs/UI, e.g. "ELM327-WiFi". */
  readonly kind: string;

  /** True between a successful open() and the next close(). */
  readonly isOpen: boolean;

  /** Open the underlying link. Resolves once ready to accept commands. */
  open(): Promise<void>;

  /** Close the link and release resources. Safe to call when already closed. */
  close(): Promise<void>;

  /**
   * Send one command line and return the adapter's textual response (with the
   * trailing prompt character stripped, CRs normalized). Implementations MUST
   * serialize concurrent calls so commands never interleave on the wire.
   *
   * @throws on timeout or if the link is not open.
   */
  send(command: string, opts?: SendOptions): Promise<string>;

  /** Subscribe to a transport event. Returns an unsubscribe function. */
  on<E extends keyof TransportEvents>(event: E, listener: TransportEvents[E]): () => void;
}
