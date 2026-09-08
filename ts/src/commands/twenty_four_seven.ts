import { Declare, Command, type CommandContext } from 'seyfert';
import { appState } from '../state';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';

@Declare({
  name: '24/7',
  description: 'Toggle 24/7 mode. When enabled, the bot will not leave when idle.',
})
export default class TwentyFourSevenCommand extends Command {
  override async run(ctx: CommandContext) {
    if (!ctx.guildId) {
      await ctx.editOrReply(errorCard('This command can only be used in a server.').toMessage());
      return;
    }

    const state = appState();
    
    if (state.db.twentyFourSeven.has(ctx.guildId)) {
      state.db.twentyFourSeven.delete(ctx.guildId);
      state.db.save();
      await ctx.editOrReply(successCard(`${E.NOTES} 24/7 mode is now **Disabled**. The bot will leave when inactive.`).toMessage());
    } else {
      state.db.twentyFourSeven.add(ctx.guildId);
      state.db.save();
      await ctx.editOrReply(successCard(`${E.NOTES} 24/7 mode is now **Enabled**. The bot will stay in voice channels 24/7.`).toMessage());
    }
  }
}
