/**
 * Per-guild player extras.
 *
 * Replaces the Rust `GuildQueue` (`src/music/queue.rs`) and the
 * `DashMap<GuildId, Arc<Mutex<GuildQueue>>>` it lived in. Most of that struct
 * is redundant now — lavalink-client's `Player` already owns it:
 *
 * | Rust `GuildQueue`      | lavalink-client                  |
 * | ---------------------- | -------------------------------- |
 * | `tracks`, `current`    | `player.queue.tracks`, `.current`|
 * | `history`              | `player.queue.previous`          |
 * | `loop_mode`            | `player.repeatMode`              |
 * | `volume`               | `player.volume`                  |
 * | `text_channel`         | `player.textChannelId`           |
 * | `voice_channel`        | `player.voiceChannelId`          |
 *
 * What is left has no home in the library, so it goes in the player's own
 * `setData`/`getData` store — one object under one key, typed here so call
 * sites never stringly-type a key or cast an `unknown`.
 *
 * Nothing db-backed is mirrored in here (24/7, bound channels, premium): the
 * `Database` is the single source of truth for those, and a second copy would
 * only drift.
 */
import type { Player, Track, UnresolvedTrack } from 'lavalink-client';

/** Storage key inside the player's data store. */
const KEY = 'fade';

/** Who requested a track. Attached to `Track.requester` at enqueue time. */
export interface Requester {
  id: string;
  username: string;
  avatarUrl?: string;
}

/** Fade's per-guild state that lavalink-client has nowhere to put. */
export interface FadePlayerData {
  /** Whether autoplay keeps the queue alive when it empties. */
  autoplay: boolean;
  /** Display-only: whether the queue was shuffled (the shuffle itself is destructive). */
  shuffle: boolean;
  /** The live "now playing" card, so it can be edited or cleaned up later. */
  nowPlayingMsg?: { channelId: string; messageId: string };
  /** Identifier of the track that card was built for, so a looped song edits it. */
  nowPlayingTrackId?: string;
  /** Candidate resolved ahead of time by the autoplay prefetch. */
  preparedAutoplay?: Track;
  /** Guard so two track-end events cannot start two prefetches. */
  prefetching: boolean;
}

const DEFAULTS: Readonly<FadePlayerData> = {
  autoplay: false,
  shuffle: false,
  prefetching: false,
};

/**
 * Fade's data for this player, created on first access.
 *
 * The returned object is the live stored one — mutating a field is enough, no
 * write-back needed. Use {@link setPlayerData} when you would rather be explicit.
 */
export function playerData(player: Player): FadePlayerData {
  const existing = player.getData<FadePlayerData | undefined>(KEY);
  if (existing) return existing;
  const fresh: FadePlayerData = { ...DEFAULTS };
  player.setData(KEY, fresh);
  return fresh;
}

/** Apply a partial update and return the merged data. */
export function setPlayerData(player: Player, patch: Partial<FadePlayerData>): FadePlayerData {
  const data = Object.assign(playerData(player), patch);
  player.setData(KEY, data);
  return data;
}

/** Whether autoplay is on for this guild. Safe on a missing player. */
export function autoplayEnabled(player: Player | undefined): boolean {
  return player ? playerData(player).autoplay : false;
}

/** Flip autoplay and return the new value. */
export function toggleAutoplay(player: Player): boolean {
  const data = playerData(player);
  data.autoplay = !data.autoplay;
  player.setData(KEY, data);
  return data.autoplay;
}

/** Take the prefetched autoplay track, clearing it so it is used once. */
export function takePreparedAutoplay(player: Player): Track | undefined {
  const data = playerData(player);
  const track = data.preparedAutoplay;
  delete data.preparedAutoplay;
  player.setData(KEY, data);
  return track;
}

// ── Requester helpers ─────────────────────────────────────────────────────────

/**
 * The requester attached to a track.
 *
 * `TrackRequester` is an empty interface in lavalink-client — it is whatever the
 * manager's `requesterTransformer` returns, so the shape is ours to assert.
 */
export function requesterOf(track: Track | UnresolvedTrack | null | undefined): Requester | undefined {
  const requester = track?.requester as Requester | undefined;
  return requester?.id ? requester : undefined;
}

/** Display name for a track's requester. Autoplay picks have none. */
export function requesterName(track: Track | UnresolvedTrack | null | undefined): string {
  return requesterOf(track)?.username ?? 'Autoplay';
}

/** A `<@id>` mention for a track's requester, or the autoplay label. */
export function requesterMention(track: Track | UnresolvedTrack | null | undefined): string {
  const requester = requesterOf(track);
  return requester ? `<@${requester.id}>` : 'Autoplay';
}
