/**
 * Music cards.
 *
 * Port of `src/commands/music_cards.rs` — the Components V2 messages behind
 * `/play`, `/nowplaying`, `/queue`, and the control buttons.
 *
 * Two shape changes from Rust:
 *
 * 1. **The state-heavy cards take the `Player`, not seven positional arguments.**
 *    `build_now_playing_card(track, position_ms, loop_mode, is_shuffled, volume,
 *    queue_len, is_paused)` had every call site re-derive the same seven values
 *    out of the guild queue, and `build_queue_card` also wanted a pre-computed
 *    `total_pages`. All of it now comes off the player.
 * 2. **Accents are set.** Rust passed `None` to every container, and the builder
 *    discarded the argument anyway (`v2.rs:151-153`), so no card ever rendered a
 *    stripe. The palette in `emoji.ts` exists for this, so the music family is
 *    violet and the queue is blue.
 *
 * Copy is otherwise kept verbatim, minus one fix: the now-playing status line
 * printed `E::LOOP` and `E::SHUFFLE` in front of labels that already began with
 * their own emoji (`music_cards.rs:75-80`), so it rendered "🔁 ➡️ Off  🔀 🔀 Off".
 */
import type { Player } from 'lavalink-client';
import {
  Colour,
  E,
  formatDurationMs,
  header,
  hint,
  progressBar,
} from './../components/emoji';
import { ButtonStyle, type FadeResponse, response } from './../components/v2';
import { playerData, requesterName } from './../music/playerData';
import { repeatDisplay, repeatLabel } from './../music/repeat';
import {
  type AnyTrack,
  artworkOf,
  authorOf,
  durationDisplay,
  durationOf,
  totalDurationDisplay,
} from './../music/track';
import { truncate } from './common';

/** Width of the now-playing progress bar, in characters. Rust used 16. */
const PROGRESS_WIDTH = 16;

/** Queue entries per page. Rust's `build_queue_card::PAGE_SIZE`. */
export const QUEUE_PAGE_SIZE = 8;

/**
 * Control-button ids, kept byte-identical to Rust so a card posted before the
 * migration still routes after it. Shared with the interaction handler, which is
 * why they are constants and not literals in the builder below.
 */
export const MUSIC_BUTTON = {
  prev: 'music_prev',
  pause: 'music_pause',
  skip: 'music_skip',
  stop: 'music_stop',
  shuffle: 'music_shuffle',
  loop: 'music_loop',
  volDown: 'music_vol_down',
  volUp: 'music_vol_up',
} as const;

// ── Queue pagination ids ──────────────────────────────────────────────────────

/**
 * Prefix of the queue paging buttons.
 *
 * Rust emitted two different shapes — `queue_prev_{page}` and
 * `queue_next_{page + 2}` (`music_cards.rs:223`, `:233`) — which only agreed
 * because both happened to encode the *1-based* target page while `page` itself
 * was 0-based. One prefix carrying the 0-based target is the same information
 * without the arithmetic puzzle.
 */
const QUEUE_PAGE_PREFIX = 'queue_page_';

/** Custom id for a button that jumps to `page` (0-based). */
export function queuePageId(page: number): string {
  return `${QUEUE_PAGE_PREFIX}${Math.max(page, 0)}`;
}

/** The 0-based page a queue button targets, or `undefined` if it is not one. */
export function parseQueuePageId(customId: string): number | undefined {
  if (!customId.startsWith(QUEUE_PAGE_PREFIX)) return undefined;
  const page = Number(customId.slice(QUEUE_PAGE_PREFIX.length));
  return Number.isSafeInteger(page) && page >= 0 ? page : undefined;
}

/** How many pages the current queue needs. Always at least one. */
export function queuePageCount(trackCount: number): number {
  return Math.max(Math.ceil(trackCount / QUEUE_PAGE_SIZE), 1);
}

// ── Now playing ───────────────────────────────────────────────────────────────

/**
 * The progress bar line.
 *
 * A live stream reports a meaningless duration, so it gets elapsed time instead
 * of a bar that would sit at a random fill level — Rust drew the bar regardless
 * (`music_cards.rs:21-30`).
 */
function progressLine(track: AnyTrack, positionMs: number): string {
  const duration = durationOf(track);
  if (track.info.isStream || duration <= 0) {
    return `${E.WAVE} \`LIVE ${E.DOT} ${formatDurationMs(positionMs)} elapsed\``;
  }
  const bar = progressBar(positionMs / duration, PROGRESS_WIDTH);
  return `${bar} \`${formatDurationMs(positionMs)} / ${formatDurationMs(duration)}\``;
}

/**
 * The full now-playing card with control buttons.
 *
 * Everything except the track is read off the player, so a button handler can
 * rebuild the card after mutating state without threading seven values through.
 */
