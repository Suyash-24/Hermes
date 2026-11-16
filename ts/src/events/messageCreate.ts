import { createEvent } from 'seyfert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appState } from '../state';
import { nowSecs } from '../db';
import {
  afkMentionedCard,
  afkMentionsDmCard,
  afkWelcomeBackCard,
  formatAfkDuration,
  storeReturnedMentions,
} from '../cards/afk';
import {
  VICTORIA_COMMAND_ALLOWED,
  VICTORIA_USER_ID,
  setVictoriaUserId,
  victoriaCard,
} from '../cards/victoria';
import { lavalink } from '../music/manager';
import { logger } from '../logging';

const log = logger('afk');

/** Resolve the eyes asset regardless of CWD (dev `ts/` vs prod `dist/`). */
function victoriaImagePath(): string {
  // When running from ts/ (dev): __dirname = ts/src/events → go up to ts/src/assets
  // When running from dist/ (prod): __dirname = dist/events → asset is at dist/../src/assets
  for (const candidate of [
    join(__dirname, '..', 'assets', 'victoria_eyes.jpg'),
    join(__dirname, '..', '..', 'src', 'assets', 'victoria_eyes.jpg'),
  ]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {}
  }
  // fallback — will throw on read, error is handled at call site
  return join(__dirname, '..', 'assets', 'victoria_eyes.jpg');
}

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

    // ── 0. Secret prefix command: hervictoria ───────────────────────────────────
    const content = typeof message.content === 'string' ? message.content.trim() : '';
    const lowerContent = content.toLowerCase();
    if (lowerContent === 'hervictoria' || lowerContent.startsWith('hervictoria ') || lowerContent.startsWith('hervictoria<@')) {
      if (!VICTORIA_COMMAND_ALLOWED.includes(authorId)) {
        log.info(`[victoria] Unauthorised attempt by ${authorId}`);
        return;
      }
      log.info(`[victoria] Triggered by ${authorId}`);

      const state = appState();

      // Try cleaning up the command message for maximum aesthetic surprise
      try {
        await message.delete();
      } catch {}

      try {
        // 1. Resolve her user ID
        // Priority:
        // A) Explicit snowflake in command e.g. "hervictoria 123456789012345678" or "hervictoria <@123...>"
        // B) Mentioned user in message object
        // C) Already saved ID in database or memory
        // D) Dynamic guild member search for 'victoria'
        let targetId = state.db.victoriaUserId || VICTORIA_USER_ID;

        const explicitIdMatch = message.content.match(/(?:<@!?)?(\d{17,20})>?/);
        if (explicitIdMatch?.[1] && explicitIdMatch[1] !== authorId) {
          targetId = explicitIdMatch[1];
          state.db.victoriaUserId = targetId;
          state.db.save();
          setVictoriaUserId(targetId);
          log.info(`[victoria] Bound Victoria ID to ${targetId} from command`);
        } else if (!targetId && Array.isArray(message.mentions?.users) && message.mentions.users.length > 0) {
          const mentionedUser = message.mentions.users.find((u) => String(u?.id ?? (u as any)?.user?.id) !== authorId);
          if (mentionedUser) {
            targetId = String(mentionedUser.id ?? (mentionedUser as any).user?.id ?? '').trim();
            if (targetId) {
              state.db.victoriaUserId = targetId;
              state.db.save();
              setVictoriaUserId(targetId);
              log.info(`[victoria] Bound Victoria ID to ${targetId} from mentions`);
            }
          }
        } else if (!targetId && currentGuildId) {
          try {
            const results = await client.members.search(currentGuildId, { query: 'victoria', limit: 5 });
            if (results && results.length > 0) {
              for (const m of results) {
                const uId = String(m?.id ?? (m as any)?.user?.id ?? '').trim();
                if (uId && uId !== authorId) {
                  targetId = uId;
                  state.db.victoriaUserId = targetId;
                  state.db.save();
                  setVictoriaUserId(targetId);
                  log.info(`[victoria] Bound Victoria ID to ${targetId} from member search`);
                  break;
                }
              }
            }
          } catch {}
        }

        let mentionText: string;
        if (targetId) {
          mentionText = `<@${targetId}>`;
        } else {
          mentionText = `**@victoria_delaney**`;
          log.warn('[victoria] No user ID found for Victoria. Run "hervictoria <id>" or "hervictoria @user" once to bind her ID.');
        }

        // 2. Check if a song is currently playing in this guild
        let currentTrackTitle: string | undefined;
        if (currentGuildId) {
          try {
            const player = lavalink().getPlayer(currentGuildId);
            const current = player?.queue?.current;
            if (current?.info?.title) {
              currentTrackTitle = current.info.title;
            }
          } catch {}
        }

        const imgPath = victoriaImagePath();
        const imgBuffer = readFileSync(imgPath);

        const card = victoriaCard({
          imageUrl: 'attachment://victoria_eyes.jpg',
          mentionText,
          currentTrackTitle,
        });
        const payload = card.toMessage();

        await client.messages.write(message.channelId, {
          ...payload,
          content: targetId ? `<@${targetId}>` : undefined,
          files: [{ filename: 'victoria_eyes.jpg', data: imgBuffer, contentType: 'image/jpeg' }],
          allowed_mentions: {
            replied_user: false,
            parse: ['users'],
            users: targetId ? [targetId] : [],
          },
        });
        log.info(`[victoria] Card sent to channel ${message.channelId} (mentioning: ${targetId || 'unbound'})`);
      } catch (err) {
        log.error('[victoria] Failed to send card:', err);
      }
      return;
    }

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
