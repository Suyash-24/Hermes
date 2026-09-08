/**
 * Autoplay: keep the music going when the queue runs dry.
 *
 * Rewritten rather than transliterated from `src/music/autoplay.rs`, because the
 * Rust version loops between two songs forever. Four things were wrong:
 *
 * 1. **The dedupe compared different namespaces.** History held
 *    `"{title} by {author}"` from the *played YouTube* track, while
 *    `query_lastfm` filtered against Last.fm's *canonical* name/artist
 *    (`autoplay.rs:68`, `:81`). Those strings rarely match — "Blinding Lights"
 *    vs "The Weeknd - Blinding Lights (Official Video)" — so the filter passed
 *    everything.
 * 2. **Nothing checked the track that actually played.** Both the Puter and
 *    Last.fm paths filtered the *suggestion text*, then `search_one`-resolved it
 *    to a YouTube track that was never compared to history at all
 *    (`autoplay.rs:104`, `:114`). `query_puter` did not even validate its own
 *    output — history was only a prompt hint.
 * 3. **The final fallback searched `"{title} {author} mix"`** and filtered the
 *    hits on those same drifting title strings (`lavalink.rs:124`), so a
 *    two-song ping-pong was the expected outcome, not an edge case.
 * 4. **History was capped at 15 titles** and only appended on queue transitions,
 *    so it was often empty exactly when it mattered.
 *
 * The replacement rule is simple: **dedupe on the resolved track, by identity.**
 * A candidate is only accepted after Lavalink has resolved it to a real track
 * and that track's identifier, URI, and normalised title all miss the recent-play
 * set. `queue.previous` (25 entries, maintained by lavalink-client) is the
 * source of truth, seeded with whatever is playing right now.
 */
import type { Player, Track, TrackInfo } from 'lavalink-client';
import { describe } from './../error';
import { logger } from './../logging';
import { appState } from './../state';
import { playerData, setPlayerData, takePreparedAutoplay } from './playerData';
import { load } from './search';

const log = logger('autoplay');

const PUTER_URL = 'https://api.puter.com/puterai/openai/v1/chat/completions';
const PUTER_MODEL = 'gpt-4o-mini';
const PUTER_TIMEOUT_MS = 8_000;

const LASTFM_URL = 'http://ws.audioscrobbler.com/2.0/';
const LASTFM_LIMIT = 15;
const LASTFM_TIMEOUT_MS = 5_000;

/** How many recent plays to name in the Puter prompt. */
const PROMPT_HISTORY = 12;
/** How many hits of a fallback search to consider before giving up on it. */
const FALLBACK_SCAN = 12;

// ── Track identity ────────────────────────────────────────────────────────────

/**
 * Strip the noise YouTube titles carry so that two uploads of one song collapse
 * to the same string: bracketed suffixes, "official video", featured artists,
 * punctuation, and repeated whitespace.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ')
    .replace(/\b(official|officiel|lyrics?|lyric|audio|video|visualizer|hd|hq|4k|mv|m\/v)\b/g, ' ')
    .replace(/\b(feat|ft|featuring|with|prod|prod\.by|remaster(ed)?)\b.*$/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** The song-level key: normalised title plus normalised artist. */
function songKey(title: string, author: string): string {
  return `${normalise(title)}::${normalise(author)}`;
}

/** Every key a track should be recognised by. */
function keysOf(info: TrackInfo): string[] {
  const keys = [songKey(info.title, info.author)];
  if (info.identifier) keys.push(`id:${info.identifier.toLowerCase()}`);
  if (info.uri) keys.push(`uri:${info.uri.toLowerCase()}`);
  // Title-only, to catch a cover or re-upload credited to a different channel.
  const title = normalise(info.title);
  if (title) keys.push(`t:${title}`);
  return keys;
}

/** What has been played recently, in both machine and human form. */
interface RecentPlays {
  /** Identity keys of every recent track. */
  keys: Set<string>;
  /** `"Title by Author"`, newest first, for the recommendation prompt. */
  labels: string[];
}

/**
 * Collect the recent-play set.
 *
 * `queue.previous` is maintained by lavalink-client and bounded by
 * `maxPreviousTracks` (25, set in `music/manager.ts`). Whatever is playing now is
 * folded in explicitly — at prefetch time it is `queue.current` and has not
 * reached `previous` yet, which is exactly when the old code let it through.
 */
