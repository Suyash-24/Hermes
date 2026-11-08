/**
 * `/utility help` — the command card.
 *
 * Renders the full slash command structure. Keep this in sync with the
 * group directories under `src/commands/` — the structure mirrors it.
 */
import { Declare, SubCommand, type CommandContext } from 'seyfert';
import { FadeResponse } from '../../components/v2';
import { header, subheader, Colour, E } from '../../components/emoji';
import { useClient } from '../../client';

@Declare({
  name: 'help',
  description: 'Explore all the commands available to you.',
})
export default class HelpCommand extends SubCommand {
  override async run(ctx: CommandContext) {
    const client = useClient();
    const botUser = client.me;
    const botAvatar = botUser.avatarURL() ?? botUser.defaultAvatarURL();

    const intro = `${E.BRAND} **${botUser.username} Help Center**\nExplore every command, organized by category.`;

    const music = `${E.MUSIC} **Music**\n> \`play\` \`pause\` \`resume\` \`skip\` \`stop\` \`nowplaying\`\n> \`seek\` \`volume\` \`loop\` \`shuffle\` \`join\` \`leave\`\n> \`autoplay\` \`24-7\` \`lyrics\` \`filter\``;
    const queue = `${E.QUEUE} **Queue**\n> \`show\` \`clear\` \`remove\` \`move\``;
    const utility = `${E.SETTINGS} **Utility**\n> \`help\` \`info\` \`ping\` \`avatar\`\n> \`serveravatar\` \`serverbanner\` \`serverbio\``;
    const manage = `${E.LOCK} **Server Setup**\n> \`ignorechannel\` \`bindchannel\` \`adminbypass\``;
    const extras = `${E.SPARK} **More**\n> \`/premium\` — check or claim server premium\n> \`/afk\` — set an away status that mentions reply to`;

    const response = new FadeResponse().container(Colour.FADE, (c) =>
      c
        .section((s) =>
          s.text(header(E.BRAND, botUser.username)).text(subheader('Help Center')).thumbnail(botAvatar),
        )
        .separator(true)
        .text(intro)
        .separator(true)
        .text(music)
        .separator(false)
        .text(queue)
        .separator(false)
        .text(utility)
        .separator(false)
        .text(manage)
        .separator(false)
        .text(extras)
        .separator(true)
        .text(`> ${E.SPARK} Type \`/\` in chat to see every command live, with descriptions.`)
        .actionRow((r) => r.link('https://discord.com/invite/SmdUGNXjYv', 'Support Server')),
    );

    await ctx.write(response.toMessage());
  }
}
