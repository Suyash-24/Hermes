/**
 * Fade's emoji system.
 *
 * Every emoji Fade uses lives here — no magic strings scattered in command
 * files. Grouped by role so responses feel cohesive and intentional.
 *
 * Design direction: cool, minimal, slightly celestial.
 * Avoid: bright primary colours, overly playful, random.
 *
 * Port of the Rust `src/components/emoji.rs`.
 *
 * @example
 * ```ts
 * import { E, stat } from './components/emoji';
 *
 * const header = `${E.BRAND} Fade`;
 * const line   = stat(E.MEMBERS, 'Members', count);
 * ```
 */

export const E = {
  // ── Brand / Identity ────────────────────────────────────────────────────────
  /** Fade's signature. */
  BRAND: '<:hermes:1541085373764206674>',
  /** Decorative accent (no variation selector). */
  STAR: '<:star:1541086754583347210>',
  /** Lighter accent. */
  SPARK: '<:sparkle:1541087185753612298>',
  /** Owner / top rank. */
  CROWN: '<:crown:1541089327780724796>',

  // ── Status ──────────────────────────────────────────────────────────────────
  ONLINE: '<:online:1541090998351036416>',
  IDLE: '<:idle:1541090967904329749>',
  DND: '<:dnd:1541090930453516338>',
  OFFLINE: '<:offline:1541090899663261706>',
  OK: '<:tick:1541095138074431508>',
  ERROR: '<:cross:1541095302881345627>',
  WARN: '<:warning:1541095227400650754>',
  INFO: 'ℹ',

  // AFK
  AFK_SET: '<a:afkset:1546811558989004831>',
  IS_AFK: '<a:isafk:1546811589531930664>',
  AFK_REMOVE: '<a:afkremove:1546811591885066331>',
  SHINE: '<:shine:1546855654831030412>',

  // ── Actions / UI ────────────────────────────────────────────────────────────
  REFRESH: '🔄',
  BACK: '◀️',
  FORWARD: '▶️',
  LINK: '⎋',
  CLOSE: '✕',
  CONFIRM: '✔',
  SEARCH: '⌕',
  SETTINGS: '⚙',
  PIN: '⊕',
  COPY: '⎙',

  // ── Server / Guild stats ────────────────────────────────────────────────────
  MEMBERS: '◉',
  CHANNELS: '≡',
  ROLES: '◆',
  BOOSTS: '⬡',
  CREATED: '◷',
  REGION: '◍',
  ID: '⋕',

  // ── Bot stats ───────────────────────────────────────────────────────────────
  LATENCY: '<:ping:1541096502188056611>',
  SHARD: '◈',
  UPTIME: '⏲',
  SERVERS: '⊞',
  VERSION: '◇',
  MEMORY: '▣',
  CPU: '▤',

  // ── User profile ────────────────────────────────────────────────────────────
  USER: '◯',
  AVATAR: '▣',
  JOINED: '◷',
  BADGE: '◈',
  NITRO: '⬡',

  // ── Moderation ──────────────────────────────────────────────────────────────
  BAN: '⊗',
  KICK: '⊘',
  MUTE: '⊖',
  WARN_MOD: '⚠',
  LOG: '⊟',
  SHIELD: '⬡',
  LOCK: '⊕',
  UNLOCK: '⊖',

  // ── Music ───────────────────────────────────────────────────────────────────
  MUSIC: '<:music:1541097435592401048>',
  PLAYING: '▶',
  PAUSED: '⏸',
  STOPPED: '⏹',
  SKIP: '⏭',
  PREV: '⏮',
  QUEUE: '≡',
  SHUFFLE: '🔀',
  LOOP: '🔁',
  LOOP_ONE: '🔂',
  VOLUME_UP: '🔊',
  VOLUME_DOWN: '🔉',
  MUTED: '🔇',
  NOTE: '♪',
  NOTES: '♫',
  DISC: '💿',
  MIC: '🎤',
  WAVE: '〰',
  HEADPHONES: '<:headphone:1541098762695483543>',
  SPEAKER: '🔈',
  LYRICS: '<:lyrics:1541099234592428074>',
  DURATION: '⏱',
  JOINED_VC: '🔊',
  LEFT_VC: '🔇',

  // ── Progress bar ────────────────────────────────────────────────────────────
  BAR_FULL: '▓',
  BAR_EMPTY: '░',
  BAR_HEAD: '◉',

  // ── Separators / decorative ─────────────────────────────────────────────────
  DOT: '·',
  BULLET: '▸',
  DASH: '—',
  PIPE: '│',
  CORNER: '╰',
  LINE: '─',
} as const;

