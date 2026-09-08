import { Declare, Command, type CommandContext } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';

@Declare({
  name: 'loop',
  description: 'Cycle loop mode (off -> track -> queue).',
})
export default class LoopCommand extends Command {
  override async run(ctx: CommandContext) {
    const player = lavalink().getPlayer(ctx.guildId!);
    if (!player) {
      await ctx.editOrReply(errorCard('Nothing is currently playing.').toMessage());
      return;
    }

    const voiceState = await ctx.client.cache.voiceStates?.get(ctx.author.id, ctx.guildId!);
    if (!voiceState || voiceState.channelId !== player.voiceChannelId) {
      await ctx.editOrReply(errorCard('You must be in the same voice channel to toggle loop.').toMessage());
      return;
    }

    if (player.repeatMode === 'off') {
      await player.setRepeatMode('track');
      await ctx.editOrReply(successCard(`${E.LOOP_ONE} Loop mode set to **Track**.`).toMessage());
    } else if (player.repeatMode === 'track') {
      await player.setRepeatMode('queue');
      await ctx.editOrReply(successCard(`${E.LOOP} Loop mode set to **Queue**.`).toMessage());
    } else {
      await player.setRepeatMode('off');
      await ctx.editOrReply(successCard(`${E.FORWARD} Loop mode set to **Off**.`).toMessage());
    }
  }
}
