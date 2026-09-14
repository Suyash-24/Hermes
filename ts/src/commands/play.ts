import { Declare, Command, type CommandContext, Options, createStringOption } from 'seyfert';
import { lavalink, lavalinkReady } from '../music/manager';
import { searchForPlay } from '../music/search';
import { playlistQueuedCard, queuedCard, startingPlaybackCard } from '../cards/music';
import { errorCard } from '../cards/common';
import { requireUserVoice } from '../music/guards';

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

    // Guard: user must be in a VC and bot must have Connect/Speak perms there.
    const channelId = await requireUserVoice(ctx, ctx.guildId);
    if (!channelId) return;

    if (!lavalinkReady()) {
      await ctx.editOrReply(errorCard('The music player is currently connecting to Lavalink. Please try again in a moment.').toMessage());
      return;
    }

    // If the bot is already playing in a *different* VC, block the request.
    let player = lavalink().getPlayer(ctx.guildId);
    if (player?.voiceChannelId && player.voiceChannelId !== channelId) {
      await ctx.editOrReply(
        errorCard(`I'm already playing music in <#${player.voiceChannelId}>. Join that channel or use \`/join\` to move me.`).toMessage(),
      );
      return;
    }

    if (!player) {
      player = lavalink().createPlayer({
        guildId: ctx.guildId,
        voiceChannelId: channelId,
        textChannelId: ctx.channelId,
        selfDeaf: true,
        selfMute: false,
      });
    }

    // Only connect if we aren't already in or connecting to this voice channel.
    if (!player.voiceChannelId || player.voiceChannelId !== channelId) {
      player.voiceChannelId = channelId;
      await player.connect();
    } else if (!player.connected && !player.voice?.sessionId) {
      await player.connect();
    }

    try {
      const result = await searchForPlay(player, query, {
        id: ctx.author.id,
        username: ctx.author.username,
        avatarUrl: ctx.author.avatarURL() ?? ctx.author.defaultAvatarURL(),
      });
      const isPlaying = player.playing || player.paused;

      player.queue.add(result.tracks);

      if (result.playlistName) {
        if (!isPlaying) {
          // Let the trackStart event exclusively post the Now Playing card.
          // We just confirm the action so the deferred reply resolves.
          await player.play();
          await ctx.editOrReply(startingPlaybackCard(result.tracks[0]).toMessage());
        } else {
          const card = playlistQueuedCard(result.tracks, result.playlistName);
          await ctx.editOrReply(card.toMessage());
        }
      } else {
        const track = result.tracks[0];
        if (!isPlaying) {
          // Let the trackStart event exclusively post the Now Playing card.
          await player.play();
          await ctx.editOrReply(startingPlaybackCard(track).toMessage());
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
