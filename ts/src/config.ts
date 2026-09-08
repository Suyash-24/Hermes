/**
 * Configuration loading for Fade.
 *
 * Mirrors the Rust `src/config.rs`: read `config/default.toml`, then let
 * environment variables override individual fields. `DISCORD_TOKEN` is
 * mandatory and only ever comes from the environment.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseToml } from 'smol-toml';

// ── Shapes ────────────────────────────────────────────────────────────────────

export interface BotConfig {
  name: string;
  prefix: string;
  /** Owner user IDs as snowflake strings. */
  owners: string[];
}

export interface GatewayConfig {
  shards: number;
  reconnectTimeout: number;
}

export interface LoggingConfig {
  level: string;
  pretty: boolean;
}

export interface LavalinkConfig {
  host: string;
  port: number;
  password: string;
  https: boolean;
}

export interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface Config {
  bot: BotConfig;
  gateway: GatewayConfig;
  logging: LoggingConfig;
  lavalink: LavalinkConfig;
  spotify?: SpotifyConfig;
  token: string;
}

// ── Coercion helpers ──────────────────────────────────────────────────────────
//
// `integersAsBigInt` keeps snowflakes lossless, so every numeric field arrives
// as a bigint and has to be narrowed deliberately.

function asString(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint' || typeof value === 'number') return String(value);
  return fallback;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true' || value === '1';
  return fallback;
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(entry => {
      if (typeof entry === 'string') return entry.trim();
      if (typeof entry === 'bigint' || typeof entry === 'number') return String(entry);
      return '';
    })
    .filter(id => /^\d{15,25}$/.test(id));
}

function table(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

// ── Loader ────────────────────────────────────────────────────────────────────

/** Absolute path of the TOML config, overridable with `CONFIG_PATH`. */
export function configPath(): string {
  return resolve(env('CONFIG_PATH') ?? join(process.cwd(), 'config', 'default.toml'));
}

/**
 * Load the configuration. Throws when `DISCORD_TOKEN` is absent — the bot
 * cannot do anything useful without it, so failing loudly at boot is correct.
 */
export function loadConfig(): Config {
  const path = configPath();
  let raw: Record<string, unknown> = {};

  if (existsSync(path)) {
    raw = parseToml(readFileSync(path, 'utf8'), { integersAsBigInt: true }) as Record<
      string,
      unknown
    >;
  }

  const bot = table(raw, 'bot');
  const gateway = table(raw, 'gateway');
  const logging = table(raw, 'logging');
  const lavalink = table(raw, 'lavalink');
  const spotify = table(raw, 'spotify');

  const token = env('DISCORD_TOKEN');
  if (!token) {
    throw new Error(
      'DISCORD_TOKEN is not set. Put it in the environment (or a .env file) — it is never read from config/default.toml.',
    );
  }

  const config: Config = {
    bot: {
      name: env('BOT_NAME') ?? asString(bot.name, 'Fade'),
      prefix: env('BOT_PREFIX') ?? asString(bot.prefix, '^^'),
      owners: env('BOT_OWNERS') ? asIdList(env('BOT_OWNERS')!.split(',')) : asIdList(bot.owners),
    },
    gateway: {
      shards: asNumber(env('GATEWAY_SHARDS') ?? gateway.shards, 1),
      reconnectTimeout: asNumber(gateway.reconnect_timeout, 30),
    },
    logging: {
      level: (env('LOG_LEVEL') ?? asString(logging.level, 'info')).toLowerCase(),
      pretty: asBoolean(logging.pretty, true),
    },
    lavalink: {
      host: env('LAVALINK_HOST') ?? asString(lavalink.host, 'localhost'),
      port: asNumber(env('LAVALINK_PORT') ?? lavalink.port, 2333),
      password: env('LAVALINK_PASSWORD') ?? asString(lavalink.password, 'youshallnotpass'),
      https: asBoolean(env('LAVALINK_HTTPS') ?? lavalink.https, false),
    },
    token,
  };

  const clientId = env('SPOTIFY_CLIENT_ID') ?? (spotify.client_id as string | undefined);
  const clientSecret = env('SPOTIFY_CLIENT_SECRET') ?? (spotify.client_secret as string | undefined);
  const refreshToken = env('SPOTIFY_REFRESH_TOKEN') ?? (spotify.refresh_token as string | undefined);
  if (clientId && clientSecret && refreshToken) {
    config.spotify = { clientId, clientSecret, refreshToken };
  }

  return config;
}

// ── Derived accessors ─────────────────────────────────────────────────────────

export function lavalinkAddress(cfg: LavalinkConfig): string {
  return `${cfg.host}:${cfg.port}`;
}

export function lavalinkWsUrl(cfg: LavalinkConfig): string {
  return `${cfg.https ? 'wss' : 'ws'}://${lavalinkAddress(cfg)}/v4/websocket`;
}

export function lavalinkHttpUrl(cfg: LavalinkConfig): string {
  return `${cfg.https ? 'https' : 'http'}://${lavalinkAddress(cfg)}`;
}
