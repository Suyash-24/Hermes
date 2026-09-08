import { Declare, Command, type CommandContext, Options, createIntegerOption } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';

const options = {
  from: createIntegerOption({
    description: 'The position of the track to move (1-based)',
    required: true,
  }),
  to: createIntegerOption({
    description: 'The target position (1-based)',
    required: true,
  }),
};

@Declare({
  name: 'move',
  description: 'Move a track to a different position in the queue.',
})
@Options(options)
export default class MoveCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    const player = lavalink().getPlayer(ctx.guildId!);
    if (!player) {
      await ctx.editOrReply(errorCard('Nothing is currently playing.').toMessage());
      return;
    }

    const voiceState = await ctx.client.cache.voiceStates?.get(ctx.author.id, ctx.guildId!);
    if (!voiceState || voiceState.channelId !== player.voiceChannelId) {
      await ctx.editOrReply(errorCard('You must be in the same voice channel to move tracks.').toMessage());
      return;
    }

    const qLen = player.queue.tracks.length;
    if (qLen < 2) {
      await ctx.editOrReply(errorCard('Not enough tracks in the queue to move anything.').toMessage());
      return;
    }

    const from = ctx.options.from;
    const to = ctx.options.to;

    if (from < 1 || from > qLen || to < 1 || to > qLen) {
      await ctx.editOrReply(errorCard(`Invalid positions. Queue has ${qLen} tracks.`).toMessage());
      return;
    }

    if (from === to) {
      await ctx.editOrReply(errorCard('Source and target positions are the same.').toMessage());
      return;
    }

    // Lavalink-client arrays are zero-indexed
    const track = player.queue.tracks.splice(from - 1, 1)[0];
    if (!track) {
      await ctx.editOrReply(errorCard('Could not find track.').toMessage());
      return;
    }

    player.queue.tracks.splice(to - 1, 0, track);

    await ctx.editOrReply(successCard(`${E.NOTES} Moved **${track.info.title}** from #${from} to #${to}.`).toMessage());
  }
}
