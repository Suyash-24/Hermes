import { Declare, Command, type CommandContext, Options, createStringOption, createAttachmentOption } from 'seyfert';
import { appState } from '../state';
import { successCard, errorCard } from '../cards/common';
import { E } from '../components/emoji';
import { downloadAndProcessImage } from '../utils/imageProcessing';

const options = {
  url: createStringOption({
    description: 'Image URL',
    required: false,
  }),
  attachment: createAttachmentOption({
    description: 'Image Attachment',
    required: false,
  }),
};

@Declare({
  name: 'serveravatar',
  description: 'Change the bot\'s server-specific avatar (Premium feature).',
})
@Options(options)
export default class ServerAvatarCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    if (!ctx.guildId) {
      await ctx.editOrReply(errorCard('This command can only be used in a server.').toMessage());
      return;
    }

    const state = appState();
    
    // Check premium status
    const isPremium = state.db.premiumGuilds.has(ctx.guildId);
    if (!isPremium) {
      await ctx.editOrReply(errorCard('This is a Premium feature! A bot owner must grant this server premium access.').toMessage());
      return;
    }

    // Determine image URL
    let imageUrl = ctx.options.url;
    if (ctx.options.attachment) {
      imageUrl = ctx.options.attachment.url;
    }

    await ctx.deferReply();

    let avatarPayload: string | null = null;
    if (imageUrl) {
      try {
        avatarPayload = await downloadAndProcessImage(imageUrl);
      } catch (e: any) {
        await ctx.editOrReply(errorCard(`Failed to process image: ${e.message}`).toMessage());
        return;
      }
    }

    const botToken = process.env.DISCORD_TOKEN;
    const apiUrl = `https://discord.com/api/v10/guilds/${ctx.guildId}/members/@me`;

    const payload = {
      avatar: avatarPayload,
    };

    try {
      const resp = await fetch(apiUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (resp.ok) {
        if (avatarPayload === null) {
          await ctx.editOrReply(successCard(`${E.OK} Successfully reset the bot's server avatar!`).toMessage());
        } else {
          await ctx.editOrReply(successCard(`${E.OK} Successfully updated the bot's server avatar!`).toMessage());
        }
      } else {
        const errText = await resp.text();
        await ctx.editOrReply(errorCard(`Discord API rejected the avatar: ${errText}`).toMessage());
      }
    } catch (e: any) {
      await ctx.editOrReply(errorCard('Failed to connect to Discord API.').toMessage());
    }
  }
}
