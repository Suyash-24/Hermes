import { ComponentCommand, type ComponentContext } from 'seyfert';
import { lavalink } from '../../music/manager';
import { errorCard } from '../../cards/common';
import { nowPlayingCard, MUSIC_BUTTON } from '../../cards/music';
import { setPlayerData, playerData } from '../../music/playerData';

export default class MusicButtons extends ComponentCommand {
  componentType = 'Button' as const;

  override filter(ctx: ComponentContext<typeof this.componentType>) {
    return Object.values(MUSIC_BUTTON).includes(ctx.customId as any);
  }

  override async run(ctx: ComponentContext<typeof this.componentType>) {
    const player = lavalink().getPlayer(ctx.guildId!);
    if (!player) {
      await ctx.editOrReply(errorCard('Nothing is currently playing.').toMessage());
      return;
    }

    const voiceState = await ctx.client.cache.voiceStates?.get(ctx.author.id, ctx.guildId!);
    if (!voiceState || voiceState.channelId !== player.voiceChannelId) {
      await ctx.editOrReply(errorCard('You must be in the same voice channel to use these controls.').toMessage());
      return;
    }

    switch (ctx.customId) {
      case MUSIC_BUTTON.pause:
        if (player.paused) await player.resume();
        else await player.pause();
        break;

      case MUSIC_BUTTON.skip:
        await player.skip();
        break;

      case MUSIC_BUTTON.stop:
        await player.stopPlaying(true, false);
        player.queue.tracks.splice(0);
        setPlayerData(player, { shuffle: false });
        break;

      case MUSIC_BUTTON.prev:
        // Lavalink-client `queue.previous` array holds history.
        // We can just play the last history track if it exists.
        const prev = player.queue.previous.pop();
        if (prev) {
          // Add to front of queue and skip current
          player.queue.tracks.unshift(prev);
          await player.skip();
        }
        break;

      case MUSIC_BUTTON.shuffle:
        const currentShuffle = playerData(player).shuffle;
        if (!currentShuffle) {
          player.queue.shuffle();
          setPlayerData(player, { shuffle: true });
        } else {
          // Cannot cleanly unshuffle in Lavalink-client without saving original queue state
          setPlayerData(player, { shuffle: false });
        }
        break;

      case MUSIC_BUTTON.loop:
        if (player.repeatMode === 'off') await player.setRepeatMode('track');
        else if (player.repeatMode === 'track') await player.setRepeatMode('queue');
        else await player.setRepeatMode('off');
        break;

      case MUSIC_BUTTON.volDown:
        const downVol = Math.max(player.volume - 10, 0);
        await player.setVolume(downVol);
        break;

      case MUSIC_BUTTON.volUp:
        const upVol = Math.min(player.volume + 10, 100);
        await player.setVolume(upVol);
        break;
    }

    // After mutation, edit the message if track is still playing.
    const track = player.queue.current;
    if (track && ctx.customId !== MUSIC_BUTTON.stop && ctx.customId !== MUSIC_BUTTON.skip && ctx.customId !== MUSIC_BUTTON.prev) {
      const card = nowPlayingCard(player, track);
      await ctx.editOrReply(card.toMessage());
    } else {
      // If it's a stop or skip, the trackEnd / trackStart event might handle editing or sending a new message.
      // A simple deferUpdate handles the UI click.
      try {
        await ctx.interaction.deferUpdate();
      } catch {}
    }
  }
}
