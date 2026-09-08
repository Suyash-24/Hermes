import { Declare, Command, type CommandContext, Options, createStringOption } from 'seyfert';
import { appState } from '../state';
import { E } from '../components/emoji';
import { FadeResponse } from '../components/v2';
import { nowSecs } from '../db';

const options = {
  reason: createStringOption({
    description: 'Reason for going AFK',
    required: false,
  }),
};

@Declare({
  name: 'afk',
  description: 'Set your AFK status. You will be marked AFK until you send a message.',
})
@Options(options)
export default class AfkCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    const reason = ctx.options.reason?.trim() || 'AFK';
    const state = appState();
    
    // Save AFK status
    state.db.afkUsers.set(ctx.author.id, {
      reason,
      timestamp: nowSecs(),
    });
    state.db.save();

    const avatar = ctx.author.avatarURL() ?? ctx.author.defaultAvatarURL();
    const timestamp = nowSecs();

    const response = new FadeResponse().container(undefined, c => c
      .section(s => s
        .text(`## ${E.AFK_SET} AFK Set`)
        .text(`*Your status has been updated. I'll notify anyone who mentions you.*`)
        .thumbnail(avatar)
      )
      .separator(true)
      .text(`> 💬 **Reason** • **${reason}**\n> 🕒 **Marked at** • <t:${timestamp}:t> (<t:${timestamp}:R>)`)
    );

    await ctx.editOrReply(response.toMessage());
  }
}
