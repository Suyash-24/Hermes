import { Declare, Command, type CommandContext, Options, createIntegerOption } from 'seyfert';
import { lavalink } from '../music/manager';
import { errorCard } from '../cards/common';
import { queueCard } from '../cards/music';

const options = {
  page: createIntegerOption({
    description: 'The page number to view',
    required: false,
  }),
};

@Declare({
  name: 'queue',
  description: 'Show the current song queue.',
})
@Options(options)
export default class QueueCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    const player = lavalink().getPlayer(ctx.guildId!);
    if (!player) {
      await ctx.editOrReply(errorCard('Nothing is currently playing.').toMessage());
      return;
    }

    // `queueCard` takes a 0-based page index, but humans use 1-based.
    // Default to page 1 (index 0).
    const pageNum = ctx.options.page ?? 1;
    const pageIndex = Math.max(pageNum - 1, 0);

    const card = queueCard(player, pageIndex);
    await ctx.editOrReply(card.toMessage());
  }
}
