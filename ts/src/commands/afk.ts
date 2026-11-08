import {
  Declare,
  Command,
  type CommandContext,
  Options,
  createStringOption,
} from 'seyfert';
import { appState } from '../state';
import { nowSecs } from '../db';
import { afkSetCard } from '../cards/afk';

const options = {
  reason: createStringOption({
    description: 'Reason for going AFK',
    required: false,
  }),
};

@Declare({
  name: 'afk',
  description: 'Set your AFK status',
})
@Options(options)
export default class AfkCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    const reason = ctx.options.reason?.trim() || 'AFK';
    const scope = 'global';
    const dmMentions = false;

    let guildName: string | undefined;
    if (ctx.guildId) {
      const cached = await ctx.client.cache.guilds?.get(ctx.guildId);
      guildName = cached?.name;
    }

    const state = appState();
    const timestamp = nowSecs();

    // Save full AFK state in database
    state.db.afkUsers.set(ctx.author.id, {
      reason,
      timestamp,
      scope,
      guildName,
      dmMentions,
      mentions: [],
    });
    state.db.save();

    const avatar = ctx.author.avatarURL() ?? ctx.author.defaultAvatarURL();

    const card = afkSetCard({
      userId: ctx.author.id,
      avatarUrl: avatar,
      reason,
      timestamp,
      scope,
      guildName,
      dmMentions,
    });

    await ctx.editOrReply(card.toMessage());
  }
}
