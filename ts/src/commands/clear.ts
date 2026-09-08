import { Declare, Command, type CommandContext } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';

@Declare({
  name: 'clear',
  description: 'Clear the entire music queue.',
})
export default class ClearCommand extends Command {
  override async run(ctx: CommandContext) {
    const player = lavalink().getPlayer(ctx.guildId!);
    if (!player) {
      await ctx.editOrReply(errorCard('Nothing is currently playing.').toMessage());
      return;
    }

    const voiceState = await ctx.client.cache.voiceStates?.get(ctx.author.id, ctx.guildId!);
    if (!voiceState || voiceState.channelId !== player.voiceChannelId) {
      await ctx.editOrReply(errorCard('You must be in the same voice channel to clear the queue.').toMessage());
      return;
    }

    if (player.queue.tracks.length === 0) {
      await ctx.editOrReply(errorCard('The queue is already empty.').toMessage());
      return;
    }

    const count = player.queue.tracks.length;
    player.queue.tracks.splice(0);

    await ctx.editOrReply(successCard(`${E.NOTES} Cleared ${count} tracks from the queue.`).toMessage());
  }
}
