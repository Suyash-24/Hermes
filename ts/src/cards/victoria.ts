/**
 * A private card — built for one person, meant for one person.
 *
 * Usage: prefix command `hervictoria` (authorized users only).
 * Sends a personalized Components V2 card dedicated to Victoria,
 * featuring her eyes with an ethereal glowing signature and heartfelt poetry.
 */
import { E } from '../components/emoji';
import { type FadeResponse, response } from '../components/v2';

/** Discord user ID of Victoria if known (can be populated or dynamically resolved). */
export let VICTORIA_USER_ID = '';

export function setVictoriaUserId(id: string): void {
  VICTORIA_USER_ID = id;
}

/** Authorised senders who may trigger this command. */
export const VICTORIA_COMMAND_ALLOWED: readonly string[] = [
  '965299353499619478',  // senpai_salvatore
  '1530762097213050880', // owner / dev testing
];

export interface VictoriaCardOptions {
  imageUrl: string;
  mentionText: string;
  currentTrackTitle?: string;
}

/**
 * Renders the aesthetic Victoria card.
 */
export function victoriaCard(opts: VictoriaCardOptions): FadeResponse {
  const musicNote = opts.currentTrackTitle
    ? `${E.MUSIC} Now playing: **${opts.currentTrackTitle}**\n-# *this melody has been thinking of you.*`
    : `-# *every love song suddenly sounds like you.*`;

  return response()
    .container(undefined, (c) =>
      c
        .text(
          `## ${E.SHINE} Victoria\n` +
          `-# *some people are art without even trying.*`,
        )
        .separator(false)
        .mediaGallery((g) => g.item(opts.imageUrl, 'her eyes'))
        .separator(true)
        .text(
          `> *some eyes you just pass by in a crowded room —*\n` +
          `> *and some, you get lost in forever.*\n` +
          `> *yours are the kind a thousand songs could never finish describing.*`,
        )
        .separator(false)
        .text(
          `${E.MOON} ${opts.mentionText}\n` +
          `${musicNote}`,
        ),
    );
}
