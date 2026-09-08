/**
 * Lavalink event handlers.
 *
 * Port of `src/music/events.rs`, and much shorter than the original because most
 * of what those handlers did was advance the queue by hand:
 * `track_end_event` popped the next track and called `play_track`, and
 * `track_stuck_event` did the same again. lavalink-client does that itself when
 * `autoSkip` is on (`manager.ts`), so a `trackEnd` handler that re-implemented it
 * would fight the library for control of the queue.
 *
 * What is genuinely Fade's, and stays here:
 *
 * - the now-playing card: delete the old one, post the new one, remember its id
 * - the voice-channel status line (`▶️ {title}` / `Idle - Use /play` / cleared)
 * - the autoplay prefetch kicked off at `trackStart`
 * - the 300-second idle-leave timer, which must exempt 24/7 guilds
 *
 * The idle timer is why `onEmptyQueue.destroyAfterMs` is deliberately unset in
 * `manager.ts`: it destroys the player unconditionally, with no way to ask the
 * database whether this guild opted into staying.
 *
 * Rust's `track_end_event` also had to early-return on `Replaced`/`Stopped` and
 * `return` after autoplay so it would not fall into the queue-ended path
 * (`events.rs:35`, `:157`). Both are the library's problem now: `trackEnd` only
 * logs, and `queueEnd` fires only once autoplay has already declined to add
 * anything (`index.cjs:3353-3376`).
 */
import type { LavalinkManager, Player, Track, UnresolvedTrack } from 'lavalink-client';
import { nowPlayingCard, queueEndedCard } from './../cards/music';
import { useClient } from './../client';
import { describe } from './../error';
import { logger } from './../logging';
import { appState } from './../state';
import { prefetchAutoplay } from './autoplay';
import { lavalink } from './manager';
import { playerData, setPlayerData } from './playerData';
import { clearVoiceStatus, showIdleStatus, showNowPlayingStatus } from './status';
import { titleOf } from './track';

const log = logger('music');

/** Grace period before leaving an idle voice channel. Rust used 300 s. */
const IDLE_LEAVE_MS = 300_000;

/**
 * Pending idle-leave timers, by guild.
 *
 * Deliberately not in the player's data store: a `Timeout` is not JSON-safe, and
 * the library serialises player data when it saves a queue.
 */
const idleTimers = new Map<string, NodeJS.Timeout>();

// ── The now-playing card ──────────────────────────────────────────────────────

/** Forget the stored card without touching Discord. */
function forgetNowPlaying(player: Player): void {
  setPlayerData(player, { nowPlayingMsg: undefined, nowPlayingTrackId: undefined });
}

/**
 * Post the card for a track that just started.
 *
 * When the same track starts again — repeat-track, or a node move replaying it —
 * the existing message is edited instead of being deleted and reposted, so a
 * looped song does not push a new card into the channel every few minutes. Rust
 * always deleted and reposted.
 */
async function sendNowPlaying(player: Player, track: Track): Promise<void> {
  const channelId = player.textChannelId;
  if (!channelId) return;

  const client = useClient();
  const data = playerData(player);
  const existing = data.nowPlayingMsg;
  const card = nowPlayingCard(player, track).toMessage();

  if (existing && existing.channelId === channelId && data.nowPlayingTrackId === track.info.identifier) {
    try {
      await client.messages.edit(existing.messageId, existing.channelId, card);
      return;
    } catch (err) {
      log.debug(`Could not edit the now-playing card, reposting: ${describe(err)}`);
    }
  }

  if (existing) {
    await client.messages
      .delete(existing.messageId, existing.channelId)
      .catch(() => undefined);
    forgetNowPlaying(player);
  }

  try {
    const message = await client.messages.write(channelId, card);
    setPlayerData(player, {
      nowPlayingMsg: { channelId, messageId: message.id },
      nowPlayingTrackId: track.info.identifier,
    });
  } catch (err) {
    log.warn(`Failed to post the now-playing card in ${channelId}: ${describe(err)}`);
  }
}

/**
 * Rebuild the stored card in place, for the control buttons and `/volume` etc.
 * Silently does nothing when there is no card or nothing is playing.
 */
export async function refreshNowPlaying(player: Player): Promise<void> {
  const data = playerData(player);
  const existing = data.nowPlayingMsg;
  const track = player.queue.current;
  if (!existing || !track) return;

  try {
    await useClient().messages.edit(
      existing.messageId,
      existing.channelId,
      nowPlayingCard(player, track).toMessage(),
    );
  } catch (err) {
    log.debug(`Could not refresh the now-playing card: ${describe(err)}`);
  }
}

/** Delete the stored card, if it still exists. */
export async function deleteNowPlaying(player: Player): Promise<void> {
  const existing = playerData(player).nowPlayingMsg;
  if (!existing) return;
  forgetNowPlaying(player);
  await useClient()
    .messages.delete(existing.messageId, existing.channelId)
    .catch(() => undefined);
}

// ── Idle leave ────────────────────────────────────────────────────────────────

/** Whether this guild asked the bot to stay connected. */
function is247(guildId: string): boolean {
  return appState().db.twentyFourSeven.has(guildId);
}

