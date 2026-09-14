import { Declare, Command, type CommandContext, Options, createIntegerOption } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';
import { requireSameVoice } from '../music/guards';

const options = {
  position: createIntegerOption({
    description: 'The position of the track to remove (1-based)',
    required: true,
  }),
};

@Declare({
  name: 'remove',
  description: 'Remove a specific track from the queue.',
})
@Options(options)
export default class RemoveCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    if (!ctx.guildId) return;

    if (!await requireSameVoice(ctx, ctx.guildId, 'remove tracks')) return;

    const player = lavalink().getPlayer(ctx.guildId)!;
    const qLen = player.queue.tracks.length;
    const pos = ctx.options.position;

    if (pos < 1 || pos > qLen) {
      await ctx.editOrReply(errorCard(`Invalid position. Queue has ${qLen} tracks.`).toMessage());
      return;
    }

    const removed = player.queue.tracks.splice(pos - 1, 1)[0];
    if (!removed) {
      await ctx.editOrReply(errorCard('Could not find track to remove.').toMessage());
      return;
    }

    await ctx.editOrReply(successCard(`${E.NOTES} Removed **${removed.info.title}** from the queue.`).toMessage());
  }
}

