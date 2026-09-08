import { Declare, Command, type CommandContext } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard, errorCard } from '../cards/common';
import { setPlayerData, playerData } from '../music/playerData';
import { E } from '../components/emoji';

@Declare({
  name: 'shuffle',
  description: 'Toggle queue shuffle.',
})
export default class ShuffleCommand extends Command {
  override async run(ctx: CommandContext) {
    const player = lavalink().getPlayer(ctx.guildId!);
    if (!player) {
      await ctx.editOrReply(errorCard('Nothing is currently playing.').toMessage());
      return;
    }

    const voiceState = await ctx.client.cache.voiceStates?.get(ctx.author.id, ctx.guildId!);
    if (!voiceState || voiceState.channelId !== player.voiceChannelId) {
      await ctx.editOrReply(errorCard('You must be in the same voice channel to toggle shuffle.').toMessage());
      return;
    }

    const currentShuffle = playerData(player).shuffle;
    if (!currentShuffle) {
      player.queue.shuffle();
      setPlayerData(player, { shuffle: true });
      await ctx.editOrReply(successCard(`${E.SHUFFLE} Shuffle is now **On**.`).toMessage());
    } else {
      setPlayerData(player, { shuffle: false });
      await ctx.editOrReply(successCard(`${E.SHUFFLE} Shuffle is now **Off**.`).toMessage());
    }
  }
}
