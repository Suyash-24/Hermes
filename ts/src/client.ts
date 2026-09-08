/**
 * Shared access to the Seyfert client.
 *
 * Commands get the client from `ctx.client`, but Lavalink event handlers only
 * receive a `Player`, and there is no ctx behind a background timer either. Rust
 * solved this by stuffing `Arc<Http>` into the lavalink client's user data
 * (`MusicEventData` in `src/music/events.rs`); a module singleton is the same
 * idea without the plumbing, and matches how `appState()` already works.
 */
import type { Client } from 'seyfert';
import { BotError } from './error';

let current: Client | undefined;

/** Register the client. Call once, right after constructing it. */
export function setClient(client: Client): void {
  current = client;
}

/** The shared client. Throws when called before `setClient`. */
export function useClient(): Client {
  if (!current) throw BotError.internal('Client accessed before setClient()');
  return current;
}

/** The client, or `undefined` if the bot has not booted yet. */
export function maybeClient(): Client | undefined {
  return current;
}