function collectRecent(player: Player, ...extra: (Track | null | undefined)[]): RecentPlays {
  const keys = new Set<string>();
  const labels: string[] = [];

  const seen = [...extra, player.queue.current, ...player.queue.previous];
  for (const track of seen) {
    if (!track?.info) continue;
    for (const key of keysOf(track.info)) keys.add(key);
    const label = `${track.info.title} by ${track.info.author}`;
    if (!labels.includes(label)) labels.push(label);
  }

  return { keys, labels };
}

/** Whether a resolved track has been played recently. */
function isRecent(track: Track, recent: RecentPlays): boolean {
  return keysOf(track.info).some(key => recent.keys.has(key));
}

// ── Recommendation sources ────────────────────────────────────────────────────

/** JSON `fetch` with a deadline. Rust had none, so a hung proxy stalled playback. */
async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Record<string, unknown> | undefined> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      log.warn(`${new URL(url).host} returned HTTP ${res.status}`);
      return undefined;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    log.warn(`Request to ${new URL(url).host} failed: ${describe(err)}`);
    return undefined;
  }
}

/** Walk a parsed JSON body by key path, returning a string leaf if there is one. */
function pickString(source: unknown, path: (string | number)[]): string | undefined {
  let node: unknown = source;
  for (const step of path) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string | number, unknown>)[step];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Ask the Puter AI proxy for one related song, as `"Title by Artist"`.
 *
 * The prompt is Rust's verbatim, including the do-not-repeat list — it is a
 * useful hint, but the answer is still validated after resolution, which is the
 * part Rust skipped.
 */
async function queryPuter(
  title: string,
  author: string,
  recent: RecentPlays,
  token: string,
): Promise<string | undefined> {
  const avoid = recent.labels.slice(0, PROMPT_HISTORY);
  const avoidClause = avoid.length
    ? ` Do NOT recommend any of these recently played tracks: ${avoid.map(l => `'${l}'`).join(', ')}.`
    : '';

  const body = {
    model: PUTER_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are a music recommendation engine. Given a track, output EXACTLY ONE related song ' +
          `in the format 'Title by Artist'. Avoid recommending a song by the exact same artist if possible.${avoidClause} ` +
          'Do not output any other text, quotes, or markdown.',
      },
      { role: 'user', content: `Suggest a song similar to '${title}' by '${author}'.` },
    ],
  };

  const json = await fetchJson(
    PUTER_URL,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    PUTER_TIMEOUT_MS,
  );

  const content = pickString(json, ['choices', 0, 'message', 'content']);
  return content?.trim() || undefined;
}

/**
 * Last.fm `track.getsimilar`, as an ordered candidate list.
 *
 * Rust returned a single string and dropped the other 14 suggestions, so one
 * unlucky pick meant falling through to the mix search. Returning the whole list
 * lets the caller keep trying, and pre-filtering on the song key means a
 * suggestion that is obviously a repeat never costs a Lavalink round trip.
 * Same-artist suggestions are sorted last rather than skipped, which is Rust's
 * two-pass preference expressed as one pass.
 */
async function queryLastfm(
  title: string,
  author: string,
  recent: RecentPlays,
  apiKey: string,
): Promise<string[]> {
  const params = new URLSearchParams({
    method: 'track.getsimilar',
    artist: author,
    track: title,
    api_key: apiKey,
    format: 'json',
    limit: String(LASTFM_LIMIT),
  });

  const json = await fetchJson(`${LASTFM_URL}?${params}`, {}, LASTFM_TIMEOUT_MS);
  const similar = (json as { similartracks?: { track?: unknown } } | undefined)?.similartracks?.track;
  if (!Array.isArray(similar)) return [];

  const sameArtist: string[] = [];
  const otherArtist: string[] = [];

  for (const entry of similar) {
    const name = pickString(entry, ['name']);
    const artist = pickString(entry, ['artist', 'name']);
    if (!name || !artist) continue;
    if (recent.keys.has(songKey(name, artist)) || recent.keys.has(`t:${normalise(name)}`)) continue;
    const candidate = `${name} by ${artist}`;
    if (normalise(artist) === normalise(author)) sameArtist.push(candidate);
    else otherArtist.push(candidate);
  }

  return [...otherArtist, ...sameArtist];
}

// ── Resolution ────────────────────────────────────────────────────────────────

/**
 * Resolve a query and return the first hit that has not been played recently.
 *
 * This is the fix. Every candidate — whoever suggested it — has to survive being
 * turned into a real Lavalink track and then checked. Scanning past the first hit
 * also means a repeat at the top of the results costs nothing.
 */
