/**
 * Central error type for the bot.
 *
 * Port of the Rust `src/error.rs` `BotError` enum. Rust used `thiserror` with
 * one variant per failure domain; TypeScript has no enums-with-payloads, so
 * this is a single `Error` subclass carrying a `kind` discriminant plus the
 * variant's payload. Call sites match on `err.kind` instead of `match`.
 *
 * `userFacing` replaces the implicit Rust convention that music/command errors
 * were safe to show verbatim while `Discord`/`Http`/`Internal` were not.
 */

export type BotErrorKind =
  // ── Discord / gateway ──
  | 'Discord'
  // ── Command layer ──
  | 'UnknownCommand'
  | 'Cooldown'
  | 'Permission'
  | 'Custom'
  // ── Interaction layer ──
  | 'InteractionTimeout'
  | 'TokenExpired'
  // ── Music ──
  | 'NotInVoiceChannel'
  | 'BotNotInVoiceChannel'
  | 'WrongVoiceChannel'
  | 'QueueEmpty'
  | 'NothingPlaying'
  | 'InvalidPosition'
  | 'Lavalink'
  | 'NoResults'
  | 'InvalidTimestamp'
  | 'InvalidVolume'
  // ── Config ──
  | 'Config'
  // ── HTTP ──
  | 'Http'
  // ── Internal / catch-all ──
  | 'Internal';

/** Kinds whose `message` is safe to render straight into a Discord reply. */
const USER_FACING = new Set<BotErrorKind>([
  'UnknownCommand',
  'Cooldown',
  'Permission',
  'Custom',
  'NotInVoiceChannel',
  'BotNotInVoiceChannel',
  'WrongVoiceChannel',
  'QueueEmpty',
  'NothingPlaying',
  'InvalidPosition',
  'NoResults',
  'InvalidTimestamp',
  'InvalidVolume',
]);

export class BotError extends Error {
  override readonly name = 'BotError';
  readonly kind: BotErrorKind;

  constructor(kind: BotErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.kind = kind;
    Object.setPrototypeOf(this, BotError.prototype);
  }

  /** True when `message` can be shown to the user as-is. */
  get userFacing(): boolean {
    return USER_FACING.has(this.kind);
  }

  // ── Constructors, one per Rust variant ──────────────────────────────────────

  static discord(cause: unknown): BotError {
    return new BotError('Discord', `Discord API error: ${describe(cause)}`, { cause });
  }

  static unknownCommand(name: string): BotError {
    return new BotError('UnknownCommand', `Unknown command: ${name}`);
  }

  static cooldown(name: string, remainingSecs: number): BotError {
    return new BotError('Cooldown', `Command '${name}' is on cooldown for ${remainingSecs}s`);
  }

  static permission(what: string): BotError {
    return new BotError('Permission', `Missing permission: ${what}`);
  }

  static custom(message: string): BotError {
    return new BotError('Custom', message);
  }

  static interactionTimeout(componentId: string): BotError {
    return new BotError('InteractionTimeout', `Interaction timed out (component_id=${componentId})`);
  }

  static tokenExpired(): BotError {
    return new BotError('TokenExpired', 'Interaction token expired');
  }

  static notInVoiceChannel(): BotError {
    return new BotError('NotInVoiceChannel', 'Not in a voice channel');
  }

  static botNotInVoiceChannel(): BotError {
    return new BotError('BotNotInVoiceChannel', 'Bot is not in a voice channel');
  }

  static wrongVoiceChannel(): BotError {
    return new BotError('WrongVoiceChannel', 'You must be in the same voice channel as the bot');
  }

  static queueEmpty(): BotError {
    return new BotError('QueueEmpty', 'Queue is empty');
  }

  static nothingPlaying(): BotError {
    return new BotError('NothingPlaying', 'Nothing is currently playing');
  }

  static invalidPosition(position: number): BotError {
    return new BotError('InvalidPosition', `Invalid track position: ${position}`);
  }

  static lavalink(detail: string): BotError {
    return new BotError('Lavalink', `Lavalink error: ${detail}`);
  }

  static noResults(query: string): BotError {
    return new BotError('NoResults', `Search returned no results for: ${query}`);
  }

  static invalidTimestamp(ts: string): BotError {
    return new BotError('InvalidTimestamp', `Invalid seek timestamp: ${ts}`);
  }

  static invalidVolume(): BotError {
    return new BotError('InvalidVolume', 'Volume must be between 0 and 150');
  }

  static config(detail: string): BotError {
    return new BotError('Config', `Configuration error: ${detail}`);
  }

  static http(cause: unknown): BotError {
    return new BotError('Http', `HTTP error: ${describe(cause)}`, { cause });
  }

  static internal(cause: unknown): BotError {
    return new BotError('Internal', `Internal error: ${describe(cause)}`, { cause });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isBotError(value: unknown): value is BotError {
  return value instanceof BotError;
}

/** Extract a printable message from an arbitrary thrown value. */
export function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (value && typeof value === 'object' && 'message' in value) {
    return String((value as { message: unknown }).message);
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Normalise anything caught in a `catch` into a `BotError`. */
export function toBotError(value: unknown): BotError {
  return isBotError(value) ? value : BotError.internal(value);
}