/**
 * Accent colours for Container components — 24-bit RGB integers.
 *
 * Fade's palette: cool, desaturated, intentional. `QUEUE`/`LYRICS` drop the
 * Rust `_CLR` suffix, which only existed to dodge a name clash that TypeScript
 * object literals do not have.
 */
export const Colour = {
  BLURPLE: 0x5865f2, // Discord brand
  FADE: 0x7b8cde, // Fade's signature blue-purple
  SLATE: 0x4a5568, // neutral dark
  MIST: 0x718096, // neutral mid
  ICE: 0xa0aec0, // light neutral
  VOID: 0x2d3748, // near-black
  AURORA: 0x667eea, // soft indigo
  DUSK: 0x764ba2, // deep purple
  OCEAN: 0x006994, // deep teal-blue
  FROST: 0x81ecec, // pale cyan

  // Semantic
  SUCCESS: 0x48bb78, // green
  WARNING: 0xecc94b, // amber
  DANGER: 0xfc8181, // soft red
  INFO: 0x63b3ed, // sky blue

  // Music-specific
  MUSIC: 0x9b59b6, // rich violet for now-playing
  QUEUE: 0x3498db, // blue for queue
  LYRICS: 0x1abc9c, // teal for lyrics
} as const;

// ── Formatted line helpers ────────────────────────────────────────────────────

/** Format a stat row: `{emoji}  **{label}** — {value}` */
export function stat(emoji: string, label: string, value: unknown): string {
  return `${emoji}  **${label}** — ${value}`;
}

/** Format a muted hint line: `-# {text}` */
export function hint(text: string): string {
  return `-# ${text}`;
}

/** Format a section header: `## {emoji} {title}` */
export function header(emoji: string, title: string): string {
  return `## ${emoji} ${title}`;
}

/** Format a subheader: `### {title}` */
export function subheader(title: string): string {
  return `### ${title}`;
}

/** A decorative divider line using Fade's accent chars. */
export function dividerText(): string {
  return `${E.LINE.repeat(8)} ${E.STAR} ${E.LINE.repeat(8)}`;
}

/**
 * Build a text-based progress bar. `progress` is 0..1, `width` is the total
 * character count — the head replaces one empty cell so the width is exact.
 */
export function progressBar(progress: number, width: number): string {
  const ratio = Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 1) : 0;
  const filled = Math.min(Math.trunc(ratio * width), width);
  const empty = Math.max(width - filled, 0);
  const showHead = filled < width;
  return (
    E.BAR_FULL.repeat(filled) +
    (showHead ? E.BAR_HEAD : '') +
    E.BAR_EMPTY.repeat(Math.max(empty - (showHead ? 1 : 0), 0))
  );
}

/** Format milliseconds as `m:ss`, or `h:mm:ss` past an hour. */
export function formatDurationMs(ms: number): string {
  const totalSecs = Math.max(Math.floor((Number.isFinite(ms) ? ms : 0) / 1000), 0);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
}

/**
 * Parse a `mm:ss` or `hh:mm:ss` timestamp into milliseconds.
 *
 * Returns `undefined` for anything else — including a bare `"90"`, matching the
 * Rust original, which only accepted two- and three-part timestamps.
 */
export function parseTimestamp(ts: string): number | undefined {
  const parts = ts.split(':');
  if (parts.length !== 2 && parts.length !== 3) return undefined;

  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return undefined;
    const parsed = Number(part);
    if (!Number.isSafeInteger(parsed)) return undefined;
    nums.push(parsed);
  }

  return parts.length === 2
    ? nums[0]! * 60_000 + nums[1]! * 1_000
    : nums[0]! * 3_600_000 + nums[1]! * 60_000 + nums[2]! * 1_000;
}
