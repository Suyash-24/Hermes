/**
 * Repeat-mode helpers.
 *
 * Port of the Rust `LoopMode` enum from `src/music/queue.rs`. lavalink-client
 * already has the state as `RepeatMode` (`"off" | "track" | "queue"`, on the
 * player), so only the presentation and the cycle order need porting.
 */
import type { RepeatMode } from 'lavalink-client';
import { E } from './../components/emoji';

/** Cycle order used by the `/loop` command and the loop button: off → track → queue. */
const CYCLE: Record<RepeatMode, RepeatMode> = {
  off: 'track',
  track: 'queue',
  queue: 'off',
};

const LABELS: Record<RepeatMode, string> = {
  off: 'Off',
  track: 'Track',
  queue: 'Queue',
};

const EMOJI: Record<RepeatMode, string> = {
  off: E.FORWARD,
  track: E.LOOP_ONE,
  queue: E.LOOP,
};

/** `"Off"` / `"Track"` / `"Queue"`. */
export function repeatLabel(mode: RepeatMode): string {
  return LABELS[mode];
}

/** The emoji shown next to the mode. */
export function repeatEmoji(mode: RepeatMode): string {
  return EMOJI[mode];
}

/** Emoji and label together, as the now-playing card renders it. */
export function repeatDisplay(mode: RepeatMode): string {
  return `${EMOJI[mode]} ${LABELS[mode]}`;
}

/** The next mode in the cycle. */
export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  return CYCLE[mode];
}