/** Cancel a pending idle-leave. Call whenever playback resumes. */
export function cancelIdleLeave(guildId: string): void {
  const timer = idleTimers.get(guildId);
  if (!timer) return;
  clearTimeout(timer);
  idleTimers.delete(guildId);
}

/**
 * Leave if the guild is still idle. Every condition is re-checked, because five
 * minutes is long enough for someone to queue a song, enable 24/7, or drag the
 * bot elsewhere — the same re-checks Rust made inside its spawned task.
 */
async function leaveIfIdle(guildId: string): Promise<void> {
  idleTimers.delete(guildId);
  if (is247(guildId)) return;

  const player = lavalink().getPlayer(guildId);
  if (!player) return;
  if (player.queue.current || player.queue.tracks.length > 0) return;

  const voiceChannelId = player.voiceChannelId;
  log.info(`Leaving guild ${guildId} after ${IDLE_LEAVE_MS / 1000}s idle`);

  await deleteNowPlaying(player);
  await player.destroy('QueueEmpty').catch(err => {
    log.warn(`Failed to destroy the idle player for guild ${guildId}: ${describe(err)}`);
  });
  if (voiceChannelId) await clearVoiceStatus(voiceChannelId);

  const { db } = appState();
  if (db.activeVoiceChannels.delete(guildId)) db.save();
}

/** Start (or restart) the idle-leave countdown for a guild. */
function scheduleIdleLeave(player: Player): void {
  const guildId = player.guildId;
  cancelIdleLeave(guildId);
  const timer = setTimeout(() => {
    void leaveIfIdle(guildId).catch(err => {
      log.warn(`Idle-leave check failed for guild ${guildId}: ${describe(err)}`);
    });
  }, IDLE_LEAVE_MS);
  idleTimers.set(guildId, timer);
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/** Post the "queue ended" notice Rust's `send_queue_ended` sent. */
async function announceQueueEnded(player: Player): Promise<void> {
  const channelId = player.textChannelId;
  if (!channelId) return;
  await useClient()
    .messages.write(channelId, queueEndedCard().toMessage())
    .catch(err => log.debug(`Could not announce queue end: ${describe(err)}`));
}

/** A short `"Title by guild"` tag for log lines. */
function tag(player: Player, track?: Track | UnresolvedTrack | null): string {
  return track ? `"${titleOf(track)}" (guild ${player.guildId})` : `guild ${player.guildId}`;
}

/**
 * Attach Fade's handlers to the manager. Call once, right after `initLavalink`.
 */
export function registerMusicEvents(manager: LavalinkManager): void {
  manager.on('trackStart', (player, track) => {
    if (!track) return;
    cancelIdleLeave(player.guildId);
    log.info(`Now playing ${tag(player, track)}`);

    if (player.voiceChannelId) void showNowPlayingStatus(player.voiceChannelId, titleOf(track));
    void sendNowPlaying(player, track);
    // Resolve the next autoplay pick while this one plays, so the gap is short.
    void prefetchAutoplay(player, track).catch(err => {
      log.warn(`Autoplay prefetch failed for ${tag(player, track)}: ${describe(err)}`);
    });
  });

  manager.on('trackEnd', (player, track, payload) => {
    // The library advances the queue itself — log the reason for transparency
    log.info(`Track ended (${payload.reason}) ${tag(player, track)}`);
  });

  manager.on('queueEnd', (player, track) => {
    // Only reached once autoplay has declined to add anything.
    log.info(`Queue ended for ${tag(player, track)}`);

    const voiceChannelId = player.voiceChannelId;
    if (voiceChannelId) {
      if (is247(player.guildId)) void showIdleStatus(voiceChannelId);
      else void clearVoiceStatus(voiceChannelId);
    }
    if (!is247(player.guildId)) scheduleIdleLeave(player);

    void announceQueueEnded(player);
  });

  manager.on('trackStuck', (player, track, payload) => {
    // `autoSkip` already moved on; Rust popped the next track by hand here.
    log.warn(`Track stuck after ${payload.thresholdMs}ms, skipping ${tag(player, track)}`);
  });

  manager.on('trackError', (player, track, payload) => {
    log.error(`Track error for ${tag(player, track)}: ${payload.exception?.message ?? 'unknown'}`);
  });

  manager.on('playerDestroy', (player, reason) => {
    log.info(`Player destroyed for ${tag(player)}${reason ? ` (${reason})` : ''}`);
    cancelIdleLeave(player.guildId);
    void deleteNowPlaying(player);
    if (player.voiceChannelId) void clearVoiceStatus(player.voiceChannelId);

    const { db } = appState();
    if (db.activeVoiceChannels.delete(player.guildId)) db.save();
  });

  manager.on('playerDisconnect', (player, voiceChannelId) => {
    log.info(`Disconnected from ${voiceChannelId} in guild ${player.guildId}`);
    void clearVoiceStatus(voiceChannelId);
  });

  manager.on('playerSocketClosed', (player, payload) => {
    log.warn(
      `Voice socket closed for guild ${player.guildId}: ${payload.code} ${payload.reason}` +
        `${payload.byRemote ? ' (by Discord)' : ''}`,
    );
  });

  log.info('Lavalink event handlers registered');
}
