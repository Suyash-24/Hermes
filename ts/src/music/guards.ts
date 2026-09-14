/**
 * Shared voice-channel guard helpers for music commands.
 *
 * Every music command that mutates playback (play, skip, pause, stop, …) must
 * pass a common set of checks before touching the player:
 *
 *   1. The command is used inside a guild.
 *   2. The user is in a voice channel.
 *   3. The bot has Connect + Speak permissions in that channel.
 *   4. For commands that control an *existing* player: the user is in the
 *      *same* channel as the bot (so someone in #general-vc cannot skip a
 *      session in #gaming-vc).
 *
 * Centralising the checks here keeps every command file lean and ensures the
 * error messages are consistent across the whole bot.
 */
import type { CommandContext, ComponentContext } from 'seyfert';
import { PermissionFlagsBits } from 'seyfert/lib/types';
import { errorCard } from '../cards/common';
import { lavalink } from './manager';

// Union of the two context shapes so helpers work for both commands and buttons.
type AnyCtx = CommandContext | ComponentContext<'Button'>;

// Bits the bot needs before it can even open a voice connection.
const VOICE_PERMS =
  PermissionFlagsBits.Connect |
  PermissionFlagsBits.Speak |
  PermissionFlagsBits.ViewChannel;

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Reply with an ephemeral error card and return false — caller should `return`. */
async function fail(ctx: AnyCtx, message: string): Promise<false> {
  await ctx.editOrReply(errorCard(message).toMessage()).catch(() => undefined);
  return false;
}

/**
 * Resolve the bot's own GuildMember for the given guild, using the cache when
 * possible and falling back to a REST fetch.
 */
async function getBotMember(ctx: AnyCtx, guildId: string) {
  try {
    const cached = await ctx.client.cache.members?.get(ctx.client.botId, guildId);
    if (cached) return cached;
    return await ctx.client.members.fetch(ctx.client.botId, guildId);
  } catch {
    return undefined;
  }
}

// ── Public guards ─────────────────────────────────────────────────────────────

/**
 * Check that the user is in a voice channel and the bot has permission to join
 * it.  Returns the `channelId` on success, or `false` and an ephemeral error
 * card on failure.
 *
 * Use this **before** connecting the bot (e.g. in `/play` and `/join`).
 */
export async function requireUserVoice(
  ctx: AnyCtx,
  guildId: string,
): Promise<string | false> {
  // 1. User must be in a voice channel.
  const voiceState = await ctx.client.cache.voiceStates?.get(ctx.author.id, guildId);
  if (!voiceState?.channelId) {
    return fail(ctx, 'You need to join a voice channel first!');
  }

  const channelId = voiceState.channelId;

  // 2. Bot must have Connect + Speak + ViewChannel in that channel.
  const me = await getBotMember(ctx, guildId);
  if (me) {
    try {
      const perms = await ctx.client.channels.memberPermissions(channelId, me);
      if (!perms.has(VOICE_PERMS)) {
        const missing: string[] = [];
        if (!perms.has(PermissionFlagsBits.ViewChannel)) missing.push('View Channel');
        if (!perms.has(PermissionFlagsBits.Connect)) missing.push('Connect');
        if (!perms.has(PermissionFlagsBits.Speak)) missing.push('Speak');
        return fail(
          ctx,
          `I'm missing the following permissions in <#${channelId}>: **${missing.join(', ')}**`,
        );
      }
    } catch {
      // If permission resolution fails (e.g. channel not in cache), let
      // the connect attempt fail naturally with a Discord error instead of
      // silently blocking the user.
    }
  }

  return channelId;
}

/**
 * Check that the user is in the **same** voice channel as the currently active
 * player.  Returns `true` on success, or `false` and an ephemeral error card.
 *
 * Use this on every command that controls an *existing* player (skip, pause,
 * stop, volume, etc.).
 */
export async function requireSameVoice(
  ctx: AnyCtx,
  guildId: string,
  action = 'use this command',
): Promise<boolean> {
  const player = lavalink().getPlayer(guildId);
  if (!player) {
    return fail(ctx, 'Nothing is currently playing.');
  }

  const voiceState = await ctx.client.cache.voiceStates?.get(ctx.author.id, guildId);
  if (!voiceState?.channelId) {
    return fail(ctx, `You need to be in a voice channel to ${action}.`);
  }

  if (voiceState.channelId !== player.voiceChannelId) {
    return fail(
      ctx,
      `You must be in the same voice channel as me (<#${player.voiceChannelId}>) to ${action}.`,
    );
  }

  return true;
}

/**
 * Convenience: guards that a player exists at all.
 * Returns the player on success, or `false` + an error card.
 */
export async function requirePlayer(ctx: AnyCtx, guildId: string) {
  const player = lavalink().getPlayer(guildId);
  if (!player) {
    await fail(ctx, 'Nothing is currently playing.');
    return false as const;
  }
  return player;
}
