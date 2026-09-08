import { Declare, Command, type CommandContext } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';

@Declare({
  name: 'leave',
  description: 'Make the bot leave the voice channel.',
})
export default class LeaveCommand extends Command {
  override async run(ctx: CommandContext) {
    const player = lavalink().getPlayer(ctx.guildId!);
    if (!player) {
      await ctx.editOrReply(errorCard('I am not in a voice channel.').toMessage());
      return;
    }

    const voiceState = await ctx.client.cache.voiceStates?.get(ctx.author.id, ctx.guildId!);
    if (!voiceState || voiceState.channelId !== player.voiceChannelId) {
      await ctx.editOrReply(errorCard('You must be in the same voice channel to disconnect the bot.').toMessage());
      return;
    }

    await player.destroy();
    await ctx.editOrReply(successCard(`${E.NOTES} Left the voice channel and cleared the queue.`).toMessage());
  }
}
