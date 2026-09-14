import { ComponentCommand, type ComponentContext } from 'seyfert';
import { lavalink } from '../../music/manager';
import { nowPlayingCard, MUSIC_BUTTON } from '../../cards/music';
import { setPlayerData, playerData } from '../../music/playerData';
import { requireSameVoice } from '../../music/guards';

export default class MusicButtons extends ComponentCommand {
  componentType = 'Button' as const;

  override filter(ctx: ComponentContext<typeof this.componentType>) {
    return Object.values(MUSIC_BUTTON).includes(ctx.customId as any);
  }

  override async run(ctx: ComponentContext<typeof this.componentType>) {
    if (!ctx.guildId) return;

    // All music buttons require the user to be in the same VC as the bot.
    if (!await requireSameVoice(ctx, ctx.guildId, 'use these controls')) return;

    const player = lavalink().getPlayer(ctx.guildId)!;

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

      case MUSIC_BUTTON.prev: {
        // Lavalink-client `queue.previous` array holds history.
        const prev = player.queue.previous.pop();
        if (prev) {
          player.queue.tracks.unshift(prev);
          await player.skip();
        }
        break;
      }

      case MUSIC_BUTTON.shuffle: {
        const currentShuffle = playerData(player).shuffle;
        if (!currentShuffle) {
          player.queue.shuffle();
          setPlayerData(player, { shuffle: true });
        } else {
          setPlayerData(player, { shuffle: false });
        }
        break;
      }

      case MUSIC_BUTTON.loop:
        if (player.repeatMode === 'off') await player.setRepeatMode('track');
        else if (player.repeatMode === 'track') await player.setRepeatMode('queue');
        else await player.setRepeatMode('off');
        break;

      case MUSIC_BUTTON.volDown: {
        const downVol = Math.max(player.volume - 10, 0);
        await player.setVolume(downVol);
        break;
      }

      case MUSIC_BUTTON.volUp: {
        const upVol = Math.min(player.volume + 10, 100);
        await player.setVolume(upVol);
        break;
      }
    }

    // After mutation, edit the message if track is still playing.
    const track = player.queue.current;
    if (
      track &&
      ctx.customId !== MUSIC_BUTTON.stop &&
      ctx.customId !== MUSIC_BUTTON.skip &&
      ctx.customId !== MUSIC_BUTTON.prev
    ) {
      await ctx.editOrReply(nowPlayingCard(player, track).toMessage());
    } else {
      // For stop/skip/prev the trackEnd/trackStart events handle the card.
      try { await ctx.interaction.deferUpdate(); } catch {}
    }
  }
}

