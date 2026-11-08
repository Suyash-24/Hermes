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

export default createEvent({
  data: { name: 'messageCreate', once: false },
  async run(message, client) {
    if (message.author.bot) return;

    const state = appState();
    const authorId = message.author.id;
    const currentGuildId = message.guildId;

    // ── 1. Check if the author is returning from AFK ────────────────────────────
    if (state.db.afkUsers.has(authorId)) {
      const afkData = state.db.afkUsers.get(authorId)!;

      // If AFK is server-scoped, only trigger in that specific server
      const isMatchingScope = afkData.scope === 'global' || afkData.scope === currentGuildId;

      if (isMatchingScope) {
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
        } catch {
          // Ignore if unable to reply
        }
      }
    }

    // ── 2. Check if any mentioned user is AFK ──────────────────────────────────
    const mentionedIds = new Set<string>();

    if (Array.isArray(message.mentions?.users)) {
      for (const user of message.mentions.users) {
        if (user.id && user.id !== authorId) mentionedIds.add(user.id);
      }
    }

    // Fallback regex matching for mentions in message content
    const mentionRegex = /<@!?(\d+)>/g;
    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec loop idiom
    while ((match = mentionRegex.exec(message.content)) !== null) {
      if (match[1] && match[1] !== authorId) mentionedIds.add(match[1]);
    }

    if (mentionedIds.size === 0) return;

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
        } catch {
          // Ignore
        }
      }
    }
  },
});
