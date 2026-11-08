/**
 * `/music lyrics` — fetch lyrics for the current track or an arbitrary query.
 *
 * Provider chain (most accurate → fallback):
 *   1. **LRCLIB** — free, no API key, returns plain text *and* synced
 *      (timed) lines. Searched by `artist_name + track_name` from the live
 *      Lavalink player, or by the user's raw query string.
 *   2. **lyrics.ovh** — legacy fallback; kept for songs LRCLIB doesn't have.
 *
 * Synced lyrics (LRC format) are reformatted into clean `mm:ss › line`
 * blocks so they look good inside a Components V2 card without needing any
 * special Discord renderer. Plain lyrics are rendered as-is with a 1 800-char
 * soft cap (the rest is noted as truncated).
 *
 * Port rationale: lyrics.ovh is unreliable and returns no timestamps.
 * LRCLIB (<https://lrclib.net>) is maintained, open-source, and covers most
 * modern and classic tracks.
 */
import { Declare, Options, SubCommand, createStringOption, type CommandContext } from 'seyfert';
import { lavalink } from '../../music/manager';
import { errorCard, truncate } from '../../cards/common';
import { Colour, E, header, hint } from '../../components/emoji';
import { FadeResponse } from '../../components/v2';

// ── LRCLIB types ──────────────────────────────────────────────────────────────

interface LrclibResult {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

// ── Synced lyrics parser ──────────────────────────────────────────────────────

/**
 * Parse an LRC string (`[mm:ss.xx] Line text`) into a human-readable block.
 *
 * Discord doesn't render LRC natively, so we convert each timestamped line
 * into `mm:ss › text`. Blank lines and purely instrumental markers are dropped.
 * We also collapse runs of blank display lines so the card doesn't feel sparse.
 */
function formatSyncedLyrics(lrc: string): string {
  const LRC_LINE = /^\[(\d{1,2}):(\d{2})(?:\.\d+)?\]\s*(.*)/;
  const lines: string[] = [];

  for (const raw of lrc.split('\n')) {
    const m = raw.match(LRC_LINE);
    if (!m) continue;
    const mins = m[1]!;
    const secs = m[2]!;
    const text = m[3]!.trim();
    if (!text) continue; // skip blank timestamped lines
    lines.push(`\`${mins}:${secs}\` ${text}`);
  }

  return lines.join('\n');
}

// ── LRCLIB search ─────────────────────────────────────────────────────────────

/** Structured search (best for now-playing where we know artist + title). */
async function lrclibGet(artist: string, title: string): Promise<LrclibResult | null> {
  const url = new URL('https://lrclib.net/api/get');
  url.searchParams.set('artist_name', artist);
  url.searchParams.set('track_name', title);

  try {
    const res = await fetch(url, { headers: { 'Lrclib-Client': 'Fade Discord Bot' } });
    if (!res.ok) return null;
    return (await res.json()) as LrclibResult;
  } catch {
    return null;
  }
}

/** Free-text search — used when the user provides a raw query string. */
async function lrclibSearch(query: string): Promise<LrclibResult | null> {
  const url = new URL('https://lrclib.net/api/search');
  url.searchParams.set('q', query);

  try {
    const res = await fetch(url, { headers: { 'Lrclib-Client': 'Fade Discord Bot' } });
    if (!res.ok) return null;
    const results = (await res.json()) as LrclibResult[];
    return results[0] ?? null;
  } catch {
    return null;
  }
}

// ── lyrics.ovh fallback ───────────────────────────────────────────────────────

async function lyricsOvhFallback(artist: string, title: string): Promise<string | null> {
  if (!artist || !title) return null;
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    return typeof data.lyrics === 'string' && data.lyrics ? data.lyrics : null;
  } catch {
    return null;
  }
}

// ── Command ───────────────────────────────────────────────────────────────────

const options = {
  query: createStringOption({
    description: 'Song to look up (e.g. "Artist - Title"). Defaults to the current track.',
    required: false,
  }),
};

