import { Declare, Command, type CommandContext, Options, createIntegerOption } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';

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
    const player = lavalink().getPlayer(ctx.guildId!);
    if (!player) {
      await ctx.editOrReply(errorCard('Nothing is currently playing.').toMessage());
      return;
    }

    const voiceState = await ctx.client.cache.voiceStates?.get(ctx.author.id, ctx.guildId!);
    if (!voiceState || voiceState.channelId !== player.voiceChannelId) {
      await ctx.editOrReply(errorCard('You must be in the same voice channel to remove tracks.').toMessage());
      return;
    }

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
