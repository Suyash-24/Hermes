import { Declare, Command, type CommandContext } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard } from '../cards/common';
import { setPlayerData, playerData } from '../music/playerData';
import { E } from '../components/emoji';
import { requireSameVoice } from '../music/guards';

@Declare({
  name: 'shuffle',
  description: 'Toggle queue shuffle.',
})
export default class ShuffleCommand extends Command {
  override async run(ctx: CommandContext) {
    if (!ctx.guildId) return;

    if (!await requireSameVoice(ctx, ctx.guildId, 'toggle shuffle')) return;

    const player = lavalink().getPlayer(ctx.guildId)!;

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

