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

use crate::state::AppState;
use dashmap::DashMap;
use serenity::model::id::{ChannelId, GuildId, MessageId};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

pub fn set_voice_state(
    ctx: &serenity::prelude::Context,
    guild_id: serenity::model::id::GuildId,
    channel_id: Option<serenity::model::id::ChannelId>,
) {
    let payload = serde_json::json!({
        "op": 4,
        "d": {
            "guild_id": guild_id.get().to_string(),
            "channel_id": channel_id.map(|c| c.get().to_string()),
            "self_mute": false,
            "self_deaf": false,
        }
    });
    ctx.shard.websocket_message(tokio_tungstenite::tungstenite::Message::Text(
        payload.to_string().into(),
    ));
}

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
