/**
 * Minimal typed event emitter. Avoids pulling Node's EventEmitter typings into
 * our domain interfaces and keeps listener signatures fully type-checked.
 */
// The constraint deliberately uses `keyof any` rather than `string`, so plain
// `interface` event maps (which lack an implicit string index signature) are
// accepted as type arguments.
export class Emitter<Events extends Record<keyof Events & (string | symbol), (...args: any[]) => void>> {
  private listeners: { [K in keyof Events]?: Set<Events[K]> } = {};

  on<E extends keyof Events>(event: E, listener: Events[E]): () => void {
    (this.listeners[event] ??= new Set()).add(listener);
    return () => this.off(event, listener);
  }

  off<E extends keyof Events>(event: E, listener: Events[E]): void {
    this.listeners[event]?.delete(listener);
  }

  emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): void {
    const set = this.listeners[event];
    if (!set) return;
    // Copy to a array so listeners can unsubscribe during emit safely.
    for (const fn of [...set]) {
      (fn as (...a: Parameters<Events[E]>) => void)(...args);
    }
  }

  removeAll(): void {
    this.listeners = {};
  }
}
