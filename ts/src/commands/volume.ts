import { Declare, Command, type CommandContext, Options, createIntegerOption } from 'seyfert';
import { lavalink } from '../music/manager';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';

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
    const player = lavalink().getPlayer(ctx.guildId!);
    if (!player) {
      await ctx.editOrReply(errorCard('Nothing is currently playing.').toMessage());
      return;
    }

    const voiceState = await ctx.client.cache.voiceStates?.get(ctx.author.id, ctx.guildId!);
    if (!voiceState || voiceState.channelId !== player.voiceChannelId) {
      await ctx.editOrReply(errorCard('You must be in the same voice channel to change volume.').toMessage());
      return;
    }

    let level = ctx.options.level;
    level = Math.max(0, Math.min(level, 100)); // Clamp between 0-100

    await player.setVolume(level);
    await ctx.editOrReply(successCard(`${E.VOLUME_UP} Volume set to \`${level}%\`.`).toMessage());
  }
}
