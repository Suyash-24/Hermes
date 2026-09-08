import { Declare, Command, type CommandContext } from 'seyfert';
import { FadeResponse } from '../components/v2';
import { header, hint, stat, subheader, E } from '../components/emoji';
import { useClient } from '../client';

// We need the version from package.json
// Normally we could import it directly but with CommonJS and TS, require is safer.
const { version } = require('../../package.json');

@Declare({
  name: 'info',
  description: 'Show bot and server statistics.',
})
export default class InfoCommand extends Command {
  override async run(ctx: CommandContext) {
    const client = useClient();
    const botUser = client.me;
    
    // In Seyfert, guild caches are async or accessible via gateway/memory
    const guildCount = await client.cache.guilds?.count() ?? 0;
    
    const guild = ctx.guildId ? await client.cache.guilds?.get(ctx.guildId) : undefined;
    const guildName = guild ? guild.name : 'Direct Message';
    const memberCount = guild ? guild.memberCount : 0;
    
    const botAvatar = botUser.avatarURL() ?? botUser.defaultAvatarURL();
    
    const response = new FadeResponse()
      .container(undefined, c => c
        .section(s => s
          .text(header(E.BRAND, botUser.username))
          .text(hint(`v${version} ${E.DOT} shard #${ctx.shardId}`))
          .thumbnail(botAvatar)
        )
        .separator(true)
        .text(subheader('Bot'))
        .text(
          `${stat(E.SERVERS, 'Servers', `${guildCount}`)}\n` +
          `${stat(E.LATENCY, 'Shard', `#${ctx.shardId}`)}\n` +
          `${stat(E.VERSION, 'Version', `v${version}`)}`
        )
        .separator(false)
        .text(subheader(guildName))
        .text(
          `${stat(E.MEMBERS, 'Members', `${memberCount}`)}\n` +
          `${stat(E.BOOSTS, 'Boost tier', guild ? `${guild.premiumTier}` : '0')}`
        )
        .separator(true)
        .actionRow(r => r
          .link('https://github.com/Suyash-24/Hermes', 'Source')
        )
      );

    await ctx.write(response.toMessage());
  }
}
