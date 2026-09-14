import { Declare, Command, type CommandContext } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard, errorCard } from '../cards/common';
import { nowPlayingCard } from '../cards/music';
import { E } from '../components/emoji';
import { requireSameVoice } from '../music/guards';

@Declare({
  name: 'pause',
  description: 'Pause the current track.',
})
export default class PauseCommand extends Command {
  override async run(ctx: CommandContext) {
    if (!ctx.guildId) return;

    if (!await requireSameVoice(ctx, ctx.guildId, 'pause')) return;

    const player = lavalink().getPlayer(ctx.guildId)!;

    if (player.paused) {
      await ctx.editOrReply(errorCard('The player is already paused.').toMessage());
      return;
    }

    await player.pause();

    const track = player.queue.current;
    if (track) {
      await ctx.editOrReply(nowPlayingCard(player, track).toMessage());
    } else {
      await ctx.editOrReply(successCard(`${E.PAUSED} Paused.`).toMessage());
    }
  }
}

