import { Declare, Command, type CommandContext, Options, createStringOption } from 'seyfert';
import { lavalink, lavalinkReady, searchNode } from '../music/manager';
import { searchForPlay } from '../music/search';
import { setPlayerData } from '../music/playerData';
import { nowPlayingCard, playlistQueuedCard, queuedCard } from '../cards/music';
import { errorCard } from '../cards/common';
import { E } from '../components/emoji';

const options = {
  query: createStringOption({
    description: 'A search query or URL to play',
    required: true,
  }),
};

@Declare({
  name: 'play',
  description: 'Search YouTube or play a URL.',
})
@Options(options)
export default class PlayCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    await ctx.deferReply();

    const query = ctx.options.query;
    if (!query) {
      await ctx.editOrReply(errorCard('Please provide a search query or URL.').toMessage());
      return;
    }

    if (!ctx.guildId) {
      await ctx.editOrReply(errorCard('This command can only be used in a server.').toMessage());
      return;
    }

    const voiceState = await ctx.client.cache.voiceStates?.get(ctx.author.id, ctx.guildId);
    if (!voiceState?.channelId) {
      await ctx.editOrReply(errorCard('You need to join a voice channel first!').toMessage());
      return;
    }

    const requester = {
      id: ctx.author.id,
      username: ctx.author.username,
      avatarUrl: ctx.author.avatarURL() ?? ctx.author.defaultAvatarURL(),
    };

    if (!lavalinkReady()) {
      await ctx.editOrReply(errorCard('The music player is currently connecting to Lavalink. Please try again in a moment.').toMessage());
      return;
    }

    let player = lavalink().getPlayer(ctx.guildId);
    
    if (!player) {
      player = lavalink().createPlayer({
        guildId: ctx.guildId,
        voiceChannelId: voiceState.channelId,
        textChannelId: ctx.channelId,
        selfDeaf: true,
        selfMute: false,
      });
    }

    // Only connect if we aren't already in or connecting to this voice channel
    if (!player.voiceChannelId || player.voiceChannelId !== voiceState.channelId) {
      player.voiceChannelId = voiceState.channelId;
      await player.connect();
    } else if (!player.connected && !player.voice?.sessionId) {
      await player.connect();
    }

    try {
      const result = await searchForPlay(player, query, requester);
      const isPlaying = player.playing || player.paused;

      player.queue.add(result.tracks);

      if (result.playlistName) {
        if (!isPlaying) {
          await player.play();
          const card = nowPlayingCard(player, player.queue.current!);
          const reply: any = await ctx.editOrReply(card.toMessage());
          if (reply && typeof reply === 'object' && 'id' in reply && player.queue.current) {
            setPlayerData(player, {
              nowPlayingMsg: { channelId: ctx.channelId, messageId: reply.id },
              nowPlayingTrackId: player.queue.current.info.identifier,
            });
          }
        } else {
          const card = playlistQueuedCard(result.tracks, result.playlistName);
          await ctx.editOrReply(card.toMessage());
        }
      } else {
        const track = result.tracks[0];
        if (!isPlaying) {
          await player.play();
          const card = nowPlayingCard(player, player.queue.current!);
          const reply: any = await ctx.editOrReply(card.toMessage());
          if (reply && typeof reply === 'object' && 'id' in reply && player.queue.current) {
            setPlayerData(player, {
              nowPlayingMsg: { channelId: ctx.channelId, messageId: reply.id },
              nowPlayingTrackId: player.queue.current.info.identifier,
            });
          }
        } else {
          const position = player.queue.tracks.length;
          const card = queuedCard(track, position);
          await ctx.editOrReply(card.toMessage());
        }
      }
    } catch (err: any) {
      if (query.includes('spotify.com/playlist/')) {
        await ctx.editOrReply(errorCard('Spotify playlist links are not supported. You can use Spotify song and album links, and all YouTube links.').toMessage());
        return;
      }
      await ctx.editOrReply(errorCard(err.message || 'Could not find any tracks.').toMessage());
    }
  }
}
