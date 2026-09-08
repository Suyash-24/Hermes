/**
 * Persistent configuration store — a single JSON file on disk.
 *
 * Port of the Rust `src/db.rs`. Field names on disk are kept identical to the
 * serde output (`guild_prefixes`, `twenty_four_seven`, …) so an existing
 * `database.json` written by the Rust bot loads unchanged.
 *
 * Rust's `HashMap<u64, _>` / `HashSet<u64>` become `Map<string, _>` / `Set<string>`
 * keyed on snowflake strings — see `quoteLongIntegers` for why the IDs are never
 * allowed to become JS numbers.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from './logging';

const log = logger('db');

/** Path of the JSON store, overridable with `DATABASE_PATH`. */
export function databasePath(): string {
  const override = process.env.DATABASE_PATH;
  return resolve(override && override.length > 0 ? override : 'database.json');
}

// ── Snowflake-safe JSON ───────────────────────────────────────────────────────
//
// Rust serialised guild/channel IDs as bare JSON integers. A Discord snowflake
// is ~19 digits — far past `Number.MAX_SAFE_INTEGER` (16 digits) — so a plain
// `JSON.parse` silently rounds `1319707981377699920` to `...699900`. Object keys
// survive (JSON keys are always strings) but array elements and values do not,
// which would corrupt `twenty_four_seven`, the channel sets, and
// `active_voice_channels`. So: quote every long bare integer before parsing.

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

function quoteLongIntegers(json: string): string {
  let out = '';
  let inString = false;
  let i = 0;

  while (i < json.length) {
    const ch = json[i]!;

    if (inString) {
      if (ch === '\\') {
        out += ch + (json[i + 1] ?? '');
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      out += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      i++;
      continue;
    }

    // Negative numbers are never IDs — copy the whole token verbatim.
    if (ch === '-') {
      out += ch;
      i++;
      while (isDigit(json[i]) || json[i] === '.' || json[i] === 'e' || json[i] === 'E') {
        out += json[i];
        i++;
      }
      continue;
    }

    if (isDigit(ch)) {
      let j = i;
      while (isDigit(json[j])) j++;
      const digits = json.slice(i, j);
      const next = json[j];
      const isPlainInteger = next !== '.' && next !== 'e' && next !== 'E';
      out += isPlainInteger && digits.length >= 16 ? `"${digits}"` : digits;
      i = j;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

// ── Coercion helpers ──────────────────────────────────────────────────────────

function asId(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return /^\d{15,25}$/.test(trimmed) ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'bigint' && value > 0n) return String(value);
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return 0;
}

/** `{ "<id>": <timestamp> }` → `Map<id, timestamp>` */
function readExpiryMap(value: unknown): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, raw] of Object.entries(asRecord(value))) {
    const id = asId(key);
    if (id) out.set(id, asTimestamp(raw));
  }
  return out;
}

/** `{ "<id>": "<string>" }` → `Map<id, string>` */
function readStringMap(value: unknown): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, raw] of Object.entries(asRecord(value))) {
    const id = asId(key);
    if (id && typeof raw === 'string' && raw.length > 0) out.set(id, raw);
  }
  return out;
}

/** `{ "<id>": <bool> }` → `Map<id, boolean>` */
function readBoolMap(value: unknown): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const [key, raw] of Object.entries(asRecord(value))) {
    const id = asId(key);
    if (id) out.set(id, raw === true || raw === 'true');
  }
  return out;
}

/** `{ "<id>": "<id>" }` → `Map<id, id>` */
function readIdMap(value: unknown): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, raw] of Object.entries(asRecord(value))) {
    const key_ = asId(key);
    const val = asId(raw);
    if (key_ && val) out.set(key_, val);
  }
  return out;
}

/** `{ "<id>": { "reason": "<string>", "timestamp": <number> } }` */
function readAfkMap(value: unknown): Map<string, { reason: string; timestamp: number }> {
  const out = new Map<string, { reason: string; timestamp: number }>();
  for (const [key, raw] of Object.entries(asRecord(value))) {
    const id = asId(key);
    const obj = asRecord(raw);
    if (id && typeof obj.reason === 'string' && typeof obj.timestamp === 'number') {
      out.set(id, { reason: obj.reason, timestamp: obj.timestamp });
    }
  }
  return out;
}

/** `[<id>, …]` → `Set<id>` */
function readIdSet(value: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(value)) return out;
  for (const raw of value) {
    const id = asId(raw);
    if (id) out.add(id);
  }
  return out;
}

/** `{ "<id>": [<id>, …] }` → `Map<id, Set<id>>` */
function readIdSetMap(value: unknown): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [key, raw] of Object.entries(asRecord(value))) {
    const id = asId(key);
    if (!id) continue;
    const set = readIdSet(raw);
    if (set.size > 0) out.set(id, set);
  }
  return out;
}

