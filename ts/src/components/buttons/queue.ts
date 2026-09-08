import { ComponentCommand, type ComponentContext } from 'seyfert';
import { lavalink } from '../../music/manager';
import { errorCard } from '../../cards/common';
import { parseQueuePageId, queueCard } from '../../cards/music';

export default class QueueButtons extends ComponentCommand {
  componentType = 'Button' as const;

  override filter(ctx: ComponentContext<typeof this.componentType>) {
    return parseQueuePageId(ctx.customId) !== undefined;
  }

  override async run(ctx: ComponentContext<typeof this.componentType>) {
    const player = lavalink().getPlayer(ctx.guildId!);
    if (!player) {
      await ctx.editOrReply(errorCard('Nothing is currently playing.').toMessage());
      return;
    }

    const pageIndex = parseQueuePageId(ctx.customId);
    if (pageIndex === undefined) return;

    const card = queueCard(player, pageIndex);
    await ctx.editOrReply(card.toMessage());
  }
}
