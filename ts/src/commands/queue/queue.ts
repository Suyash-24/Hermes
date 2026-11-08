/**
 * `/queue` — parent command for queue inspection and management.
 * Sibling `SubCommand` files are pulled in by `@AutoLoad()`.
 */
import { AutoLoad, Declare, SubCommand, type CommandContext } from 'seyfert';
import { infoCard } from '../../cards/common';
import { E } from '../../components/emoji';

@Declare({
  name: 'queue',
  description: 'Inspect and manage the music queue.',
})
@AutoLoad()
export default class QueueCommand extends SubCommand {
  override async run(ctx: CommandContext) {
    await ctx.editOrReply(infoCard(`${E.QUEUE} View the queue with \`/queue show\`.`).toMessage());
  }
}
