import { createEvent } from 'seyfert';
import { appState } from '../state';
import { E } from '../components/emoji';
import { FadeResponse } from '../components/v2';
import { nowSecs } from '../db';

export default createEvent({
  data: { name: 'messageCreate', once: false },
  async run(message, client) {
    if (message.author.bot) return;

    const state = appState();
    const authorId = message.author.id;

    // Check if the author is AFK and remove it
    if (state.db.afkUsers.has(authorId)) {
      const afkData = state.db.afkUsers.get(authorId)!;
      state.db.afkUsers.delete(authorId);
      state.db.save();

      const timeAgo = nowSecs() - afkData.timestamp;
      const durationStr = formatDuration(timeAgo);
      const avatar = message.author.avatarURL() ?? message.author.defaultAvatarURL();

      const response = new FadeResponse().container(undefined, c => c
        .section(s => s
          .text(`## ${E.AFK_REMOVE} Welcome back!`)
          .text(`*The hero returns.*\n*The void has released you.*`)
          .thumbnail(avatar)
        )
        .separator(true)
        .text(`> ${E.SHINE} **Away for** • \`${durationStr}\`\n> ${E.SHINE} **Reason was** • **${afkData.reason}**`)
      );

      try {
        await message.reply({
          ...response.toMessage(),
          allowed_mentions: { replied_user: false, parse: [] },
        });
      } catch (e) {
        // Ignore if unable to reply
      }
    }

    // Check if any mentioned user is AFK
    const mentionedIds = new Set<string>();
    
    // Check message.mentions.users if available
    if (Array.isArray(message.mentions?.users)) {
      for (const user of message.mentions.users) {
        if (user.id && user.id !== authorId) mentionedIds.add(user.id);
      }
    }

    // Fallback regex matching for mentions in content
    const mentionRegex = /<@!?(\d+)>/g;
    let match;
    while ((match = mentionRegex.exec(message.content)) !== null) {
      if (match[1] && match[1] !== authorId) mentionedIds.add(match[1]);
    }

    for (const id of mentionedIds) {
      if (state.db.afkUsers.has(id)) {
        const afkData = state.db.afkUsers.get(id)!;
        
        let avatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
        const inMentions = message.mentions?.users?.find(u => u.id === id);
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

        const response = new FadeResponse().container(undefined, c => c
          .section(s => s
            .text(`## ${E.IS_AFK} User is AFK`)
            .text(`<@${id}> *is currently away*\n*might not respond immediately.*`)
          )
          .separator(true)
          .section(s => s
            .text(`> ${E.SHINE} **Reason** • **${afkData.reason}**\n> ${E.SHINE} **Went AFK** • <t:${afkData.timestamp}:R>`)
            .thumbnail(avatar)
          )
        );

        try {
          await message.reply({
            ...response.toMessage(),
            allowed_mentions: { replied_user: false, parse: [] },
          });
        } catch (e) {
          // Ignore
        }
      }
    }
  }
});

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs} seconds`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minutes`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours and ${mins % 60} minutes`;
  const days = Math.floor(hours / 24);
  return `${days} days and ${hours % 24} hours`;
}
