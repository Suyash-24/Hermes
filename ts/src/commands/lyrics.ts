import { Declare, Command, type CommandContext, Options, createStringOption } from 'seyfert';
import { lavalink } from '../music/manager';
import { errorCard } from '../cards/common';
import { Colour, E, header, hint } from '../components/emoji';
import { FadeResponse } from '../components/v2';
import { truncate } from '../cards/common';

const options = {
  query: createStringOption({
    description: 'Song to fetch lyrics for (Format: Artist - Title)',
    required: false,
  }),
};

@Declare({
  name: 'lyrics',
  description: 'Fetch lyrics using the lyrics.ovh API.',
})
@Options(options)
export default class LyricsCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    await ctx.deferReply();

    let artist = '';
    let title = '';

    const query = ctx.options.query;
    if (query) {
      const parts = query.split(' - ');
      if (parts.length >= 2) {
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      } else {
        title = query.trim();
      }
    } else {
      const player = lavalink().getPlayer(ctx.guildId!);
      const current = player?.queue.current;
      if (!current) {
        await ctx.editOrReply(errorCard('Nothing is playing and no query was provided.').toMessage());
        return;
      }
      artist = current.info.author;
      title = current.info.title;
    }

    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    
    try {
      const resp = await fetch(url);
      const data = await resp.json() as any;

      if (!resp.ok || data.error) {
        await ctx.editOrReply(errorCard(`Lyrics not found: ${data.error || 'Not found'}`).toMessage());
        return;
      }

      const lyrics = data.lyrics || '';
      let lyricsDisplay = lyrics;
      if (lyrics.length > 1800) {
        lyricsDisplay = `${lyrics.slice(0, 1800)}…\n${hint('(truncated — lyrics too long)')}`;
      }

      const searchLabel = artist ? `${artist} — ${title}` : title;
      
      const card = new FadeResponse().container(Colour.FADE, c => c
        .text(header(E.LYRICS, truncate(searchLabel, 60)))
        .separator(true)
        .text(lyricsDisplay)
        .separator(false)
        .text(hint('Source: lyrics.ovh'))
      );

      await ctx.editOrReply(card.toMessage());
    } catch (err: any) {
      await ctx.editOrReply(errorCard(`Failed to fetch lyrics: ${err.message}`).toMessage());
    }
  }
}
