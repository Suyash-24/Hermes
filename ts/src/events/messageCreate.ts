import { createEvent } from 'seyfert';
import { appState } from '../state';
import { Colour, E, header } from '../components/emoji';
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

      const response = new FadeResponse().container(Colour.FADE, c => 
        c.text(header(E.AFK_REMOVE, `Welcome back <@${authorId}>! You were AFK for ${durationStr}.`))
      );

      try {
        await message.reply(response.toMessage());
      } catch (e) {
        // Ignore if unable to reply
      }
    }

    // Check if any mentioned user is AFK
    // Seyfert message.mentions.users might be an array or collection depending on version, let's parse safely.
    const mentions = message.mentions;
    // According to discord api, we can just extract from the content or use message.mentions if populated.
    // Seyfert `message.mentions` gives an array of User objects typically, or we can parse `message.content` for `<@ID>`.
    const mentionedIds = new Set<string>();
    
    // Fallback regex matching for mentions just in case message.mentions isn't populated
    const mentionRegex = /<@!?(\d+)>/g;
    let match;
    while ((match = mentionRegex.exec(message.content)) !== null) {
      if (match[1]) mentionedIds.add(match[1]);
    }

    for (const id of mentionedIds) {
      if (state.db.afkUsers.has(id)) {
        const afkData = state.db.afkUsers.get(id)!;
        
        const response = new FadeResponse().container(Colour.FADE, c => 
          c.text(header(E.IS_AFK, `<@${id}> is currently AFK: **${afkData.reason}**`))
           .text(`Went AFK <t:${afkData.timestamp}:R>`)
        );

        try {
          await message.reply(response.toMessage());
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