async function firstFreshHit(
  player: Player,
  query: string,
  recent: RecentPlays,
  scan = FALLBACK_SCAN,
): Promise<Track | undefined> {
  const result = await load(player, query).catch(err => {
    log.warn(`Autoplay search for "${query}" failed: ${describe(err)}`);
    return undefined;
  });
  if (!result) return undefined;

  for (const track of result.tracks.slice(0, scan)) {
    if (!isRecent(track, recent)) return track;
  }
  return undefined;
}

/**
 * Find something to play next.
 *
 * Order matches Rust — Puter, then Last.fm, then a YouTube mix search — so the
 * character of the recommendations is unchanged. What differs is that each step
 * validates the resolved track, Last.fm gets to offer more than one suggestion,
 * and there is an artist-radio query behind the mix query to widen the pool when
 * a small result set has been exhausted.
 */
export async function findAutoplayTrack(
  player: Player,
  seed: Track,
  recent = collectRecent(player, seed),
): Promise<Track | undefined> {
  const { title, author } = seed.info;
  const state = appState();

  if (state.puterAuthToken) {
    const suggestion = await queryPuter(title, author, recent, state.puterAuthToken);
    if (suggestion) {
      const track = await firstFreshHit(player, suggestion, recent, 5);
      if (track) {
        log.info(`Autoplay picked "${track.info.title}" from Puter (seed: "${title}")`);
        return track;
      }
    }
  }

  if (state.lastfmApiKey) {
    const candidates = await queryLastfm(title, author, recent, state.lastfmApiKey);
    for (const candidate of candidates.slice(0, 5)) {
      const track = await firstFreshHit(player, candidate, recent, 5);
      if (track) {
        log.info(`Autoplay picked "${track.info.title}" from Last.fm (seed: "${title}")`);
        return track;
      }
    }
  }

  for (const query of [`${title} ${author} mix`, `${author} radio`, `${author} similar songs`]) {
    const track = await firstFreshHit(player, query, recent);
    if (track) {
      log.info(`Autoplay picked "${track.info.title}" from search "${query}"`);
      return track;
    }
  }

  log.warn(`Autoplay found nothing fresh for "${title}" by "${author}"`);
  return undefined;
}

// ── Entry points ──────────────────────────────────────────────────────────────

/**
 * Resolve the next autoplay track while the current one is still playing, so the
 * gap between songs stays short. Called from `trackStart` in `music/events.ts`,
 * mirroring Rust's `track_start_event` prefetch.
 *
 * The result is discarded if the user queued something in the meantime — the same
 * check Rust made at `events.rs:364`, and the reason `push`/`push_front` cleared
 * `prepared_autoplay_track`.
 */
export async function prefetchAutoplay(player: Player, seed: Track): Promise<void> {
  const data = playerData(player);
  if (!data.autoplay || data.prefetching || data.preparedAutoplay) return;
  if (player.queue.tracks.length > 0) return;

  setPlayerData(player, { prefetching: true });
  try {
    const track = await findAutoplayTrack(player, seed);
    if (!track) return;
    // Re-check: the search took seconds, and a queued track wins.
    if (player.queue.tracks.length > 0) return;
    setPlayerData(player, { preparedAutoplay: track });
    log.info(`Prefetched "${track.info.title}" for guild ${player.guildId}`);
  } finally {
    setPlayerData(player, { prefetching: false });
  }
}

/**
 * lavalink-client's `onEmptyQueue` hook: adding a track here makes the library
 * play it, and doing nothing lets `queueEnd` fire. This replaces the inline
 * autoplay branch of Rust's `track_end_event` — including the `return` at
 * `events.rs:157` that stopped it falling into the queue-ended path.
 */
export async function autoPlayFunction(player: Player, lastPlayedTrack: Track): Promise<void> {
  if (!playerData(player).autoplay) return;

  const recent = collectRecent(player, lastPlayedTrack);

  const prepared = takePreparedAutoplay(player);
  if (prepared) {
    if (!isRecent(prepared, recent)) {
      await player.queue.add(prepared);
      return;
    }
    log.info(`Discarded stale prefetch "${prepared.info.title}" — played too recently`);
  }

  const track = await findAutoplayTrack(player, lastPlayedTrack, recent);
  if (track) await player.queue.add(track);
}
