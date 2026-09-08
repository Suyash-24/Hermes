import { Declare, Command, type CommandContext, Options, createStringOption } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';

const options = {
  time: createStringOption({
    description: 'Time to seek to (e.g. 1:30, 90s)',
    required: true,
  }),
};

// Simple utility to parse "1:30" or "90s" into milliseconds
function parseTimeStr(timeStr: string): number {
  if (timeStr.includes(':')) {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) {
      return (parts[0] * 60 + parts[1]) * 1000;
    } else if (parts.length === 3) {
      return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    }
  }
  
  const num = parseInt(timeStr.replace(/[^0-9]/g, ''));
  if (!isNaN(num)) {
    if (timeStr.endsWith('s')) return num * 1000;
    if (timeStr.endsWith('m')) return num * 60 * 1000;
    return num * 1000; // default to seconds
  }
  return 0;
}

@Declare({
  name: 'seek',
  description: 'Seek to a specific time in the current track.',
})
@Options(options)
export default class SeekCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    const player = lavalink().getPlayer(ctx.guildId!);
    if (!player) {
      await ctx.editOrReply(errorCard('Nothing is currently playing.').toMessage());
      return;
    }

    const voiceState = await ctx.client.cache.voiceStates?.get(ctx.author.id, ctx.guildId!);
    if (!voiceState || voiceState.channelId !== player.voiceChannelId) {
      await ctx.editOrReply(errorCard('You must be in the same voice channel to seek.').toMessage());
      return;
    }

    const track = player.queue.current;
    if (!track || track.info.isStream) {
      await ctx.editOrReply(errorCard('Cannot seek streams or empty queue.').toMessage());
      return;
    }

    const ms = parseTimeStr(ctx.options.time);
    if (ms < 0 || ms > track.info.duration) {
      await ctx.editOrReply(errorCard(`Invalid seek time. Track is ${Math.round(track.info.duration / 1000)} seconds long.`).toMessage());
      return;
    }

    await player.seek(ms);
    await ctx.editOrReply(successCard(`${E.PLAYING} Seeked to \`${ctx.options.time}\`.`).toMessage());
  }
}