export function nowPlayingCard(player: Player, track: AnyTrack): FadeResponse {
  const paused = player.paused;
  const volume = Math.round(player.volume);
  const queueLen = player.queue.tracks.length;
  const shuffle = playerData(player).shuffle ? 'On' : 'Off';
  const duration = durationDisplay(track);

  return response().container(Colour.MUSIC, c =>
    c
      .section(s =>
        s
          .text(header(E.MUSIC, 'Now Playing'))
          .text(
            `**${truncate(track.info.title, 50)}**\n` +
              `${authorOf(track)} ${E.DOT} ${E.DURATION} \`${duration}\``,
          )
          .text(hint(`Requested by ${requesterName(track)} ${E.PIPE} ${queueLen} in queue`))
          .thumbnail(artworkOf(track)),
      )
      .separator(true)
      .text(progressLine(track, player.position))
      .text(
        `${repeatDisplay(player.repeatMode)} ${E.DOT} ` +
          `${E.SHUFFLE} ${shuffle} ${E.DOT} ` +
          `${E.VOLUME_UP} \`${volume}%\``,
      )
      .separator(true)
      .actionRow(r =>
        r
          .buttonEmoji(MUSIC_BUTTON.prev, 'Prev', ButtonStyle.Secondary, E.PREV)
          .buttonEmoji(
            MUSIC_BUTTON.pause,
            paused ? 'Resume' : 'Pause',
            ButtonStyle.Primary,
            paused ? E.PLAYING : E.PAUSED,
          )
          .buttonEmoji(MUSIC_BUTTON.skip, 'Skip', ButtonStyle.Secondary, E.SKIP)
          .buttonEmoji(MUSIC_BUTTON.stop, 'Stop', ButtonStyle.Danger, E.STOPPED),
      )
      .actionRow(r =>
        r
          .buttonEmoji(MUSIC_BUTTON.shuffle, 'Shuffle', ButtonStyle.Secondary, E.SHUFFLE)
          .buttonEmoji(MUSIC_BUTTON.loop, 'Loop', ButtonStyle.Secondary, E.LOOP)
          .buttonEmoji(MUSIC_BUTTON.volDown, '-10', ButtonStyle.Secondary, E.VOLUME_DOWN)
          .buttonEmoji(MUSIC_BUTTON.volUp, '+10', ButtonStyle.Secondary, E.VOLUME_UP),
      ),
  );
}

// ── Enqueue confirmations ─────────────────────────────────────────────────────

/** The compact "added to queue" card. `position` is 1-based, as Rust printed it. */
export function queuedCard(track: AnyTrack, position: number): FadeResponse {
  return response().container(Colour.FADE, c =>
    c.section(s =>
      s
        .text(`${E.NOTES} **Added to Queue**`)
        .text(
          `**${truncate(track.info.title, 50)}**\n` +
            `${authorOf(track)} ${E.DOT} ${E.DURATION} \`${durationDisplay(track)}\``,
        )
        .text(hint(`Position #${position} in queue`))
        .thumbnail(artworkOf(track)),
    ),
  );
}

/**
 * The playlist confirmation card.
 *
 * Rust took only the track list and never printed the playlist's name even
 * though `search_all` had it in hand; passing it through is free here.
 */
export function playlistQueuedCard(tracks: readonly AnyTrack[], name?: string): FadeResponse {
  const title = name ? `**${truncate(name, 60)}**` : '**Playlist Added**';
  return response().container(Colour.FADE, c =>
    c.text(
      `${E.DISC} ${title} — ${tracks.length} tracks ` +
        `${E.PIPE} \`${totalDurationDisplay(tracks)}\``,
    ),
  );
}

// ── Queue ─────────────────────────────────────────────────────────────────────

/**
 * The paginated queue card.
 *
 * `page` is 0-based and clamped, so a stale button on a queue that has since
 * shrunk lands on the last page instead of rendering an empty one — Rust trusted
 * the number in the custom id.
 */
export function queueCard(player: Player, page = 0): FadeResponse {
  const tracks = player.queue.tracks;
  const totalPages = queuePageCount(tracks.length);
  const current = Math.min(Math.max(page, 0), totalPages - 1);
  const start = current * QUEUE_PAGE_SIZE;

  const lines: string[] = [];
  const playing = player.queue.current;
  if (playing) {
    lines.push(
      `${E.PLAYING} **${truncate(playing.info.title, 45)}** — ${authorOf(playing)}\n` +
        hint(`${E.DURATION} ${durationDisplay(playing)}`),
    );
  }

  for (const [index, track] of tracks.slice(start, start + QUEUE_PAGE_SIZE).entries()) {
    lines.push(
      `${start + index + 1}. **${truncate(track.info.title, 40)}** — ` +
        `${authorOf(track)}  \`${durationDisplay(track)}\``,
    );
  }

  const body = lines.length > 0 ? lines.join('\n') : `${E.QUEUE} Queue is empty`;
  const footer =
    `${E.LOOP} Loop: ${repeatLabel(player.repeatMode)} ${E.DOT} ` +
    `Shuffle: ${playerData(player).shuffle ? 'On' : 'Off'} ${E.DOT} ` +
    `Vol: ${Math.round(player.volume)}% ${E.PIPE} ` +
    `Total: ${totalDurationDisplay(tracks)}`;

  return response().container(Colour.QUEUE, c => {
    c.text(header(E.QUEUE, `Queue  ${E.PIPE} Page ${current + 1}/${totalPages}`))
      .separator(true)
      .text(body)
      .separator(true)
      .text(hint(footer));

    if (totalPages > 1) {
      c.actionRow(r => {
        if (current > 0) {
          r.buttonEmoji(queuePageId(current - 1), 'Prev', ButtonStyle.Secondary, E.BACK);
        } else {
          r.buttonDisabled('Prev', ButtonStyle.Secondary);
        }
        if (current + 1 < totalPages) {
          r.buttonEmoji(queuePageId(current + 1), 'Next', ButtonStyle.Secondary, E.FORWARD);
        } else {
          r.buttonDisabled('Next', ButtonStyle.Secondary);
        }
      });
    }
  });
}

/** The "queue ended" notice `music/events.ts` posts when nothing is left. */
export function queueEndedCard(): FadeResponse {
  return response().container(Colour.MIST, c =>
    c.text(`${E.STOPPED} Queue ended — nothing left to play.`),
  );
}
