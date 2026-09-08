import { Declare, Command, type CommandContext } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';

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

    const voiceState = await ctx.client.cache.voiceStates?.get(ctx.author.id, ctx.guildId);
    if (!voiceState?.channelId) {
      await ctx.editOrReply(errorCard('You need to join a voice channel first!').toMessage());
      return;
    }

    let player = lavalink().getPlayer(ctx.guildId);
    if (player) {
      if (player.voiceChannelId === voiceState.channelId) {
        await ctx.editOrReply(errorCard('I am already in your voice channel.').toMessage());
        return;
      }

      player.voiceChannelId = voiceState.channelId;
      if (player.connected) {
        // Disconnect and reconnect if we are already connected to another channel
        await player.disconnect();
      }
      await player.connect();
    } else {
      player = lavalink().createPlayer({
        guildId: ctx.guildId,
        voiceChannelId: voiceState.channelId,
        textChannelId: ctx.channelId,
        selfDeaf: true,
        selfMute: false,
      });
      await player.connect();
    }

    await ctx.editOrReply(successCard(`${E.NOTES} Joined <#${voiceState.channelId}>.`).toMessage());
  }
}
