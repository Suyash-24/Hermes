import { Declare, Command, type CommandContext } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard } from '../cards/common';
import { toggleAutoplay } from '../music/playerData';
import { E } from '../components/emoji';
import { requireSameVoice } from '../music/guards';

@Declare({
  name: 'autoplay',
  description: 'Toggle autoplay mode.',
})
export default class AutoplayCommand extends Command {
  override async run(ctx: CommandContext) {
    if (!ctx.guildId) return;

    if (!await requireSameVoice(ctx, ctx.guildId, 'toggle autoplay')) return;

    const player = lavalink().getPlayer(ctx.guildId)!;
    const isEnabled = toggleAutoplay(player);

    if (isEnabled) {
      await ctx.editOrReply(successCard(`${E.SPARK} Autoplay is now **On**.`).toMessage());
    } else {
      await ctx.editOrReply(successCard(`${E.SPARK} Autoplay is now **Off**.`).toMessage());
    }
  }
}

