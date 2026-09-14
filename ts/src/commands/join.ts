import { Declare, Command, type CommandContext } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';
import { requireUserVoice } from '../music/guards';

@Declare({
  name: 'join',
  description: 'Make the bot join your voice channel.',
})
export default class JoinCommand extends Command {
  override async run(ctx: CommandContext) {
    if (!ctx.guildId) {
      await ctx.editOrReply(errorCard('This command can only be used in a server.').toMessage());
      return;
    }

    // Guard: user must be in a VC and bot must have Connect/Speak perms.
    const channelId = await requireUserVoice(ctx, ctx.guildId);
    if (!channelId) return;

    let player = lavalink().getPlayer(ctx.guildId);

    if (player) {
      // Already in the same channel — nothing to do.
      if (player.voiceChannelId === channelId) {
        await ctx.editOrReply(errorCard('I am already in your voice channel.').toMessage());
        return;
      }

      // Playing music somewhere else — refuse to interrupt.
      if (player.playing || player.paused) {
        await ctx.editOrReply(
          errorCard(
            `I'm currently playing music in <#${player.voiceChannelId}>. ` +
              `Join that channel or wait until the queue ends.`,
          ).toMessage(),
        );
        return;
      }

      // Idle in another channel — move freely.
      player.voiceChannelId = channelId;
      if (player.connected) await player.disconnect();
      await player.connect();
    } else {
      player = lavalink().createPlayer({
        guildId: ctx.guildId,
        voiceChannelId: channelId,
        textChannelId: ctx.channelId,
        selfDeaf: true,
        selfMute: false,
      });
      await player.connect();
    }

    await ctx.editOrReply(successCard(`${E.NOTES} Joined <#${channelId}>.`).toMessage());
  }
}

