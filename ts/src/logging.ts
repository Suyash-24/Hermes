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

const terracotta = (s: string) => `\x1b[38;2;217;119;87m${s}\x1b[0m`;
const peach = (s: string) => `\x1b[38;2;240;150;120m${s}\x1b[0m`;

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Print iconic Claude Code aesthetic startup banner */
export function printClaudeBanner(botName: string = 'Hermes'): void {
  console.log('');
  console.log(terracotta(' ╭───────────────────────────────╮'));
  console.log(terracotta(` │ ✳ Welcome to ${botName.padEnd(16, ' ')} │`));
  console.log(terracotta(' ╰───────────────────────────────╯'));
  console.log(peach('  ██╗  ██╗███████╗██████╗ ███╗   ███╗███████╗███████╗'));
  console.log(peach('  ██║  ██║██╔════╝██╔══██╗████╗ ████║██╔════╝██╔════╝'));
  console.log(peach('  ███████║█████╗  ██████╔╝██╔████╔██║█████╗  ███████╗'));
  console.log(peach('  ██╔══██║██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══╝  ╚════██║'));
  console.log(peach('  ██║  ██║███████╗██║  ██║██║ ╚═╝ ██║███████╗███████║'));
  console.log(peach('  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚══════╝'));
  console.log('');
  console.log(` ${pc.dim(`${botName} • Node.js ${process.version} • Seyfert Engine • Lavalink v4`)}`);
  console.log('');
}

/** Apply the configured level and formatter. Call once, at boot. */
export function initLogging({ level, pretty }: LoggingOptions): void {
  const resolved = LEVELS[level] ?? LogLevels.Info;
  Logger.DEFAULT_OPTIONS.logLevel = resolved;
  log.level = resolved;

  if (pretty) {
    // Beautiful Claude Code aesthetic logger
    Logger.customize((self, logLevel, args) => {
      const time = pc.dim(new Date().toLocaleTimeString([], { hour12: false }));
      
      let badge = '';
      let msgColor = (s: string) => s;

      switch (logLevel) {
        case LogLevels.Debug:
          badge = pc.dim('dbg ');
          msgColor = pc.dim;
          break;
        case LogLevels.Info:
          badge = terracotta('info');
          break;
        case LogLevels.Warn:
          badge = pc.yellow('warn');
          msgColor = pc.yellow;
          break;
        case LogLevels.Error:
          badge = pc.red('err ');
          msgColor = pc.red;
          break;
        case LogLevels.Fatal:
          badge = pc.bgRed(pc.white(' fatal '));
          msgColor = pc.red;
          break;
      }

      const rawName = self.name ?? 'Fade';
      const cleanName = rawName.replace(/^Fade:/, '');
      const nameBadge = pc.dim(`[${cleanName}]`);
      const msg = msgColor(args.map(safeStringify).join(' '));

      return [`${time}  ${badge}  ${nameBadge} ${msg}`];
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
