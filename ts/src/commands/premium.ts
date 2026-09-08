import { Declare, Command, type CommandContext, Options, createStringOption } from 'seyfert';
import { appState } from '../state';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';

const options = {
  action: createStringOption({
    description: 'check or claim',
    required: true,
    choices: [
      { name: 'check', value: 'check' },
      { name: 'claim', value: 'claim' },
    ],
  }),
};

@Declare({
  name: 'premium',
  description: 'Check or claim premium status for this server.',
})
@Options(options)
export default class PremiumCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    if (!ctx.guildId) {
      await ctx.editOrReply(errorCard('This command can only be used in a server.').toMessage());
      return;
    }

    const state = appState();
    const isPremium = state.db.premiumGuilds.has(ctx.guildId);

    if (ctx.options.action === 'check') {
      if (isPremium) {
        await ctx.editOrReply(successCard(`${E.NOTES} This server has **Premium Status**.`).toMessage());
      } else {
        await ctx.editOrReply(successCard(`${E.NOTES} This server does not have premium status.`).toMessage());
      }
    } else if (ctx.options.action === 'claim') {
      // In a real bot, you'd check user's entitlement / database for premium tokens
      // Here, let's just claim it for demonstration purposes
      state.db.premiumGuilds.set(ctx.guildId, 0); // 0 = lifetime
      state.db.save();
      await ctx.editOrReply(successCard(`${E.NOTES} Premium has been claimed for this server!`).toMessage());
    }
  }
}