@Declare({
  name: 'lyrics',
  description: 'Fetch lyrics for the current track or any song.',
})
@Options(options)
export default class LyricsCommand extends SubCommand {
  override async run(ctx: CommandContext<typeof options>) {
    await ctx.deferReply();

    let artist = '';
    let title = '';
    let searchLabel = '';

    const rawQuery = ctx.options.query?.trim() ?? '';

    if (rawQuery) {
      // User provided a query — split on " - " if possible.
      const parts = rawQuery.split(' - ');
      if (parts.length >= 2) {
        artist = parts[0]!.trim();
        title = parts.slice(1).join(' - ').trim();
      } else {
        title = rawQuery;
      }
      searchLabel = rawQuery;
    } else {
      // Pull from the live player.
      const player = lavalink().getPlayer(ctx.guildId!);
      const current = player?.queue.current;
      if (!current) {
        await ctx.editOrReply(errorCard('Nothing is playing and no query was provided.').toMessage());
        return;
      }
      artist = current.info.author;
      title = current.info.title;
      searchLabel = artist ? `${artist} — ${title}` : title;
    }

    // ── 1. LRCLIB structured lookup ───────────────────────────────────────────
    let lrclibResult: LrclibResult | null = null;

    if (artist && title) {
      lrclibResult = await lrclibGet(artist, title);
    }

    // ── 2. LRCLIB free-text search (raw query or if structured miss) ──────────
    if (!lrclibResult) {
      lrclibResult = await lrclibSearch(rawQuery || `${artist} ${title}`);
    }

    // ── 3. Build lyrics display from LRCLIB result ───────────────────────────
    let lyricsDisplay: string | null = null;
    let providerHint = '';
    let isSynced = false;

    if (lrclibResult) {
      if (lrclibResult.instrumental) {
        await ctx.editOrReply(
          errorCard(`${E.NOTES} **${truncate(lrclibResult.trackName, 50)}** is an instrumental track — no lyrics available.`).toMessage(),
        );
        return;
      }

      if (lrclibResult.syncedLyrics) {
        lyricsDisplay = formatSyncedLyrics(lrclibResult.syncedLyrics);
        isSynced = true;
        providerHint = 'LRCLIB · synced';
        // Use the canonical names from LRCLIB if the user gave a free query.
        if (!searchLabel) {
          searchLabel = `${lrclibResult.artistName} — ${lrclibResult.trackName}`;
        }
      } else if (lrclibResult.plainLyrics) {
        lyricsDisplay = lrclibResult.plainLyrics;
        providerHint = 'LRCLIB';
        if (!searchLabel) {
          searchLabel = `${lrclibResult.artistName} — ${lrclibResult.trackName}`;
        }
      }
    }

    // ── 4. lyrics.ovh fallback ────────────────────────────────────────────────
    if (!lyricsDisplay && artist) {
      lyricsDisplay = await lyricsOvhFallback(artist, title);
      if (lyricsDisplay) providerHint = 'lyrics.ovh (fallback)';
    }

    if (!lyricsDisplay) {
      await ctx.editOrReply(
        errorCard(`No lyrics found for **${truncate(searchLabel || title, 60)}**.`).toMessage(),
      );
      return;
    }

    // ── 5. Soft-cap at 1 800 chars (Discord component text limit is 4 096) ───
    const HARD_CAP = 1_800;
    let truncated = false;
    if (lyricsDisplay.length > HARD_CAP) {
      lyricsDisplay = lyricsDisplay.slice(0, HARD_CAP);
      // Avoid cutting mid-line.
      const lastNl = lyricsDisplay.lastIndexOf('\n');
      if (lastNl > 0) lyricsDisplay = lyricsDisplay.slice(0, lastNl);
      lyricsDisplay += `\n…`;
      truncated = true;
    }

    // ── 6. Build the card ─────────────────────────────────────────────────────
    const footerParts: string[] = [`Source: ${providerHint}`];
    if (isSynced) footerParts.push('timestamps shown');
    if (truncated) footerParts.push('truncated');

    const card = new FadeResponse().container(Colour.LYRICS, (c) =>
      c
        .text(header(E.LYRICS, truncate(searchLabel, 60)))
        .separator(true)
        .text(lyricsDisplay!)
        .separator(false)
        .text(hint(footerParts.join(' · '))),
    );

    await ctx.editOrReply(card.toMessage());
  }
}
