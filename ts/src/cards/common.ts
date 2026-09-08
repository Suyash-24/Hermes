/**
 * Cards every command shares: errors and confirmations.
 *
 * These lived in `src/commands/music_cards.rs` in Rust, so `/setprefix` and
 * `/serveravatar` had to import from a music module to report a failure. They are
 * not music-specific, so they live here instead.
 *
 * Both cards now carry an accent stripe. Rust passed `None` to every container
 * and the accent was dropped by the builder anyway (`v2.rs:151-153`), so this is
 * the first time any card renders one — deliberate, not accidental.
 */
import { Colour, E } from './../components/emoji';
import { type FadeResponse, response } from './../components/v2';

/** Matches a leading custom emoji: `<:name:id>` or `<a:name:id>`. */
const LEADING_CUSTOM_EMOJI = /^<a?:\w{2,32}:\d{15,25}>/;

/**
 * Whether a message already opens with an emoji, so a second one would be noise.
 *
 * Rust tested `!first_char.is_ascii()` (`music_cards.rs:138`), which was written
 * for unicode glyphs like `⏸` and predates the custom emoji in `emoji.ts`. A
 * custom emoji starts with `<`, which *is* ASCII, so every `E.ERROR`-prefixed
 * message got a second `E.ERROR` bolted on. Both forms are recognised here.
 */
function startsWithEmoji(message: string): boolean {
  if (LEADING_CUSTOM_EMOJI.test(message)) return true;
  const first = message.codePointAt(0);
  return first !== undefined && first > 0x7f;
}

/**
 * An ephemeral error card.
 *
 * The message is used as-is when it already leads with an emoji, so callers can
 * pick a more specific one than the generic cross.
 */
export function errorCard(message: string): FadeResponse {
  const content = startsWithEmoji(message) ? message : `${E.ERROR} ${message}`;
  return response()
    .ephemeral()
    .container(Colour.DANGER, c => c.text(content));
}

/**
 * A confirmation card. The message is rendered verbatim — callers supply their
 * own leading emoji, as they did in Rust.
 */
export function successCard(message: string): FadeResponse {
  return response().container(Colour.SUCCESS, c => c.text(message));
}

/** A neutral informational card, for replies that are neither. */
export function infoCard(message: string): FadeResponse {
  return response().container(Colour.INFO, c => c.text(message));
}

/**
 * Truncate to `max` characters, appending `…`.
 *
 * Counts code points rather than UTF-16 units, so an emoji or an astral-plane
 * character is never cut in half. Rust counted `chars()`, which is the same
 * thing; a naive `slice` here would not be.
 */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, Math.max(max - 1, 0)).join('')}…`;
}
