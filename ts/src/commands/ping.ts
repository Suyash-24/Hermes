import { Declare, Command, type CommandContext } from 'seyfert';
import { FadeResponse, ButtonStyle } from '../components/v2';
import { stat, E } from '../components/emoji';
import { useClient } from '../client';

@Declare({
  name: 'ping',
  description: 'Check the bot\'s gateway latency.',
})
export default class PingCommand extends Command {
  override async run(ctx: CommandContext) {
    const client = useClient();
    const latency = client.gateway.latency ?? 'N/A';
    
    const response = new FadeResponse()
      .container(undefined, c => c
        .text(`## ${E.BRAND} Pong!`)
        .text(stat(E.LATENCY, 'Latency', `${latency} ms`))
        .actionRow(r => r
          .buttonEmoji('ping_refresh', 'Refresh', ButtonStyle.Secondary, E.REFRESH)
        )
      );

    await ctx.write(response.toMessage());
  }
}
