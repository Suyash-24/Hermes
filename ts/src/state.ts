/**
 * Shared application state.
 *
 * Port of the Rust `src/state.rs`, with two deliberate structural changes:
 *
 * 1. **No locks.** Rust wrapped everything in `Arc<RwLock<AppState>>`, and
 *    `events.rs` deadlocked itself by re-acquiring the read guard at `:169`
 *    while still holding it from `:45` — and held that guard across multi-second
 *    HTTP calls. Node is single-threaded, so the whole failure mode is gone.
 *
 * 2. **No `music_queues`.** The Rust `DashMap<GuildId, Arc<Mutex<GuildQueue>>>`
 *    is replaced by lavalink-client's own `Player.queue`; per-guild extras live
 *    in the player's typed `setData`/`getData` store (see `music/playerData`).
 *
 * There is exactly one bot process, so the state is a module singleton reached
 * through `appState()` rather than threaded through every call like a TypeMap.
 */
import type { Config } from './config';
import { Database, nowSecs } from './db';
import { BotError } from './error';
import { SpotifyClient } from './spotify';

/** An in-flight interaction session, e.g. a paginated embed. */
export interface SessionData {
  /** Who started this session. */
  userId: string;
  /** Unix seconds when this session expires. */
  expiresAt: number;
  /** Arbitrary command-specific payload. */
  payload: unknown;
}

export class AppState {
  /** Persistent configuration store. */
  readonly db: Database;

  /** `"{userId}:{commandName}"` → unix seconds when the cooldown expires. */
  readonly cooldowns = new Map<string, number>();

  /** Component custom_id → session payload. */
  readonly sessions = new Map<string, SessionData>();

  /** Spotify API client, when all three credentials are configured. */
  readonly spotify?: SpotifyClient;

  /** Bearer token for the Puter AI proxy used by autoplay. */
  readonly puterAuthToken?: string;

  /** Last.fm API key used by autoplay's `track.getsimilar` lookup. */
  readonly lastfmApiKey?: string;

  /** Process start, for uptime reporting. */
  readonly startedAt = Date.now();

  constructor(readonly config: Config) {
    this.db = Database.load();

    if (config.spotify) {
      this.spotify = new SpotifyClient(
        config.spotify.clientId,
        config.spotify.clientSecret,
        config.spotify.refreshToken,
      );
    }

    this.puterAuthToken = process.env.PUTER_AUTH_TOKEN || undefined;
    this.lastfmApiKey = process.env.LASTFM_API_KEY || undefined;
  }

  // ── Cooldowns ───────────────────────────────────────────────────────────────

  private static cooldownKey(userId: string, command: string): string {
    return `${userId}:${command}`;
  }

  /** Seconds left on a cooldown, or `0` when the command is ready. */
  cooldownRemaining(userId: string, command: string): number {
    const key = AppState.cooldownKey(userId, command);
    const expiresAt = this.cooldowns.get(key);
    if (expiresAt === undefined) return 0;
    const remaining = expiresAt - nowSecs();
    if (remaining > 0) return remaining;
    this.cooldowns.delete(key);
    return 0;
  }

  /** Start a cooldown for `seconds` from now. */
  startCooldown(userId: string, command: string, seconds: number): void {
    this.cooldowns.set(AppState.cooldownKey(userId, command), nowSecs() + seconds);
  }

  // ── Sessions ────────────────────────────────────────────────────────────────

  putSession(customId: string, session: SessionData): void {
    this.sessions.set(customId, session);
  }

  /** Fetch a live session, dropping it if it has expired. */
  getSession(customId: string): SessionData | undefined {
    const session = this.sessions.get(customId);
    if (!session) return undefined;
    if (session.expiresAt > nowSecs()) return session;
    this.sessions.delete(customId);
    return undefined;
  }

  dropSession(customId: string): void {
    this.sessions.delete(customId);
  }

  /** Drop every expired session. Cheap enough to call on a timer. */
  pruneSessions(): number {
    const now = nowSecs();
    let dropped = 0;
    for (const [key, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(key);
        dropped++;
      }
    }
    return dropped;
  }

  /** Uptime in milliseconds. */
  uptimeMs(): number {
    return Date.now() - this.startedAt;
  }
}

// ── Singleton access ──────────────────────────────────────────────────────────

let current: AppState | undefined;

/** Build the state. Call once, at boot, before anything touches `appState()`. */
export function initAppState(config: Config): AppState {
  current = new AppState(config);
  return current;
}

/** The shared state. Throws when called before `initAppState`. */
export function appState(): AppState {
  if (!current) throw BotError.internal('AppState accessed before initAppState()');
  return current;
}
