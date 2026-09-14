import { Declare, Command, type CommandContext } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';
import { requireSameVoice } from '../music/guards';

@Declare({
  name: 'clear',
  description: 'Clear the entire music queue.',
})
export default class ClearCommand extends Command {
  override async run(ctx: CommandContext) {
    if (!ctx.guildId) return;

    if (!await requireSameVoice(ctx, ctx.guildId, 'clear the queue')) return;

    const player = lavalink().getPlayer(ctx.guildId)!;

    if (player.queue.tracks.length === 0) {
      await ctx.editOrReply(errorCard('The queue is already empty.').toMessage());
      return;
    }

    const count = player.queue.tracks.length;
    player.queue.tracks.splice(0);

    await ctx.editOrReply(successCard(`${E.NOTES} Cleared ${count} tracks from the queue.`).toMessage());
  }
}

