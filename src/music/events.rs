/// Lavalink event handlers for Fade.
///
/// These are called by lavalink-rs when track events fire (end, error, stuck).
/// The primary job is: when a track ends, pop the next track from the guild
/// queue and play it.
use crate::music::{get_or_create_queue, TrackInfo};
use crate::state::AppStateKey;
use lavalink_rs::{
    async_trait,
    client::LavalinkClient,
    error::LavalinkResult,
    model::events,
};
use serenity::model::id::GuildId;
use tracing::{error, info, warn};

pub struct FadeEventHandler;

#[async_trait]
impl lavalink_rs::player_context::EventHandler for FadeEventHandler {
    async fn track_end_event(
        &self,
        client: LavalinkClient,
        session_id: String,
        event: events::TrackEnd,
    ) -> LavalinkResult<()> {
        let guild_id = match GuildId::from_str_radix(&session_id, 10) {
            Ok(id) => GuildId::new(id),
            Err(_) => return Ok(()),
        };

        info!(guild = %guild_id, reason = ?event.reason, "Track ended");

        // Get data from the stored serenity context (stored via TypeMap).
        // Since we can't easily get ctx here, we use the global DATA stored in
        // lavalink client's user data.
        let user_data = client.data::<MusicEventData>();
        let Some(data) = user_data else {
            warn!("No MusicEventData in lavalink client");
            return Ok(());
        };

        let state_lock = data.state.read().await;
        let queues = &state_lock.music_queues;
        let queue_arc = get_or_create_queue(queues, guild_id);
        let next_track = {
            let mut queue = queue_arc.lock().await;
            queue.pop_next()
        };

        if let Some(track) = next_track {
            info!(guild = %guild_id, title = %track.title, "Playing next track");
            if let Err(e) = crate::music::lavalink::play_track(&client, guild_id, &track).await {
                error!(guild = %guild_id, error = %e, "Failed to play next track");
            }
        } else {
            info!(guild = %guild_id, "Queue exhausted");
            // Queue is empty — update the now-playing message if we have one.
            let text_channel = {
                let queue = queue_arc.lock().await;
                queue.text_channel
            };
            if let Some(channel_id) = text_channel {
                // We'll send a "queue ended" notification via http.
                let _ = send_queue_ended(&data.http, channel_id).await;
            }
        }

        Ok(())
    }

    async fn track_error_event(
        &self,
        _client: LavalinkClient,
        session_id: String,
        event: events::TrackException,
    ) -> LavalinkResult<()> {
        error!(
            guild = %session_id,
            error = %event.exception.message.unwrap_or_default(),
            "Track error"
        );
        Ok(())
    }

    async fn track_stuck_event(
        &self,
        client: LavalinkClient,
        session_id: String,
        event: events::TrackStuck,
    ) -> LavalinkResult<()> {
        warn!(guild = %session_id, threshold = ?event.threshold_ms, "Track stuck");
        // Auto-skip stuck tracks.
        if let Ok(guild_id) = session_id.parse::<u64>() {
            let guild_id = GuildId::new(guild_id);
            let user_data = client.data::<MusicEventData>();
            if let Some(data) = user_data {
                let state_lock = data.state.read().await;
                let queues = &state_lock.music_queues;
                let queue_arc = get_or_create_queue(queues, guild_id);
                let next = {
                    let mut q = queue_arc.lock().await;
                    q.pop_next()
                };
                if let Some(track) = next {
                    let _ = crate::music::lavalink::play_track(&client, guild_id, &track).await;
                }
            }
        }
        Ok(())
    }
}

// ── Event data passed into lavalink client ────────────────────────────────────

/// Data stored inside the lavalink client so event handlers can access
/// serenity state.
pub struct MusicEventData {
    pub state: std::sync::Arc<tokio::sync::RwLock<crate::state::AppState>>,
    pub http: std::sync::Arc<serenity::http::Http>,
}

async fn send_queue_ended(
    http: &std::sync::Arc<serenity::http::Http>,
    channel_id: serenity::model::id::ChannelId,
) -> Result<(), serenity::Error> {
    use crate::components::{
        emoji::{header, Colour, E},
        v2::{FadeResponse, respond_to_channel},
    };

    let response = FadeResponse::new().container(Some(Colour::SLATE), |c| {
        c.text(format!("{} Queue ended — nothing left to play.", E::STOPPED))
    });

    respond_to_channel(http, channel_id, &response).await
}
