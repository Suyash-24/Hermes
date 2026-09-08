/**
 * Lavalink manager construction and access.
 *
 * Replaces the Rust `src/music/lavalink.rs` wiring plus the `LavalinkKey`
 * TypeMap entry. Most of that file was one-line wrappers around
 * `get_player_context(guild_id)?.set_pause(...)` and friends; those are gone
 * because lavalink-client hands you the `Player` directly, so call sites use
 * `player.pause()` / `player.seek(ms)` / `player.setVolume(n)` and there is no
 * wrapper left to keep in sync. What genuinely needs a home is here: node
 * configuration, the gateway bridge, and the queue-empty hook.
 *
 * The Rust event handlers (`src/music/events.rs`) advanced the queue by hand on
 * every `TrackEnd`. `autoSkip: true` does that in the library, which removes the
 * hand-rolled `pop_next()` path — and with it the re-entrant `state.read()`
 * deadlock that path caused at `events.rs:45` / `:169`.
 */
import type { Client } from 'seyfert';
import type { GatewaySendPayload } from 'seyfert';
import { LavalinkManager, LavalinkNode } from 'lavalink-client';
import type { GuildShardPayload, LavalinkNodeOptions } from 'lavalink-client';
import type { Config } from './../config';
import { BotError } from './../error';
import { logger } from './../logging';
import { autoPlayFunction } from './autoplay';

import { registerMusicEvents } from './events';

const log = logger('lavalink');

/** Stable node id, so log lines and `player.node.id` stay readable. */
const NODE_ID = 'fade';

/**
 * Rust kept 15 recent titles in `GuildQueue::history`. `queue.previous` replaces
 * it, and 25 is the library default — a wider window makes the autoplay dedupe
 * strictly better, so keep it.
 */
const MAX_PREVIOUS_TRACKS = 25;

// Patch LavalinkNode.prototype.open to prevent uncaught timeout or connection errors
// from crashing the Node.js process and to guarantee persistent, non-stop reconnects.
const originalOpen = (LavalinkNode.prototype as any).open;
if (typeof originalOpen === 'function') {
  (LavalinkNode.prototype as any).open = async function (this: any) {
    try {
      return await originalOpen.call(this);
    } catch (err: any) {
      log.warn(`Lavalink node (${this.restAddress}) handshake failed: ${err?.message || err}. Will retry automatically...`);
      try {
        if (this.socket) {
          this.socket.close(4001, 'InfoFetchFailed');
        }
      } catch {}
      if (!this.isNodeReconnecting) {
        setTimeout(() => {
          try {
            if (!this.connected) this.reconnect();
          } catch (recErr) {
            log.warn(`Lavalink reconnect attempt failed: ${recErr}`);
          }
        }, this.options.retryDelay || 3_000);
      }
    }
  };
}

function getClientIdFromToken(token?: string): string | undefined {
  if (!token) return undefined;
  try {
    const [firstPart] = token.split('.');
    if (!firstPart) return undefined;
    const decoded = Buffer.from(firstPart, 'base64').toString('ascii');
    if (/^\d{17,20}$/.test(decoded)) {
      return decoded;
    }
  } catch {}
  return undefined;
}

function nodeOptions(config: Config): LavalinkNodeOptions {
  return {
    id: NODE_ID,
    host: config.lavalink.host,
    port: config.lavalink.port,
    authorization: config.lavalink.password,
    secure: config.lavalink.https,
    retryAmount: 100_000_000,
    retryDelay: 3_000,
    requestSignalTimeoutMS: 30_000,
    closeOnError: false,
    enablePingOnStatsCheck: true,
  };
}

/**
 * The voice-gateway bridge.
 *
 * lavalink-client builds the `{ op: 4, d: {...} }` voice-state payload and hands
 * it back to be sent on the guild's shard. `GuildShardPayload` types `op` as a
 * plain `number`, so it does not line up with Seyfert's opcode-literal union
 * without a cast — the shape is identical.
 */
function sendToShard(client: Client): (guildId: string, payload: GuildShardPayload) => void {
  return (guildId, payload) => {
    try {
      const shardId = client.gateway.calculateShardId(guildId);
      void client.gateway.send(shardId, payload as unknown as GatewaySendPayload).catch(err => {
        log.warn(`Failed to send voice payload for guild ${guildId}:`, err);
      });
    } catch (err) {
      log.warn(`Could not resolve a shard for guild ${guildId}:`, err);
    }
  };
}

