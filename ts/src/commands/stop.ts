import { Declare, Command, type CommandContext } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';
import { setPlayerData } from '../music/playerData';

@Declare({
  name: 'stop',
  description: 'Stop playing and clear the queue.',
})
export default class StopCommand extends Command {
  override async run(ctx: CommandContext) {
    const player = lavalink().getPlayer(ctx.guildId!);
    if (!player) {
      await ctx.editOrReply(errorCard('Nothing is currently playing.').toMessage());
      return;
    }

    const voiceState = await ctx.client.cache.voiceStates?.get(ctx.author.id, ctx.guildId!);
    if (!voiceState || voiceState.channelId !== player.voiceChannelId) {
      await ctx.editOrReply(errorCard('You must be in the same voice channel to stop the player.').toMessage());
      return;
    }

    // Stop and clear queue
    await player.stopPlaying(true, false);
    player.queue.tracks.splice(0);
    
    // reset shuffle/autoplay
    setPlayerData(player, { shuffle: false });
    
    await ctx.editOrReply(successCard(`${E.STOPPED} Stopped playing and cleared the queue.`).toMessage());
  }
}