// ── Serialisation back out ────────────────────────────────────────────────────

function writeMap<V>(map: Map<string, V>): Record<string, V> {
  return Object.fromEntries(map);
}

function writeSetMap(map: Map<string, Set<string>>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, set] of map) {
    if (set.size > 0) out[key] = [...set];
  }
  return out;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export class Database {
  /** User ID → expiry unix seconds. `0` means lifetime. */
  noprefix = new Map<string, number>();
  /** Guild ID → custom prefix. */
  guildPrefixes = new Map<string, string>();
  /** Guild IDs with 24/7 mode enabled. */
  twentyFourSeven = new Set<string>();
  /** Guild ID → expiry unix seconds. `0` means lifetime. */
  premiumGuilds = new Map<string, number>();
  /** Guild ID → blacklisted channel IDs. */
  blacklistedChannels = new Map<string, Set<string>>();
  /** Guild ID → whitelisted channel IDs. */
  whitelistedChannels = new Map<string, Set<string>>();
  /** Guild ID → admin bypass enabled. Absent means enabled. */
  adminBypass = new Map<string, boolean>();
  /** Guild ID → channel ID of the active voice connection. */
  activeVoiceChannels = new Map<string, string>();
  /** User ID -> AFK info. */
  afkUsers = new Map<string, { reason: string; timestamp: number }>();

  /** Read the store from disk, or start empty when it is missing or corrupt. */
  static load(): Database {
    const db = new Database();
    const path = databasePath();

    if (!existsSync(path)) {
      log.info('Creating new database');
      return db;
    }

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(quoteLongIntegers(readFileSync(path, 'utf8'))) as Record<string, unknown>;
    } catch (err) {
      log.error(`Failed to read/deserialize database, starting empty:`, err);
      return db;
    }

    db.noprefix = readExpiryMap(raw.noprefix);
    db.guildPrefixes = readStringMap(raw.guild_prefixes);
    db.twentyFourSeven = readIdSet(raw.twenty_four_seven);
    db.premiumGuilds = readExpiryMap(raw.premium_guilds);
    db.blacklistedChannels = readIdSetMap(raw.blacklisted_channels);
    db.whitelistedChannels = readIdSetMap(raw.whitelisted_channels);
    db.adminBypass = readBoolMap(raw.admin_bypass);
    db.activeVoiceChannels = readIdMap(raw.active_voice_channels);
    db.afkUsers = readAfkMap(raw.afk_users);

    log.info(`Loaded database from ${path}`);
    return db;
  }

  /** Plain object in the on-disk (serde-compatible) shape. */
  toJSON(): Record<string, unknown> {
    return {
      noprefix: writeMap(this.noprefix),
      guild_prefixes: writeMap(this.guildPrefixes),
      twenty_four_seven: [...this.twentyFourSeven],
      premium_guilds: writeMap(this.premiumGuilds),
      blacklisted_channels: writeSetMap(this.blacklistedChannels),
      whitelisted_channels: writeSetMap(this.whitelistedChannels),
      admin_bypass: writeMap(this.adminBypass),
      active_voice_channels: writeMap(this.activeVoiceChannels),
      afk_users: writeMap(this.afkUsers),
    };
  }

  /**
   * Persist to disk. Writes to a sibling temp file and renames, so a crash
   * mid-write cannot leave a truncated `database.json` behind.
   */
  save(): void {
    const path = databasePath();
    try {
      const body = JSON.stringify(this.toJSON(), null, 2);
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, body, 'utf8');
      renameSync(tmp, path);
    } catch (err) {
      log.error('Failed to write database file:', err);
    }
  }

  // ── Expiry-aware accessors ──────────────────────────────────────────────────
  //
  // `0` means lifetime. Rust checked this inline in `noprefix.rs`, `premium.rs`
  // and `handler.rs`; centralising it keeps the three call sites honest.

  /** True when the entry exists and has not expired. Prunes expired entries. */
  private hasUnexpired(map: Map<string, number>, id: string): boolean {
    const expiresAt = map.get(id);
    if (expiresAt === undefined) return false;
    if (expiresAt === 0) return true;
    if (expiresAt > nowSecs()) return true;
    map.delete(id);
    return false;
  }

  hasNoPrefix(userId: string): boolean {
    return this.hasUnexpired(this.noprefix, userId);
  }

  isPremium(guildId: string): boolean {
    return this.hasUnexpired(this.premiumGuilds, guildId);
  }

  /** Custom prefix for a guild, or `undefined` to fall back to the config default. */
  prefixFor(guildId: string | undefined): string | undefined {
    return guildId ? this.guildPrefixes.get(guildId) : undefined;
  }

  /** Admin bypass defaults to enabled when the guild has no explicit entry. */
  adminBypassEnabled(guildId: string): boolean {
    return this.adminBypass.get(guildId) ?? true;
  }
}

/** Current unix time in seconds. */
export function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}
