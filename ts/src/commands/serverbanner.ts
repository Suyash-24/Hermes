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
  name: 'serverbanner',
  description: 'Change the bot\'s server-specific banner (Premium feature).',
})
@Options(options)
export default class ServerBannerCommand extends Command {
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

    let bannerPayload: string | null = null;
    if (imageUrl) {
      try {
        bannerPayload = await downloadAndProcessImage(imageUrl);
      } catch (e: any) {
        await ctx.editOrReply(errorCard(`Failed to process image: ${e.message}`).toMessage());
        return;
      }
    }

    const botToken = process.env.DISCORD_TOKEN;
    const apiUrl = `https://discord.com/api/v10/guilds/${ctx.guildId}/members/@me`;

    const payload = {
      banner: bannerPayload,
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
        if (bannerPayload === null) {
          await ctx.editOrReply(successCard(`${E.OK} Successfully reset the bot's server banner!`).toMessage());
        } else {
          await ctx.editOrReply(successCard(`${E.OK} Successfully updated the bot's server banner!`).toMessage());
        }
      } else {
        const errText = await resp.text();
        await ctx.editOrReply(errorCard(`Discord API rejected the banner: ${errText}`).toMessage());
      }
    } catch (e: any) {
      await ctx.editOrReply(errorCard('Failed to connect to Discord API.').toMessage());
    }
  }
}
