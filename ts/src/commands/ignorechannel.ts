import { Declare, Command, type CommandContext, Options, createChannelOption } from 'seyfert';
import { ChannelType } from 'seyfert/lib/types/index';
import { appState } from '../state';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';

const options = {
  channel: createChannelOption({
    description: 'The channel to ignore (leave empty to un-ignore all)',
    required: false,
    channel_types: [ChannelType.GuildText],
  }),
};

@Declare({
  name: 'ignorechannel',
  description: 'Ignore commands in a specific channel.',
})
@Options(options)
export default class IgnoreChannelCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    if (!ctx.guildId) {
      await ctx.editOrReply(errorCard('This command can only be used in a server.').toMessage());
      return;
    }

    const state = appState();
    const channel = ctx.options.channel;

    if (!channel) {
      state.db.blacklistedChannels.delete(ctx.guildId);
      state.db.save();
      await ctx.editOrReply(successCard(`${E.NOTES} Un-ignored all channels.`).toMessage());
      return;
    }

    let blacklisted = state.db.blacklistedChannels.get(ctx.guildId);
    if (!blacklisted) {
      blacklisted = new Set();
      state.db.blacklistedChannels.set(ctx.guildId, blacklisted);
    }
    
    // In Rust it could be a toggle or multiple channels. Let's toggle.
    if (blacklisted.has(channel.id)) {
      blacklisted.delete(channel.id);
      if (blacklisted.size === 0) {
        state.db.blacklistedChannels.delete(ctx.guildId);
      }
      state.db.save();
      await ctx.editOrReply(successCard(`${E.NOTES} Un-ignored <#${channel.id}>. Commands can be used there again.`).toMessage());
    } else {
      blacklisted.add(channel.id);
      state.db.save();
      await ctx.editOrReply(successCard(`${E.NOTES} Ignoring commands in <#${channel.id}>.`).toMessage());
    }
  }
}
