import { Declare, Command, type CommandContext } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard, errorCard } from '../cards/common';
import { toggleAutoplay } from '../music/playerData';
import { E } from '../components/emoji';

@Declare({
  name: 'autoplay',
  description: 'Toggle autoplay mode.',
})
export default class AutoplayCommand extends Command {
  override async run(ctx: CommandContext) {
    const player = lavalink().getPlayer(ctx.guildId!);
    if (!player) {
      await ctx.editOrReply(errorCard('Nothing is currently playing.').toMessage());
      return;
    }

    const voiceState = await ctx.client.cache.voiceStates?.get(ctx.author.id, ctx.guildId!);
    if (!voiceState || voiceState.channelId !== player.voiceChannelId) {
      await ctx.editOrReply(errorCard('You must be in the same voice channel to toggle autoplay.').toMessage());
      return;
    }

    const isEnabled = toggleAutoplay(player);
    if (isEnabled) {
      await ctx.editOrReply(successCard(`${E.SPARK} Autoplay is now **On**.`).toMessage());
    } else {
      await ctx.editOrReply(successCard(`${E.SPARK} Autoplay is now **Off**.`).toMessage());
    }
  }
}
