/**
 * `/music` — the parent command for every playback subcommand.
 *
 * `@AutoLoad()` walks this directory and registers every sibling default
 * export that `extends SubCommand`, so adding playback features is just
 * creating a file here — the parent picks it up automatically.
 */
import { AutoLoad, Declare, SubCommand, type CommandContext } from 'seyfert';
import { infoCard } from '../../cards/common';
import { E } from '../../components/emoji';

@Declare({
  name: 'music',
  description: 'Play music and control playback in voice channels.',
})
@AutoLoad()
export default class MusicCommand extends SubCommand {
  override async run(ctx: CommandContext) {
    await ctx.editOrReply(infoCard(`${E.MUSIC} Start a session with \`/music play\`.`).toMessage());
  }
}
