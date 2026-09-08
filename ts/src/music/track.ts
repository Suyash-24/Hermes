/**
 * Track presentation helpers.
 *
 * Port of the display half of the Rust `TrackInfo` (`src/music/queue.rs`), which
 * carried its own copies of title/author/duration/artwork. lavalink-client's
 * `Track` already holds all of that, so what is left is the formatting — plus
 * tolerance for `UnresolvedTrack`.
 *
 * `player.queue.tracks` is `(Track | UnresolvedTrack)[]`, and an `UnresolvedTrack`
 * only guarantees `info.title` (`UnresolvedTrackInfo extends Partial<TrackInfo>`).
 * Rust never had that case — every queue entry was already resolved — so reading
 * `track.info.author` straight off a queue entry would be a type error here and a
 * blank field at runtime. These accessors are the one place that copes with it.
 */
import type { Track, UnresolvedTrack } from 'lavalink-client';
import { formatDurationMs } from './../components/emoji';

/** Anything that can sit in the queue. */
export type AnyTrack = Track | UnresolvedTrack;

/** Shown when a track has no artwork. Same image Rust fell back to. */
export const FALLBACK_ARTWORK = 'https://i.imgur.com/RtdAzJA.png';

/** Title. Always present, even on an unresolved track. */
export function titleOf(track: AnyTrack): string {
  return track.info.title;
}

/** Author, or a placeholder when a Spotify-style unresolved entry lacks one. */
export function authorOf(track: AnyTrack): string {
  return track.info.author || 'Unknown artist';
}

/** Duration in ms, `0` when unknown. */
export function durationOf(track: AnyTrack): number {
  return track.info.duration ?? 0;
}

/** Track URL, `undefined` when unknown. */
export function uriOf(track: AnyTrack): string | undefined {
  return track.info.uri || undefined;
}

/** Artwork URL, falling back to Fade's placeholder. */
export function artworkOf(track: AnyTrack): string {
  return track.info.artworkUrl || FALLBACK_ARTWORK;
}

/**
 * `"3:42"`, or `"LIVE"` for a stream.
 *
 * Rust's `TrackInfo::duration_display`. A live stream reports a nonsense
 * duration, so the label replaces it rather than rendering it.
 */
export function durationDisplay(track: AnyTrack): string {
  if (track.info.isStream) return 'LIVE';
  return formatDurationMs(durationOf(track));
}

/** `"Title by Author"` — the form the autoplay prompt and log lines use. */
export function labelOf(track: AnyTrack): string {
  return `${titleOf(track)} by ${authorOf(track)}`;
}

/** A markdown link to the track, or its bare title when it has no URL. */
export function linkOf(track: AnyTrack): string {
  const uri = uriOf(track);
  return uri ? `[${titleOf(track)}](${uri})` : titleOf(track);
}

/** Summed duration of a track list. Rust's `GuildQueue::queue_duration_ms`. */
export function totalDurationMs(tracks: readonly AnyTrack[]): number {
  let total = 0;
  for (const track of tracks) total += durationOf(track);
  return total;
}

/** Whether any track in the list is a live stream, which makes a total meaningless. */
export function hasStream(tracks: readonly AnyTrack[]): boolean {
  return tracks.some(track => track.info.isStream === true);
}

/**
 * Total duration of a track list, or `"LIVE"` when a stream makes the sum
 * meaningless.
 */
export function totalDurationDisplay(tracks: readonly AnyTrack[]): string {
  if (tracks.length === 0) return formatDurationMs(0);
  return hasStream(tracks) ? 'LIVE' : formatDurationMs(totalDurationMs(tracks));
}
