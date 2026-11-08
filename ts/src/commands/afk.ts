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
import { logger } from '../logging';

const log = logger('afk');

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
    const userId = String(ctx.author.id).trim();

    // Save full AFK state in database
    state.db.afkUsers.set(userId, {
      reason,
      timestamp,
      scope,
      guildName,
      dmMentions,
      mentions: [],
    });
    state.db.save();
    log.info(`[afk] User ${ctx.author.username} (${userId}) set AFK: "${reason}". Total AFK in memory: ${state.db.afkUsers.size}`);

    const avatar = ctx.author.avatarURL() ?? ctx.author.defaultAvatarURL();

    const card = afkSetCard({
      userId,
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
