import { createEvent } from 'seyfert';
import { appState } from '../state';
import { nowSecs } from '../db';
import {
  afkMentionedCard,
  afkMentionsDmCard,
  afkWelcomeBackCard,
  formatAfkDuration,
  storeReturnedMentions,
} from '../cards/afk';
import { logger } from '../logging';

const log = logger('afk');

export default createEvent({
  data: { name: 'messageCreate', once: false },
  async run(message, client) {
    if (!message || !message.author) return;

    const authorId = String(message.author.id || '').trim();
    const currentGuildId = message.guildId ? String(message.guildId).trim() : undefined;
    const isBot = Boolean(message.author.bot);

    log.info(
      `[messageCreate] Message from ${message.author.username || 'unknown'} (${authorId}), bot=${isBot}, guild=${currentGuildId || 'DM'}, content="${message.content || ''}"`,
    );

    if (isBot) return;

    const state = appState();

    // ── 1. Check if the author is returning from AFK ────────────────────────────
    log.info(
      `[messageCreate] Checking AFK for ${authorId}: has=${state.db.afkUsers.has(authorId)}, total AFK users=${state.db.afkUsers.size}`,
    );

    if (state.db.afkUsers.has(authorId)) {
      const afkData = state.db.afkUsers.get(authorId)!;

      // If AFK is server-scoped, only trigger in that specific server
      const isMatchingScope = afkData.scope === 'global' || afkData.scope === currentGuildId;

      if (isMatchingScope) {
        log.info(`[messageCreate] User ${message.author.username} (${authorId}) returning from AFK!`);
        state.db.afkUsers.delete(authorId);
        state.db.save();

        // Stash the collected mentions in memory for DM delivery buttons
        storeReturnedMentions(authorId, afkData.mentions);

        const timeAgo = nowSecs() - afkData.timestamp;
        const durationStr = formatAfkDuration(timeAgo);
        const avatar = message.author.avatarURL() ?? message.author.defaultAvatarURL();

        let autoDMed = false;

        // If DM mentions was enabled on setup, auto-dispatch the summary
        if (afkData.dmMentions && afkData.mentions.length > 0) {
          try {
            const dmCard = afkMentionsDmCard({
              username: message.author.username,
              avatarUrl: avatar,
              mentions: afkData.mentions,
            });
            await client.users.write(authorId, dmCard.toMessage());
            autoDMed = true;
          } catch {
            // User might have closed DMs from server members
            autoDMed = false;
          }
        }

        const welcomeCard = afkWelcomeBackCard({
          userId: authorId,
          avatarUrl: avatar,
          reason: afkData.reason,
          durationStr,
          mentionsCount: afkData.mentions.length,
          autoDMed,
        });

        try {
          await message.reply({
            ...welcomeCard.toMessage(),
            allowed_mentions: { replied_user: false, parse: [] },
          });
          log.info(`[messageCreate] Successfully replied with welcomeCard to ${authorId}`);
        } catch (err) {
          log.warn(`[messageCreate] Failed to reply with welcomeCard to ${authorId}, falling back to channel write:`, err);
          try {
            await client.messages.write(message.channelId, {
              ...welcomeCard.toMessage(),
              allowed_mentions: { replied_user: false, parse: [] },
            });
            log.info(`[messageCreate] Successfully sent welcomeCard via channel write to ${message.channelId}`);
          } catch (writeErr) {
            log.error('[messageCreate] Failed to write welcomeCard to channel:', writeErr);
          }
        }
      }
    }

    // ── 2. Check if any mentioned user is AFK ──────────────────────────────────
    const mentionedIds = new Set<string>();

    if (Array.isArray(message.mentions?.users)) {
      for (const user of message.mentions.users) {
        const uId = String(user.id ?? (user as any).user?.id ?? '').trim();
        if (uId && uId !== authorId) mentionedIds.add(uId);
      }
    }

    // Check raw gateway mentions if available
    const rawMentions = (message as any).raw?.mentions;
    if (Array.isArray(rawMentions)) {
      for (const rawUser of rawMentions) {
        const rId = String(rawUser.id || '').trim();
        if (rId && rId !== authorId) mentionedIds.add(rId);
      }
    }

    // Fallback regex matching for mentions in message content
    if (typeof message.content === 'string') {
      const mentionRegex = /<@!?(\d+)>/g;
      let match: RegExpExecArray | null;
      // biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec loop idiom
      while ((match = mentionRegex.exec(message.content)) !== null) {
        const mId = String(match[1] || '').trim();
        if (mId && mId !== authorId) mentionedIds.add(mId);
      }
    }

    if (mentionedIds.size === 0) return;

    log.info(`[messageCreate] Mentioned user IDs in message: ${[...mentionedIds].join(', ')}`);

    // Resolve guild name for nice display in mentions
    let guildName = 'Server';
    if (currentGuildId) {
      const cached = await client.cache.guilds?.get(currentGuildId);
      if (cached?.name) guildName = cached.name;
    }

    for (const id of mentionedIds) {
      if (state.db.afkUsers.has(id)) {
        const afkData = state.db.afkUsers.get(id)!;

        // If this user is only AFK in another server, ignore this mention
        if (afkData.scope !== 'global' && afkData.scope !== currentGuildId) {
          continue;
        }

        log.info(`[messageCreate] Mention of AFK user ${id} detected from ${message.author.username}`);

        // Record this mention
        afkData.mentions.push({
          authorId: message.author.id,
          authorName: message.author.username,
          guildId: currentGuildId ?? '',
          guildName,
          channelId: message.channelId,
          messageId: message.id,
          content: message.content || '[Attachment/No text]',
          timestamp: nowSecs(),
        });

        // Cap at 25 mentions per user to prevent unbounded state
        if (afkData.mentions.length > 25) {
          afkData.mentions.shift();
        }
        state.db.save();

        let avatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
        const inMentions = message.mentions?.users?.find((u) => u.id === id);
        if (inMentions && 'avatarURL' in inMentions && typeof inMentions.avatarURL === 'function') {
          avatar = inMentions.avatarURL() ?? (inMentions as any).defaultAvatarURL?.() ?? avatar;
        } else {
          try {
            const user = await client.users.fetch(id);
            if (user) avatar = user.avatarURL() ?? user.defaultAvatarURL();
          } catch {
            // fallback default
          }
        }

        const mentionedCard = afkMentionedCard({
          userId: id,
          avatarUrl: avatar,
          reason: afkData.reason,
          timestamp: afkData.timestamp,
          scope: afkData.scope,
        });

        try {
          await message.reply({
            ...mentionedCard.toMessage(),
            allowed_mentions: { replied_user: false, parse: [] },
          });
          log.info(`[messageCreate] Successfully replied with mentionedCard for AFK user ${id}`);
        } catch (err) {
          log.warn(`[messageCreate] Failed to reply with mentionedCard for user ${id}, falling back to channel write:`, err);
          try {
            await client.messages.write(message.channelId, {
              ...mentionedCard.toMessage(),
              allowed_mentions: { replied_user: false, parse: [] },
            });
            log.info(`[messageCreate] Successfully sent mentionedCard via channel write for AFK user ${id}`);
          } catch (writeErr) {
            log.error('[messageCreate] Failed to write mentionedCard to channel:', writeErr);
          }
        }
      }
    }
  },
});
