/**
 * `/manage` — parent command for server configuration commands.
 * Sibling `SubCommand` files are pulled in by `@AutoLoad()`.
 */
import { AutoLoad, Declare, SubCommand, type CommandContext } from 'seyfert';
import { infoCard } from '../../cards/common';
import { E } from '../../components/emoji';

@Declare({
  name: 'manage',
  description: 'Server configuration — channels and moderation.',
})
@AutoLoad()
export default class ManageCommand extends SubCommand {
  override async run(ctx: CommandContext) {
    await ctx.editOrReply(
      infoCard(`${E.SETTINGS} Configure buttons, channels and bypass from here.`).toMessage(),
    );
  }
}
