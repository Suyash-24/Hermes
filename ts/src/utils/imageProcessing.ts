/**
 * Image download + normalisation for the server-profile commands.
 *
 * Port of the Rust `src/utils/image_processing.rs`. Discord's `@me` guild-member
 * PATCH takes a base64 data URI, and rejects anything over 10 MB, so oversized
 * images are scaled to fit 1024×1024 and re-encoded as JPEG.
 *
 * Uses jimp (pure JavaScript) rather than a native codec — the Rust build could
 * not link `ring`/`cc` on this machine, and this port should not reintroduce a
 * toolchain dependency for something this small.
 */
import { Jimp } from 'jimp';
import { BotError, describe } from './../error';
import { logger } from './../logging';

const log = logger('image');

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_DIMENSION = 1024;
/** Matches the default quality of the Rust `image` crate's JPEG encoder. */
const JPEG_QUALITY = 75;

/**
 * Download an image, shrink it when it is over 10 MB, and return it as a base64
 * data URI ready for `PATCH /guilds/{id}/members/@me`.
 */
export async function downloadAndProcessImage(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw BotError.custom(`Failed to download image: ${describe(err)}`);
  }

  // Rust skipped this check and would happily base64 an HTML error page.
  if (!res.ok) {
    throw BotError.custom(`Failed to download image: HTTP ${res.status}`);
  }

  const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    throw BotError.custom(`Failed to read image bytes: ${describe(err)}`);
  }

  if (bytes.length <= MAX_SIZE_BYTES) {
    log.info(`Image is ${bytes.length} bytes (under 10MB), using directly.`);
    return `data:${contentType};base64,${bytes.toString('base64')}`;
  }

  log.info(`Image is ${bytes.length} bytes (over 10MB). Resizing...`);

  // An animated GIF loses its animation here — a 10 MB+ GIF cannot fit anyway.
  let out: Buffer;
  try {
    const image = await Jimp.fromBuffer(bytes);
    image.scaleToFit({ w: MAX_DIMENSION, h: MAX_DIMENSION });
    out = await image.getBuffer('image/jpeg', { quality: JPEG_QUALITY });
  } catch (err) {
    throw BotError.custom(`Failed to decode/encode image for resizing: ${describe(err)}`);
  }

  log.info(`Resized image to ${out.length} bytes.`);

  if (out.length > MAX_SIZE_BYTES) {
    throw BotError.custom('Image is still too large even after resizing!');
  }

  return `data:image/jpeg;base64,${out.toString('base64')}`;
}
