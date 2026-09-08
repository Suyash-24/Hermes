import { Declare, Command, type CommandContext, Options, createChannelOption } from 'seyfert';
import { ChannelType } from 'seyfert/lib/types/index';
import { appState } from '../state';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';

const options = {
  channel: createChannelOption({
    description: 'The channel to bind to (leave empty to unbind)',
    required: false,
    channel_types: [ChannelType.GuildText],
  }),
};

@Declare({
  name: 'bindchannel',
  description: 'Bind bot commands to a specific channel or clear the bind.',
})
@Options(options)
export default class BindChannelCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    if (!ctx.guildId) {
      await ctx.editOrReply(errorCard('This command can only be used in a server.').toMessage());
      return;
    }

    const state = appState();
    const channel = ctx.options.channel;

    if (!channel) {
      state.db.whitelistedChannels.delete(ctx.guildId);
      state.db.save();
      await ctx.editOrReply(successCard(`${E.NOTES} Unbound the bot. Commands can now be used anywhere.`).toMessage());
      return;
    }

    let whitelisted = state.db.whitelistedChannels.get(ctx.guildId);
    if (!whitelisted) {
      whitelisted = new Set();
      state.db.whitelistedChannels.set(ctx.guildId, whitelisted);
    }
    
    // In Rust it was typically a single bound channel or multiple. 
    // We will clear existing and set this one, to act like a strict bind.
    whitelisted.clear();
    whitelisted.add(channel.id);
    state.db.save();

    await ctx.editOrReply(successCard(`${E.NOTES} Bot bound to <#${channel.id}>.`).toMessage());
  }
}
