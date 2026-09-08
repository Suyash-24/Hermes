/**
 * Voice-channel status text.
 *
 * Port of `src/music/status.rs`. `PUT /channels/{id}/voice-status` is the
 * undocumented endpoint behind the line Discord shows under a voice channel's
 * name, so there is no library wrapper for it in Seyfert (or anywhere else) and
 * the route has to be spelled out.
 *
 * It does go through `client.rest`, not a bare `fetch`: Seyfert attaches the
 * `Bot` token, applies rate-limit buckets, and retries 5xx. Rust used a fresh
 * `reqwest::Client` per call and hand-built the header via
 * `http.token().replace("Bot ", "")` — one connection pool and one auth format
 * to get wrong, both avoidable.
 */
import { useClient } from './../client';
import { describe } from './../error';
import { logger } from './../logging';

const log = logger('vcstatus');

/** Body of the voice-status PUT. `emoji_id` and `emoji_name` are exclusive. */
interface VoiceStatusBody {
  status: string;
  emoji_id: string | null;
  emoji_name: string | null;
}

/**
 * Set the status line under a voice channel. An empty `status` clears it.
 *
 * Failures are logged and swallowed, exactly as in Rust: a missing status line
 * is cosmetic, and the endpoint 403s on channels the bot cannot manage.
 */
export async function updateVoiceStatus(
  channelId: string,
  status: string,
  emoji?: { id?: string; name?: string },
): Promise<void> {
  const body: VoiceStatusBody = { status, emoji_id: null, emoji_name: null };
  if (emoji?.id) body.emoji_id = emoji.id;
  else if (emoji?.name) body.emoji_name = emoji.name;

  try {
    await useClient().rest.request('PUT', `/channels/${channelId}/voice-status`, { body });
  } catch (err) {
    log.warn(`Failed to set voice status for channel ${channelId}: ${describe(err)}`);
  }
}

/** Show a track as the channel status, with the play marker Rust used. */
export function showNowPlayingStatus(channelId: string, title: string): Promise<void> {
  return updateVoiceStatus(channelId, title, { name: '▶️' });
}

/** Clear the channel status. */
export function clearVoiceStatus(channelId: string): Promise<void> {
  return updateVoiceStatus(channelId, '');
}

/** The 24/7 idle line, shown instead of clearing when a guild stays connected. */
export function showIdleStatus(channelId: string): Promise<void> {
  return updateVoiceStatus(channelId, 'Idle - Use /play');
}
