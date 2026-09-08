import { Declare, Command, type CommandContext, Options, createStringOption } from 'seyfert';
import { appState } from '../state';
import { Colour, E, header } from '../components/emoji';
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

    const response = new FadeResponse().container(Colour.FADE, c => 
      c.text(header(E.AFK_SET, `You are now AFK: **${reason}**`))
    );

    await ctx.editOrReply(response.toMessage());
  }
}
