import { Logger, LogLevels } from 'seyfert';
import pc from 'picocolors';

const LEVELS: Record<string, LogLevels> = {
  trace: LogLevels.Debug,
  debug: LogLevels.Debug,
  info: LogLevels.Info,
  warn: LogLevels.Warn,
  error: LogLevels.Error,
  fatal: LogLevels.Fatal,
};

export interface LoggingOptions {
  level: string;
  pretty: boolean;
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Apply the configured level and formatter. Call once, at boot. */
export function initLogging({ level, pretty }: LoggingOptions): void {
  const resolved = LEVELS[level] ?? LogLevels.Info;
  Logger.DEFAULT_OPTIONS.logLevel = resolved;
  log.level = resolved;

  if (pretty) {
    // Beautiful, Claude-code like aesthetic logging
    Logger.customize((self, logLevel, args) => {
      const time = pc.dim(new Date().toLocaleTimeString([], { hour12: false }));
      
      let levelBadge = '';
      let msgColor = (s: string) => s;

      switch (logLevel) {
        case LogLevels.Debug:
          levelBadge = pc.gray('▶ DBG');
          msgColor = pc.gray;
          break;
        case LogLevels.Info:
          levelBadge = pc.blue('ℹ INF');
          break;
        case LogLevels.Warn:
          levelBadge = pc.yellow('⚠ WRN');
          msgColor = pc.yellow;
          break;
        case LogLevels.Error:
          levelBadge = pc.red('✖ ERR');
          msgColor = pc.red;
          break;
        case LogLevels.Fatal:
          levelBadge = pc.bgRed(pc.white(' ✖ FTL '));
          msgColor = pc.red;
          break;
      }

      const namePrefix = self.name ? pc.cyan(`${self.name}`) : '';
      const msg = msgColor(args.map(safeStringify).join(' '));

      return [`${time} ${levelBadge} ${namePrefix} ${pc.dim('│')} ${msg}`];
    });
  } else {
    // JSON logging
    Logger.customize((self, logLevel, args) => [
      JSON.stringify({
        ts: new Date().toISOString(),
        level: (LogLevels[logLevel] ?? String(logLevel)).toLowerCase(),
        name: self.name,
        msg: args.map(safeStringify).join(' '),
      }),
    ]);
  }
}

/** Shared application logger. */
export const log = new Logger({ name: 'Fade' });

/** Namespaced child logger, e.g. `logger('music')`. */
export function logger(name: string): Logger {
  return new Logger({ name: `Fade:${name}` });
}
