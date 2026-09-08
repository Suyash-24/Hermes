import { Declare, Command, type CommandContext, Options, createIntegerOption } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard, errorCard } from '../cards/common';
import { nowPlayingCard } from '../cards/music';
import { E } from '../components/emoji';
import { setPlayerData } from '../music/playerData';

const options = {
  count: createIntegerOption({
    description: 'Number of tracks to skip',
    required: false,
  }),
};

@Declare({
  name: 'skip',
  description: 'Skip the current track or the next N tracks.',
})
@Options(options)
export default class SkipCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    const player = lavalink().getPlayer(ctx.guildId!);
    if (!player) {
      await ctx.editOrReply(errorCard('Nothing is currently playing.').toMessage());
      return;
    }

    const voiceState = await ctx.client.cache.voiceStates?.get(ctx.author.id, ctx.guildId!);
    if (!voiceState || voiceState.channelId !== player.voiceChannelId) {
      await ctx.editOrReply(errorCard('You must be in the same voice channel to skip.').toMessage());
      return;
    }

    const count = Math.max(ctx.options.count ?? 1, 1);

    // If we skip more than what's left, we just skip to the end of the queue.
    await player.skip(count);

    // wait briefly for player to update its state or emit trackStart
    // but we can also just send a generic skip success message, since trackStart event will post the new card!
    await ctx.editOrReply(successCard(`${E.SKIP} Skipped ${count > 1 ? `${count} tracks` : 'the track'}.`).toMessage());
  }
}
