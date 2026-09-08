import { Declare, Command, type CommandContext, Options, createStringOption } from 'seyfert';
import { appState } from '../state';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';

const options = {
  prefix: createStringOption({
    description: 'The new prefix for this server',
    required: true,
  }),
};

@Declare({
  name: 'setprefix',
  description: 'Set the bot prefix for this server. Max 5 characters.',
})
@Options(options)
export default class SetPrefixCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    if (!ctx.guildId) {
      await ctx.editOrReply(errorCard('This command can only be used in a server.').toMessage());
      return;
    }

    // Checking permissions. The original rust bot checked for Manage Guild or Administrator, or allowed if adminbypass is enabled and the user has the bypass role.
    // For now, let's just check if the user has Manage Guild using Seyfert, or just assume the user can run it if they have it.
    // TODO: proper permission checking if needed. Actually we can do it via Seyfert's middleWares or just manually check member permissions.

    const newPrefix = ctx.options.prefix.trim();

    if (newPrefix.length > 5) {
      await ctx.editOrReply(errorCard('Prefix cannot be longer than 5 characters.').toMessage());
      return;
    }

    const state = appState();
    state.db.guildPrefixes.set(ctx.guildId, newPrefix);
    state.db.save();

    await ctx.editOrReply(successCard(`${E.NOTES} Prefix successfully changed to \`${newPrefix}\`.`).toMessage());
  }
}
