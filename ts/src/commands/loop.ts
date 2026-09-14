import { Declare, Command, type CommandContext } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard } from '../cards/common';
import { E } from '../components/emoji';
import { requireSameVoice } from '../music/guards';

@Declare({
  name: 'loop',
  description: 'Cycle loop mode (off -> track -> queue).',
})
export default class LoopCommand extends Command {
  override async run(ctx: CommandContext) {
    if (!ctx.guildId) return;

    if (!await requireSameVoice(ctx, ctx.guildId, 'toggle loop')) return;

    const player = lavalink().getPlayer(ctx.guildId)!;

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

