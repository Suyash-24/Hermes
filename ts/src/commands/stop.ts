import { Declare, Command, type CommandContext } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard } from '../cards/common';
import { E } from '../components/emoji';
import { setPlayerData } from '../music/playerData';
import { requireSameVoice } from '../music/guards';

@Declare({
  name: 'stop',
  description: 'Stop playing and clear the queue.',
})
export default class StopCommand extends Command {
  override async run(ctx: CommandContext) {
    if (!ctx.guildId) return;

    if (!await requireSameVoice(ctx, ctx.guildId, 'stop the player')) return;

    const player = lavalink().getPlayer(ctx.guildId)!;

    // Stop and clear queue
    await player.stopPlaying(true, false);
    player.queue.tracks.splice(0);

    // Reset shuffle/autoplay display state
    setPlayerData(player, { shuffle: false });

    await ctx.editOrReply(successCard(`${E.STOPPED} Stopped playing and cleared the queue.`).toMessage());
  }
}

