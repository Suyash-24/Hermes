/**
 * `/utility` — parent command for general-purpose tools.
 * Sibling `SubCommand` files are pulled in by `@AutoLoad()`.
 */
import { AutoLoad, Declare, SubCommand, type CommandContext } from 'seyfert';
import { infoCard } from '../../cards/common';
import { E } from '../../components/emoji';

@Declare({
  name: 'utility',
  description: 'Handy tools — stats, info and profile imagery.',
})
@AutoLoad()
export default class UtilityCommand extends SubCommand {
  override async run(ctx: CommandContext) {
    await ctx.editOrReply(infoCard(`${E.INFO} Try \`/utility help\` for the full command list.`).toMessage());
  }
}
