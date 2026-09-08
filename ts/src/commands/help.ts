import { Declare, Command, type CommandContext } from 'seyfert';
import { FadeResponse, ButtonStyle } from '../components/v2';
import { appState } from '../state';
import { useClient } from '../client';
import { E } from '../components/emoji';

@Declare({
  name: 'help',
  description: 'Explore all the commands available to you.',
})
export default class HelpCommand extends Command {
  override async run(ctx: CommandContext) {
    const client = useClient();
    const botUser = client.me;
    const botAvatar = botUser.avatarURL() ?? botUser.defaultAvatarURL();

    let pfx = appState().config.bot.prefix;
    if (ctx.guildId) {
      const customPrefix = appState().db.guildPrefixes.get(ctx.guildId);
      if (customPrefix) pfx = customPrefix;
    }

    const headerText = `${E.BRAND} **${botUser.username} Help Center**\nExplore all the commands available to you.\n\n${E.SPARK} **Server Prefix:** \`${pfx}\``;

    const musicCmds = `${E.MUSIC} **Music & Audio**\n> \`play\` \`pause\` \`resume\` \`skip\` \`stop\` \`queue\`\n> \`nowplaying\` \`volume\` \`seek\` \`loop\` \`shuffle\`\n> \`remove\` \`move\` \`clear\` \`lyrics\` \`join\` \`leave\``;
    
    const utilCmds = `${E.SETTINGS} **Utility & Config**\n> \`ping\` \`info\` \`avatar\` \`serveravatar\` \`serverbanner\`\n> \`serverbio\` \`24/7\` \`premium\` \`noprefix\` \`setprefix\``;

    const response = new FadeResponse()
      .container(undefined, c => c
        .section(s => s
          .text(headerText)
          .thumbnail(botAvatar)
        )
        .separator(true)
        .text(musicCmds)
        .separator(false)
        .text(utilCmds)
        .actionRow(r => r
          .buttonEmoji('help_docs', 'Documentation', ButtonStyle.Secondary, '📚')
          .link('https://discord.com/invite/SmdUGNXjYv', 'Support Server')
        )
      );

    await ctx.write(response.toMessage());
  }
}
