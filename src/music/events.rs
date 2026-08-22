/// Lavalink event handlers for Fade.
///
/// These are called by lavalink-rs when track events fire (end, error, stuck).
/// The primary job is: when a track ends, pop the next track from the guild
/// queue and play it.
use crate::music::{get_or_create_queue, TrackInfo};
use crate::state::{AppState, AppStateKey};
use lavalink_rs::{
    client::LavalinkClient,
    model::events::{TrackEnd, TrackException, TrackStuck},
};
use serenity::model::id::GuildId;
use tracing::{error, info, warn};

pub fn track_end_event(
    client: LavalinkClient,
    session_id: String,
    event: &TrackEnd,
) -> futures::future::BoxFuture<'static, ()> {
    let reason = format!("{:?}", event.reason);
    Box::pin(async move {
        let guild_id = match session_id.parse::<u64>() {
            Ok(id) => GuildId::new(id),
            Err(_) => return,
        };

        info!(guild = %guild_id, reason = %reason, "Track ended");

        // If a track was stopped intentionally or replaced by another track being played,
        // we don't want to advance the queue automatically. The caller who stopped/replaced
        // it is responsible for advancing the queue.
        if reason.contains("Replaced") || reason.contains("Stopped") {
            return;
        }

        let user_data = client.data::<MusicEventData>();
        let Ok(data) = user_data else {
            warn!("No MusicEventData in lavalink client");
            return;
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
            } else {
                // Get queue state to build card
                let (loop_mode, shuffled, volume, queue_len, text_channel, old_msg) = {
                    let q = queue_arc.lock().await;
                    (q.loop_mode, q.shuffle, q.volume, q.tracks.len(), q.text_channel, q.now_playing_msg)
                };

                // Delete old now-playing message if it exists
                if let Some((chan_id, msg_id)) = old_msg {
                    let _ = data.http.delete_message(chan_id, msg_id, None).await;
                }

                // Send new now-playing card
                if let Some(chan_id) = text_channel {
                    use crate::commands::music_cards::build_now_playing_card;
                    let card = build_now_playing_card(&track, 0, loop_mode, shuffled, volume, queue_len, false);
                    if let Ok(msg) = crate::components::v2::respond_to_channel(&data.http, chan_id, &card).await {
                        // Store the new message ID in the queue state
                        let mut q = queue_arc.lock().await;
                        q.now_playing_msg = Some((chan_id, msg.id));
                    }
                }
            }
        } else {
            info!(guild = %guild_id, "Queue exhausted");
            let text_channel = {
                let queue = queue_arc.lock().await;
                queue.text_channel
            };
            if let Some(channel_id) = text_channel {
                let _ = send_queue_ended(&data.http, channel_id).await;
            }
        }
    })
}

pub fn track_error_event(
    _client: LavalinkClient,
    session_id: String,
    event: &TrackException,
) -> futures::future::BoxFuture<'static, ()> {
    let error_msg = event.exception.message.clone();
    Box::pin(async move {
        error!(
            guild = %session_id,
            error = %error_msg,
            "Track error"
        );
    })
}

pub fn track_stuck_event(
    client: LavalinkClient,
    session_id: String,
    event: &TrackStuck,
) -> futures::future::BoxFuture<'static, ()> {
    let threshold = event.threshold_ms;
    Box::pin(async move {
        warn!(guild = %session_id, threshold = %threshold, "Track stuck");
        if let Ok(guild_id) = session_id.parse::<u64>() {
            let guild_id = GuildId::new(guild_id);
            let user_data = client.data::<MusicEventData>();
            if let Ok(data) = user_data {
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
    })
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

    let response = FadeResponse::new().container(None, |c| {
        c.text(format!("{} Queue ended — nothing left to play.", E::STOPPED))
    });

    let _ = respond_to_channel(http, channel_id, &response).await;
    Ok(())
}
