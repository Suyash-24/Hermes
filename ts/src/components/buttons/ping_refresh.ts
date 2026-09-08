import { ComponentCommand, type ComponentContext } from 'seyfert';
import { FadeResponse, ButtonStyle } from '../../components/v2';
import { stat, E } from '../../components/emoji';
import { useClient } from '../../client';

export default class PingRefresh extends ComponentCommand {
  componentType = 'Button' as const;

  override filter(ctx: ComponentContext<typeof this.componentType>) {
    return ctx.customId === 'ping_refresh';
  }

  override async run(ctx: ComponentContext<typeof this.componentType>) {
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

    await ctx.editOrReply(response.toMessage());
  }
}