/** Build the manager. Nodes only connect once `init()` runs on ready. */
export function initLavalink(client: Client, config: Config): LavalinkManager {
  const clientId = getClientIdFromToken(process.env.DISCORD_TOKEN);

  const manager = new LavalinkManager({
    nodes: [nodeOptions(config)],
    client: {
      id: clientId || '1398578769438048368',
      username: config.bot.name || 'Hermes',
    },
    sendToShard: sendToShard(client),

    // Advance the queue on track end. This is the whole of Rust's
    // `track_end_event` "pop and play" branch, minus the deadlock.
    autoSkip: true,
    autoSkipOnResolveError: true,
    autoMove: true,

    playerOptions: {
      // Rust set Lavalink's volume directly, so 100% meant 100%. The library
      // default of 0.75 would quietly make every guild 25% quieter on upgrade.
      volumeDecrementer: 1,
      clientBasedPositionUpdateInterval: 250,
      defaultSearchPlatform: 'ytsearch',
      onDisconnect: { autoReconnect: false, destroyPlayer: false },
      onEmptyQueue: {
        // Rust called `prefetch_autoplay` inline in the track-end handler; this
        // is the same decision point, but the library owns playing the result.
        autoPlayFunction,
        // Deliberately unset: the 5-minute idle leave is implemented in
        // `music/events.ts` because it has to exempt 24/7 guilds, and this
        // option destroys the player unconditionally.
      },
      requesterTransformer: requester => requester,
    },

    queueOptions: { maxPreviousTracks: MAX_PREVIOUS_TRACKS },
  });

  registerMusicEvents(manager);

  // Lifecycle listeners on NodeManager for transparent logging and recovery
  manager.nodeManager.on('connect', node => {
    log.info(`Connected to Lavalink node "${node.id}" (${node.options.host}:${node.options.port})`);
  });

  manager.nodeManager.on('disconnect', (node, reason) => {
    log.warn(`Disconnected from Lavalink node "${node.id}" (${reason.code}: ${reason.reason || 'unknown'}). Reconnecting...`);
  });

  manager.nodeManager.on('reconnecting', node => {
    log.info(`Reconnecting to Lavalink node "${node.id}"...`);
  });

  manager.nodeManager.on('error', (node, error) => {
    log.warn(`Lavalink node "${node.id}" error: ${error?.message || error}`);
  });

  manager.nodeManager.on('destroy', node => {
    log.warn(`Lavalink node "${node.id}" destroyed. Supervisor will re-instantiate.`);
    try {
      const newNode = manager.nodeManager.createNode(nodeOptions(config));
      void newNode.connect();
    } catch (e) {
      log.warn('Failed to recreate destroyed node:', e);
    }
  });

  // Background supervisor: ensure nodes are ALWAYS alive, re-created, and reconnecting
  const supervisor = setInterval(() => {
    try {
      if (manager.nodeManager.nodes.size === 0) {
        log.warn('Supervisor: No Lavalink nodes registered, re-creating node...');
        const node = manager.nodeManager.createNode(nodeOptions(config));
        void node.connect();
      }
      for (const node of manager.nodeManager.nodes.values()) {
        if (!node.connected && !node.isNodeReconnecting) {
          log.info(`Supervisor: Lavalink node "${node.id}" is offline. Reconnecting...`);
          (node as any).reconnect();
        }
      }
    } catch (err) {
      log.warn('Lavalink supervisor error:', err);
    }
  }, 5_000);
  supervisor.unref?.();

  current = manager;
  return manager;
}

// ── Singleton access ──────────────────────────────────────────────────────────

let current: LavalinkManager | undefined;

/** The shared manager. Throws when called before `initLavalink`. */
export function lavalink(): LavalinkManager {
  if (!current) throw BotError.internal('LavalinkManager accessed before initLavalink()');
  return current;
}

/** Whether a node is connected and searches can be served. */
export function lavalinkReady(): boolean {
  return current?.useable ?? false;
}

/**
 * A connected node to search on when there is no player yet — `/search` and
 * `/play`'s "not in a voice channel" path both need results before joining.
 * Rust searched via `LavalinkClient::load_tracks(guild_id, …)`, which likewise
 * did not require a player.
 */
export function searchNode(): LavalinkNode {
  const node = lavalink().nodeManager.leastUsedNodes('players')[0];
  if (!node) throw BotError.lavalink('No Lavalink node is connected');
  return node;
}
