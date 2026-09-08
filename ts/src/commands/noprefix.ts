import { Declare, Command, type CommandContext, Options, createUserOption, createStringOption } from 'seyfert';
import { appState } from '../state';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';

const options = {
  user: createUserOption({
    description: 'The user to grant or remove noprefix for',
    required: true,
  }),
  duration: createStringOption({
    description: 'Duration (e.g. 2w, 60d, 24h, lifetime, remove). Defaults to 60d.',
    required: false,
  }),
};

function parseDuration(s: string): number | null {
  const match = s.match(/^(\d+)([dhw])$/);
  if (match) {
    const val = parseInt(match[1]!, 10);
    const mult = match[2] === 'h' ? 3600 : match[2] === 'd' ? 86400 : match[2] === 'w' ? 604800 : 0;
    return val * mult;
  }
  return null;
}

@Declare({
  name: 'noprefix',
  description: 'Manage users who can bypass the bot prefix (Bot Owner only).',
})
@Options(options)
export default class NoPrefixCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    const state = appState();
    
    // Check if owner
    if (!state.config.bot.owners.includes(ctx.author.id)) {
      await ctx.editOrReply(errorCard('You must be a bot owner to use this command.').toMessage());
      return;
    }

    const targetUser = ctx.options.user;
    const durationStr = (ctx.options.duration ?? '60d').toLowerCase();
    const isRemove = durationStr === 'remove';

    let expiresAt = 0;
    if (isRemove || durationStr === 'lifetime') {
      expiresAt = 0;
    } else {
      const durationSecs = parseDuration(durationStr) ?? (60 * 24 * 60 * 60); // default 60d
      expiresAt = Math.floor(Date.now() / 1000) + durationSecs;
    }

    if (isRemove) {
      state.db.noprefix.delete(targetUser.id);
    } else {
      state.db.noprefix.set(targetUser.id, expiresAt);
    }
    state.db.save();

    let msg = '';
    if (isRemove) {
      msg = `${E.OK} <@${targetUser.id}> removed from the noprefix list.`;
    } else if (expiresAt === 0) {
      msg = `${E.OK} <@${targetUser.id}> added to the noprefix list for **lifetime**.`;
    } else {
      msg = `${E.OK} <@${targetUser.id}> added to the noprefix list until <t:${expiresAt}:R>.`;
    }

    await ctx.editOrReply(successCard(msg).toMessage());
  }
}
