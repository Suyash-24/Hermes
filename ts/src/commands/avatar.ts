import { Declare, Command, type CommandContext, Options, createStringOption, createUserOption } from 'seyfert';
import { FadeResponse, ButtonStyle } from '../components/v2';
import { header, stat, E } from '../components/emoji';

const options = {
  user: createUserOption({
    description: 'The user to get the avatar of',
    required: false,
  }),
};

@Declare({
  name: 'avatar',
  description: 'Display a user\'s avatar in full resolution.',
})
@Options(options)
export default class AvatarCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    const targetUser = ctx.options.user ?? ctx.author;
    let guildAvatar: string | undefined;

    if (ctx.guildId) {
      try {
        const member = ctx.options.user 
            ? await ctx.client.members.fetch(ctx.guildId, targetUser.id)
            : ctx.member;
        
        if (member) {
          const url = member.avatarURL();
          if (url) {
            guildAvatar = url.replace('size=1024', 'size=4096');
          }
        }
      } catch (err) {
        // Ignored
      }
    }

    const displayName = targetUser.globalName || targetUser.username;
    const baseUrl = targetUser.avatarURL() || targetUser.defaultAvatarURL();
    
    // Attempt to convert webp to png/gif
    let pngHd = baseUrl.replace('size=1024', 'size=4096').replace('.webp', '.png');
    // If avatar starts with a_ it is animated. Seyfert handles it in avatarURL(true)? 
    // Usually discord urls end with .gif if animated
    let mainUrl = baseUrl;
    if (baseUrl.includes('.webp')) {
      if (targetUser.avatar?.startsWith('a_')) {
        mainUrl = baseUrl.replace('size=1024', 'size=4096').replace('.webp', '.gif');
      } else {
        mainUrl = pngHd;
      }
    } else {
      mainUrl = baseUrl.replace('size=1024', 'size=4096');
    }

    const response = new FadeResponse()
      .container(undefined, c => {
        c.text(header(E.BRAND, displayName))
         .text(stat(E.ID, 'User ID', targetUser.id))
         .separator(true)
         .mediaGallery(g => g.item(mainUrl, undefined))
         .separator(true);

        c.actionRow(r => {
          r.link(mainUrl, 'View Avatar');
          if (guildAvatar) {
            r.button(`avatar_SERVER_${targetUser.id}`, 'Server Avatar', ButtonStyle.Primary);
          }
          return r;
        });
        return c;
      });

    await ctx.write(response.toMessage());
  }
}
