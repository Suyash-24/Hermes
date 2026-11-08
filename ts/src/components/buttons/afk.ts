import { ComponentCommand, type ComponentContext } from 'seyfert';
import { appState } from '../../state';
import { errorCard, successCard, infoCard } from '../../cards/common';
import {
  afkMentionsDmCard,
  afkSetCard,
  getReturnedMentions,
} from '../../cards/afk';

export default class AfkButtons extends ComponentCommand {
  componentType = 'Button' as const;

  override filter(ctx: ComponentContext<typeof this.componentType>) {
    return ctx.customId.startsWith('afk_');
  }

  override async run(ctx: ComponentContext<typeof this.componentType>) {
    const customId = ctx.customId;

    // ── 1. Dismiss welcome / notice card ─────────────────────────────────────────
    if (customId === 'afk_dismiss') {
      try {
        await ctx.message.delete();
      } catch {
        await ctx.deferUpdate();
      }
      return;
    }

    const [action, targetUserId] = customId.split(':');

    // Security check: only the relevant AFK user can click these controls
    if (targetUserId && ctx.author.id !== targetUserId) {
      await ctx.editOrReply(
        errorCard('Only the user this AFK card belongs to can interact with these controls.').toMessage(),
      );
      return;
    }

    const state = appState();

    // ── 2. Send mentions to DM ──────────────────────────────────────────────────
    if (action === 'afk_send_dm') {
      const mentions =
        getReturnedMentions(ctx.author.id) ??
        state.db.afkUsers.get(ctx.author.id)?.mentions;

      if (!mentions || mentions.length === 0) {
        await ctx.editOrReply(
          infoCard('No recorded mentions were found to deliver.').toMessage(),
        );
        return;
      }

      try {
        const userAvatar = ctx.author.avatarURL() ?? ctx.author.defaultAvatarURL();
        const dmCard = afkMentionsDmCard({
          username: ctx.author.username,
          avatarUrl: userAvatar,
          mentions,
        });

        await ctx.client.users.write(ctx.author.id, dmCard.toMessage());
        await ctx.editOrReply(
          successCard('Dispatched your mentions summary to your DMs!').toMessage(),
        );
      } catch {
        await ctx.editOrReply(
          errorCard('Could not send you a direct message. Please ensure your DMs are open to server members.').toMessage(),
        );
      }
      return;
    }

    // ── 3. Controls for the active AFK configuration card ───────────────────────
    const afkData = state.db.afkUsers.get(ctx.author.id);
    if (!afkData) {
      await ctx.editOrReply(
        infoCard('You are no longer marked as AFK.').toMessage(),
      );
      return;
    }

    // Toggle Scope: Global <-> Server-Only
    if (action === 'afk_scope') {
      if (afkData.scope === 'global') {
        if (!ctx.guildId) {
          await ctx.editOrReply(
            errorCard('Server-only AFK can only be enabled inside a server channel.').toMessage(),
          );
          return;
        }
        let guildName = afkData.guildName;
        if (!guildName) {
          const cached = await ctx.client.cache.guilds?.get(ctx.guildId);
          guildName = cached?.name;
        }
        afkData.scope = ctx.guildId;
        afkData.guildName = guildName;
      } else {
        afkData.scope = 'global';
      }

      state.db.save();

      const userAvatar = ctx.author.avatarURL() ?? ctx.author.defaultAvatarURL();
      const updatedCard = afkSetCard({
        userId: ctx.author.id,
        avatarUrl: userAvatar,
        reason: afkData.reason,
        timestamp: afkData.timestamp,
        scope: afkData.scope,
        guildName: afkData.guildName,
        dmMentions: afkData.dmMentions,
      });

      await ctx.update(updatedCard.toMessage());
      return;
    }

    // Toggle DM Mentions: ON <-> OFF
    if (action === 'afk_dm') {
      afkData.dmMentions = !afkData.dmMentions;
      state.db.save();

      const userAvatar = ctx.author.avatarURL() ?? ctx.author.defaultAvatarURL();
      const updatedCard = afkSetCard({
        userId: ctx.author.id,
        avatarUrl: userAvatar,
        reason: afkData.reason,
        timestamp: afkData.timestamp,
        scope: afkData.scope,
        guildName: afkData.guildName,
        dmMentions: afkData.dmMentions,
      });

      await ctx.update(updatedCard.toMessage());
      return;
    }

    // Clear AFK directly from card
    if (action === 'afk_clear') {
      state.db.afkUsers.delete(ctx.author.id);
      state.db.save();

      await ctx.update(
        successCard('Your AFK status has been cancelled and removed.').toMessage(),
      );
      return;
    }
  }
}
