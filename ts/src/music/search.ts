/**
 * Track loading.
 *
 * Port of the search half of the Rust `src/music/lavalink.rs`
 * (`search_tracks` / `search_one` / `search_all` / `search_autoplay`).
 *
 * Rust decided between "this is a URL, load it" and "this is text, prefix it
 * with `ytsearch:`" by hand in all four functions. lavalink-client does the same
 * decision internally from `defaultSearchPlatform`, so what is left here is the
 * shape of the result — one track, all tracks, or the first N — plus mapping an
 * empty load onto `BotError.noResults`, which the Rust versions all did too.
 *
 * `search_autoplay`'s history filtering deliberately does not live here: it
 * filtered on `"{title} by {author}"` strings that drift between YouTube and the
 * recommendation source, which is the core of the autoplay loop. The replacement
 * dedupe is in `music/autoplay.ts`, keyed on track identity.
 */
import type { LavalinkNode, Player, SearchResult, Track } from 'lavalink-client';
import { BotError, describe } from './../error';
import type { Requester } from './playerData';

/** Anything that can run a search: a live player, or a bare node. */
export type Searcher = Player | LavalinkNode;

function nodeOf(searcher: Searcher): LavalinkNode {
  return 'queue' in searcher ? (searcher.node as LavalinkNode) : searcher;
}

/**
 * Raw load. Never throws on "no results" — callers decide whether an empty
 * result is an error, because `/play` and autoplay want different handling.
 */
export async function load(
  searcher: Searcher,
  query: string,
  requester?: Requester,
): Promise<SearchResult> {
  try {
    return await nodeOf(searcher).search({ query }, requester, false);
  } catch (err) {
    throw BotError.lavalink(describe(err));
  }
}

/** The top hit for a query. Throws `NoResults` when there is none. */
export async function searchOne(
  searcher: Searcher,
  query: string,
  requester?: Requester,
): Promise<Track> {
  const result = await load(searcher, query, requester);
  const track = result.tracks[0];
  if (!track) throw BotError.noResults(query);
  return track;
}

/** Up to `limit` hits, for a pick-a-result list. */
export async function searchMany(
  searcher: Searcher,
  query: string,
  limit: number,
  requester?: Requester,
): Promise<Track[]> {
  const result = await load(searcher, query, requester);
  const tracks = result.tracks.slice(0, Math.max(limit, 1));
  if (tracks.length === 0) throw BotError.noResults(query);
  return tracks;
}

/** What a `/play` invocation resolved to. */
export interface PlayLoad {
  tracks: Track[];
  /** Set when the query was a playlist URL. */
  playlistName?: string;
}

/**
 * Resolve a `/play` query.
 *
 * A playlist URL enqueues every track; a single URL or a text query enqueues one.
 * The Rust `search_all` did the same, though by accident — it took only
 * `hits.into_iter().next()` for the search branch. Keeping it is deliberate: a
 * text `/play` adding ten songs would surprise everyone.
 */
export async function searchForPlay(
  searcher: Searcher,
  query: string,
  requester?: Requester,
): Promise<PlayLoad> {
  const result = await load(searcher, query, requester);

  if (result.loadType === 'playlist') {
    if (result.tracks.length === 0) throw BotError.noResults(query);
    const name = result.playlist?.name;
    return name ? { tracks: result.tracks, playlistName: name } : { tracks: result.tracks };
  }

  const track = result.tracks[0];
  if (!track) throw BotError.noResults(query);
  return { tracks: [track] };
}
