/**
 * Tiny leveled logger. Intentionally dependency-free. Set LOG_LEVEL=debug to see
 * every byte exchanged with the adapter — invaluable when reverse-engineering
 * Toyota PIDs at the car.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const envLevel = (process.env.LOG_LEVEL as Level) || 'info';
const threshold = ORDER[envLevel] ?? ORDER.info;

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

function log(level: Level, scope: string, ...args: unknown[]): void {
  if (ORDER[level] < threshold) return;
  const tag = `[${ts()}] ${level.toUpperCase().padEnd(5)} ${scope}`;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(tag, ...args);
}

export function createLogger(scope: string) {
  return {
    debug: (...a: unknown[]) => log('debug', scope, ...a),
    info: (...a: unknown[]) => log('info', scope, ...a),
    warn: (...a: unknown[]) => log('warn', scope, ...a),
    error: (...a: unknown[]) => log('error', scope, ...a),
  };
}
