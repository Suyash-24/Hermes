import { Declare, Command, type CommandContext, Options, createIntegerOption } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard } from '../cards/common';
import { E } from '../components/emoji';
import { requireSameVoice } from '../music/guards';

const options = {
  count: createIntegerOption({
    description: 'Number of tracks to skip',
    required: false,
  }),
};

@Declare({
  name: 'skip',
  description: 'Skip the current track or the next N tracks.',
})
@Options(options)
export default class SkipCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    if (!ctx.guildId) return;

    if (!await requireSameVoice(ctx, ctx.guildId, 'skip')) return;

    const player = lavalink().getPlayer(ctx.guildId)!;
    const count = Math.max(ctx.options.count ?? 1, 1);

    // If we skip more than what's left, lavalink-client handles it gracefully.
    await player.skip(count);

    // trackStart event will post the new Now Playing card.
    await ctx.editOrReply(successCard(`${E.SKIP} Skipped ${count > 1 ? `${count} tracks` : 'the track'}.`).toMessage());
  }
}

