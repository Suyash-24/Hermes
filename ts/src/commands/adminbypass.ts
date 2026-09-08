import { Declare, Command, type CommandContext } from 'seyfert';
import { appState } from '../state';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';

@Declare({
  name: 'adminbypass',
  description: 'Toggle admin bypass for command restrictions.',
})
export default class AdminBypassCommand extends Command {
  override async run(ctx: CommandContext) {
    if (!ctx.guildId) {
      await ctx.editOrReply(errorCard('This command can only be used in a server.').toMessage());
      return;
    }

    const state = appState();
    
    // In Rust, absence means enabled by default. Let's match this behavior.
    const isBypassEnabled = state.db.adminBypass.get(ctx.guildId) ?? true;
    
    // Toggle the value
    const newValue = !isBypassEnabled;
    state.db.adminBypass.set(ctx.guildId, newValue);
    state.db.save();

    if (newValue) {
      await ctx.editOrReply(successCard(`${E.NOTES} Admin bypass is now **Enabled**.`).toMessage());
    } else {
      await ctx.editOrReply(successCard(`${E.NOTES} Admin bypass is now **Disabled**.`).toMessage());
    }
  }
}
