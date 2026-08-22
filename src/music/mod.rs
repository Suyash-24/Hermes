/// Music module for Fade.
///
/// Contains:
/// - `TrackInfo` — metadata for a queued track
/// - `GuildQueue` — per-guild playback state
/// - `LoopMode` — loop behaviour enum
/// - `MusicManager` — helper to look up queues from state
pub mod events;
pub mod lavalink;
pub mod queue;

pub use queue::{GuildQueue, LoopMode, TrackInfo};

use crate::music::lavalink::{
    model::{
        track::{TrackData, TrackInfo as LavaTrackInfo},
    },
};
use serenity::model::id::GuildId;
use std::sync::Arc;
use tokio::sync::Mutex;
use dashmap::DashMap;

// ── Per-guild queue store ──────────────────────────────────────────────────────

/// Thread-safe map of guild queues.
/// Lives inside `AppState`.
pub type QueueMap = DashMap<GuildId, Arc<Mutex<GuildQueue>>>;

/// Get or create the queue for a guild.
pub fn get_or_create_queue(
    queues: &QueueMap,
    guild_id: GuildId,
) -> Arc<Mutex<GuildQueue>> {
    queues
        .entry(guild_id)
        .or_insert_with(|| Arc::new(Mutex::new(GuildQueue::new())))
        .clone()
}
