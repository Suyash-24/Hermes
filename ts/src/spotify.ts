/**
 * Spotify Web API client.
 *
 * Port of the Rust `src/spotify.rs`. Only what Fade actually needs: a cached
 * access token from the refresh-token grant, and playlist → search-query
 * expansion so Lavalink can resolve each track on YouTube.
 *
 * Uses Node's global `fetch`, so there is no HTTP dependency.
 */
import { BotError, describe } from './error';
import { logger } from './logging';

const log = logger('spotify');

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';
/** Expire the cached token a minute early so it never dies mid-request. */
const EXPIRY_SKEW_SECS = 60;
const PAGE_LIMIT = 100;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface SpotifyArtist {
  name?: string;
}

interface SpotifyTrack {
  name?: string;
  artists?: SpotifyArtist[];
}

interface PlaylistItem {
  track?: SpotifyTrack | null;
  item?: SpotifyTrack | null;
}

interface PlaylistTracksResponse {
  items?: PlaylistItem[];
  next?: string | null;
}

export class SpotifyClient {
  private cachedToken?: { token: string; expiresAt: number };
  /** In-flight refresh shared by concurrent callers. */
  private refreshing?: Promise<string>;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly refreshToken: string,
  ) {}

  /**
   * A valid access token, refreshing when the cache is cold or stale.
   *
   * Rust serialised refreshes behind a `Mutex`; the single-threaded equivalent
   * is one shared promise, which keeps a burst of callers to one HTTP request.
   */
  private async getAccessToken(): Promise<string> {
    const cached = this.cachedToken;
    if (cached && Date.now() < cached.expiresAt) return cached.token;

    this.refreshing ??= this.refreshAccessToken().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async refreshAccessToken(): Promise<string> {
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    let res: Response;
    try {
      res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          authorization: `Basic ${basic}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      });
    } catch (err) {
      throw BotError.http(err);
    }

    const text = await res.text();
    let parsed: TokenResponse;
    try {
      parsed = JSON.parse(text) as TokenResponse;
    } catch (err) {
      // Deliberately does not log `text` — it can echo back credentials.
      log.error(`Failed to decode Spotify token response (status ${res.status})`);
      throw BotError.custom(`Failed to decode token response: ${describe(err)}`);
    }

    if (!parsed.access_token) {
      log.error(`Spotify token request failed (status ${res.status})`);
      throw BotError.custom('Spotify token response had no access_token');
    }

    const lifetime = Math.max((parsed.expires_in ?? 3600) - EXPIRY_SKEW_SECS, 0);
    this.cachedToken = { token: parsed.access_token, expiresAt: Date.now() + lifetime * 1000 };
    return parsed.access_token;
  }

  /**
   * `"Artist - Title"` search strings for every track in a playlist, capped at
   * `maxTracks` so a 5,000-track playlist cannot stall the command.
   */
  async getPlaylistSearchQueries(playlistId: string, maxTracks: number): Promise<string[]> {
    const token = await this.getAccessToken();
    const queries: string[] = [];
    let offset = 0;

    while (queries.length < maxTracks) {
      const url = `${API_BASE}/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${PAGE_LIMIT}&offset=${offset}`;

      let res: Response;
      try {
        res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      } catch (err) {
        throw BotError.http(err);
      }

      const text = await res.text();
      let page: PlaylistTracksResponse;
      try {
        page = JSON.parse(text) as PlaylistTracksResponse;
      } catch (err) {
        log.error(`Failed to decode Spotify playlist response (status ${res.status})`);
        throw BotError.custom(`Failed to decode playlist response: ${describe(err)}`);
      }

      const items = page.items ?? [];
      for (const entry of items) {
        if (queries.length >= maxTracks) break;
        // Rust preferred `item` over `track`; keep that order.
        const track = entry.item ?? entry.track;
        if (!track?.name) continue;
        const artist = track.artists?.[0]?.name ?? '';
        queries.push(`${artist} - ${track.name}`);
      }

      if (!page.next || items.length === 0) break;
      offset += PAGE_LIMIT;
    }

    return queries;
  }
}

/** Extract the playlist ID from a Spotify playlist URL, if it is one. */
export function extractPlaylistId(url: string): string | undefined {
  if (!url.includes('spotify.com/playlist/')) return undefined;
  const after = url.split('playlist/')[1];
  if (!after) return undefined;
  const id = after.split(/[?#/]/)[0];
  return id && id.length > 0 ? id : undefined;
}
