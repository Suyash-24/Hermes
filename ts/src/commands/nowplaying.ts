import { Declare, Command, type CommandContext } from 'seyfert';
import { lavalink } from '../music/manager';
import { errorCard } from '../cards/common';
import { nowPlayingCard } from '../cards/music';

@Declare({
  name: 'nowplaying',
  description: 'Show what is currently playing.',
})
export default class NowPlayingCommand extends Command {
  override async run(ctx: CommandContext) {
    const player = lavalink().getPlayer(ctx.guildId!);
    if (!player) {
      await ctx.editOrReply(errorCard('Nothing is currently playing.').toMessage());
      return;
    }

    const track = player.queue.current;
    if (!track) {
      await ctx.editOrReply(errorCard('Nothing is currently playing.').toMessage());
      return;
    }

    const card = nowPlayingCard(player, track);
    await ctx.editOrReply(card.toMessage());
  }
}
