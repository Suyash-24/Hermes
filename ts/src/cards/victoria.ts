/**
 * A private card — built for one person, meant for one person.
 *
 * Usage: prefix command `hervictoria` (authorized users only).
 * Sends a personalized Components V2 card tagging victoria_delaney,
 * with her eyes as a media gallery image and hand-written poetry.
 */
import { E } from '../components/emoji';
import { type FadeResponse, response } from '../components/v2';

/** Discord user ID of victoria_delaney — used for the @mention. */
export const VICTORIA_USER_ID = ''; // fill her ID here if known, else we use username mention

/** Authorised senders who may trigger this command. */
export const VICTORIA_COMMAND_ALLOWED: readonly string[] = [
  '965299353499619478',  // senpai_salvatore
  '1530762097213050880', // owner (testing)
];

/**
 * The card itself.
 *
 * The eyes image is passed as an attachment URL (`attachment://victoria_eyes.jpg`)
 * so Discord renders it inline inside the MediaGallery.
 */
export function victoriaCard(imageUrl: string): FadeResponse {
  return response()
    .container(undefined, (c) =>
      c
        .text(
          `## ${E.STAR} victoria_delaney\n` +
          `-# *a small thing, made with intention*`,
        )
        .separator(false)
        .mediaGallery((g) => g.item(imageUrl, 'her eyes'))
        .separator(true)
        .text(
          `> *there are eyes that hold entire skies —*\n` +
          `> *the kind you don't forget,*\n` +
          `> *no matter how hard you try.*\n` +
          `> *yours are that kind.*`,
        )
        .separator(false)
        .text(
          `${E.MOON}  <@${VICTORIA_USER_ID || 'victoria_delaney'}>\n` +
          `-# *this song has been thinking about you.*`,
        ),
    );
}
