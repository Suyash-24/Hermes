import { Declare, Command, type CommandContext } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard, errorCard } from '../cards/common';
import { nowPlayingCard } from '../cards/music';
import { setPlayerData } from '../music/playerData';
import { E } from '../components/emoji';

@Declare({
  name: 'pause',
  description: 'Pause the current track.',
})
export default class PauseCommand extends Command {
  override async run(ctx: CommandContext) {
    const player = lavalink().getPlayer(ctx.guildId!);
    if (!player) {
      await ctx.editOrReply(errorCard('Nothing is currently playing.').toMessage());
      return;
    }

    const voiceState = await ctx.client.cache.voiceStates?.get(ctx.author.id, ctx.guildId!);
    if (!voiceState || voiceState.channelId !== player.voiceChannelId) {
      await ctx.editOrReply(errorCard('You must be in the same voice channel to pause.').toMessage());
      return;
    }

    if (player.paused) {
      await ctx.editOrReply(errorCard('The player is already paused.').toMessage());
      return;
    }

    await player.pause();
    
    // We should update the now playing card if possible, or just reply
    const track = player.queue.current;
    if (track) {
      const card = nowPlayingCard(player, track);
      await ctx.editOrReply(card.toMessage());
    } else {
      await ctx.editOrReply(successCard(`${E.PAUSED} Paused.`).toMessage());
    }
  }
}
