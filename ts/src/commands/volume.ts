import { Declare, Command, type CommandContext, Options, createIntegerOption } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard } from '../cards/common';
import { E } from '../components/emoji';
import { requireSameVoice } from '../music/guards';

const options = {
  level: createIntegerOption({
    description: 'The volume level (0-100)',
    required: true,
  }),
};

@Declare({
  name: 'volume',
  description: 'Set the player volume.',
})
@Options(options)
export default class VolumeCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    if (!ctx.guildId) return;

    if (!await requireSameVoice(ctx, ctx.guildId, 'change volume')) return;

    const player = lavalink().getPlayer(ctx.guildId)!;
    const level = Math.max(0, Math.min(ctx.options.level, 100));

    await player.setVolume(level);
    await ctx.editOrReply(successCard(`${E.VOLUME_UP} Volume set to \`${level}%\`.`).toMessage());
  }
}

