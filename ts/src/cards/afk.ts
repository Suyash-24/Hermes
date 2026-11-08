/**
 * AFK response cards.
 *
 * Components V2 card designs for:
 *   - `/afk` setup card with interactive buttons (toggle Scope, toggle DM, cancel)
 *   - Mentions notification card when someone pings an AFK user
 *   - Welcome back card when the user speaks again
 *   - Direct message summary card containing collected mentions
 */
import { E, hint } from '../components/emoji';
import { ButtonStyle, FadeResponse, response } from '../components/v2';
import type { AfkMention } from '../db';
import { truncate } from './common';

/** In-memory cache of recently returned users' mentions (kept for 1 hour for DM delivery). */
export const returnedAfkMentions = new Map<string, { mentions: AfkMention[]; expiresAt: number }>();

export function storeReturnedMentions(userId: string, mentions: AfkMention[]): void {
  returnedAfkMentions.set(userId, {
    mentions,
    expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
  });
}

export function getReturnedMentions(userId: string): AfkMention[] | undefined {
  const item = returnedAfkMentions.get(userId);
  if (!item) return undefined;
  if (Date.now() > item.expiresAt) {
    returnedAfkMentions.delete(userId);
    return undefined;
  }
  return item.mentions;
}

export function formatAfkDuration(secs: number): string {
  if (secs < 60) return `${Math.max(secs, 1)} seconds`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export interface AfkSetCardOptions {
  userId: string;
  avatarUrl: string;
  reason: string;
  timestamp: number;
  scope: 'global' | string;
  guildName?: string;
  dmMentions: boolean;
}

/** Card rendered when a user sets AFK. */
export function afkSetCard(opts: AfkSetCardOptions): FadeResponse {
  const isGlobal = opts.scope === 'global';

  return response().container(undefined, (c) =>
    c
      .section((s) =>
        s
          .text(`## ${E.AFK_SET} AFK Status Set`)
          .text(`*Your away status is active.*\n*I'll notify anyone who mentions you.*`)
          .thumbnail(opts.avatarUrl),
      )
      .separator(true)
      .text(
        `> ${E.SHINE} **Reason** • **${truncate(opts.reason, 100)}**\n` +
          `> ${E.CLOCK} **Marked at** • <t:${opts.timestamp}:t> (<t:${opts.timestamp}:R>)`,
      )
      .actionRow((r) =>
        r
          .buttonEmoji(
            `afk_scope:${opts.userId}`,
            isGlobal ? 'Global' : 'Server',
            ButtonStyle.Secondary,
            isGlobal ? '🌐' : '🏠',
          )
          .buttonEmoji(
            `afk_dm:${opts.userId}`,
            opts.dmMentions ? 'DMs: ON' : 'DMs: OFF',
            opts.dmMentions ? ButtonStyle.Success : ButtonStyle.Secondary,
            opts.dmMentions ? '🔔' : '🔕',
          ),
      ),
  );
}

export interface AfkMentionedCardOptions {
  userId: string;
  avatarUrl: string;
  reason: string;
  timestamp: number;
  scope: 'global' | string;
}

/** Card rendered in channel when an AFK user is mentioned. */
export function afkMentionedCard(opts: AfkMentionedCardOptions): FadeResponse {
  return response().container(undefined, (c) =>
    c
      .section((s) =>
        s
          .text(`## ${E.IS_AFK} User is AFK`)
          .text(`<@${opts.userId}> is currently away.\n*Might not respond immediately.*`)
          .thumbnail(opts.avatarUrl),
      )
      .separator(true)
      .text(
        `> ${E.SHINE} **Reason** • **${truncate(opts.reason, 100)}**\n` +
          `> ${E.CLOCK} **Went AFK** • <t:${opts.timestamp}:R>`,
      ),
  );
}

export interface AfkWelcomeBackOptions {
  userId: string;
  avatarUrl: string;
  reason: string;
  durationStr: string;
  mentionsCount: number;
  autoDMed?: boolean;
}

/** Card rendered when an AFK user returns. */
export function afkWelcomeBackCard(opts: AfkWelcomeBackOptions): FadeResponse {
  const dmNote = opts.autoDMed
    ? `\n> 📬 *A summary of your mentions has been sent directly to your DMs.*`
    : '';

  return response().container(undefined, (c) => {
    c.section((s) =>
      s
        .text(`## ${E.AFK_REMOVE} Welcome back!`)
        .text(`*The hero returns.*\n*The void has released you.*`)
        .thumbnail(opts.avatarUrl),
    )
      .separator(true)
      .text(
        `> ${E.SHINE} **Away for** • \`${opts.durationStr}\`\n` +
          `> ${E.SHINE} **Reason was** • **${truncate(opts.reason, 100)}**\n` +
          `> ${E.SHINE} **Mentions** • \`${opts.mentionsCount}\` mention${opts.mentionsCount === 1 ? '' : 's'} recorded while away${dmNote}`,
      );

    c.actionRow((r) => {
      if (opts.mentionsCount > 0) {
        r.buttonEmoji(`afk_send_dm:${opts.userId}`, 'Send Mentions to DM', ButtonStyle.Primary, '📬');
      }
      r.button('afk_dismiss', 'Dismiss', ButtonStyle.Secondary);
      return r;
    });
  });
}

export interface AfkMentionsDmOptions {
  username: string;
  avatarUrl: string;
  mentions: AfkMention[];
}

/** Card sent to direct messages listing collected mentions. */
export function afkMentionsDmCard(opts: AfkMentionsDmOptions): FadeResponse {
  const maxShown = Math.min(opts.mentions.length, 10);
  const shown = opts.mentions.slice(-maxShown).reverse(); // newest first

  const lines: string[] = [];
  for (const m of shown) {
    const jump = `https://discord.com/channels/${m.guildId}/${m.channelId}/${m.messageId}`;
    const preview = truncate(m.content || '[Attachment/No content]', 120);
    lines.push(
      `• <@${m.authorId}> in **${truncate(m.guildName, 25)}** (<#${m.channelId}>) — <t:${m.timestamp}:R>\n` +
        `> ${preview}\n` +
        `> [Jump to message](${jump})`,
    );
  }

  const moreCount = opts.mentions.length - maxShown;
  const moreText = moreCount > 0 ? `\n*…and ${moreCount} more mention(s).*` : '';

  return response().container(undefined, (c) =>
    c
      .section((s) =>
        s
          .text(`## 📬 AFK Mentions Summary`)
          .text(`*Here are the messages where you were mentioned while you were away:*`)
          .thumbnail(opts.avatarUrl),
      )
      .separator(true)
      .text(lines.join('\n\n') + moreText)
      .separator(false)
      .text(hint(`Fade AFK System • Total mentions: ${opts.mentions.length}`)),
  );
}
