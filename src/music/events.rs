/// Lavalink event handlers for Fade.
///
/// These are called by lavalink-rs when track events fire (end, error, stuck).
/// The primary job is: when a track ends, pop the next track from the guild
/// queue and play it.
use crate::music::get_or_create_queue;

use lavalink_rs::{
    client::LavalinkClient,
    model::events::{TrackEnd, TrackException, TrackStart, TrackStuck},
};
use serenity::model::id::GuildId;
use tracing::{error, info, warn};

pub fn track_end_event(
    client: LavalinkClient,
    _session_id: String,
    event: &TrackEnd,
) -> futures::future::BoxFuture<'static, ()> {
    let reason = format!("{:?}", event.reason);
    let event_guild_id = event.guild_id.0;
    Box::pin(async move {
        let guild_id = GuildId::new(event_guild_id);

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
            let vc = {
                let q = queue_arc.lock().await;
                q.voice_channel
            };
            if let Some(vc_id) = vc {
                crate::music::status::update_voice_status(&data.http, vc_id, &track.title, None, Some("▶️")).await;
            }

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

            // Grab autoplay state + last track info + channels before releasing lock
            let (autoplay, last_track_title, last_track_author, text_channel, voice_channel) = {
                let queue = queue_arc.lock().await;
                let autoplay = queue.autoplay;
                let last_title = queue.current.as_ref().map(|t| t.title.clone());
                let last_author = queue.current.as_ref().map(|t| t.author.clone());
                (autoplay, last_title, last_author, queue.text_channel, queue.voice_channel)
            };

            // ── Autoplay: find a related song and continue ────────────────────
            if autoplay {
                if let (Some(title), Some(author)) = (last_track_title, last_track_author) {
                    // Build a "mix" search query: YouTube's "mix" algorithm picks related songs.
                    // Searching for "song name artist mix" reliably returns related content.
                    let search_query = format!("{} {} mix", title, author);
                    info!(guild = %guild_id, query = %search_query, "Autoplay: searching for related track");

                    // Use a bot-user ID placeholder for autoplay tracks
                    let autoplay_user_id = 0u64;
                    let autoplay_user_name = "Autoplay".to_string();

                    match crate::music::lavalink::search_one(
                        &client,
                        guild_id,
                        &search_query,
                        autoplay_user_id,
                        &autoplay_user_name,
                    ).await {
                        Ok(track) => {
                            info!(guild = %guild_id, title = %track.title, "Autoplay: queuing related track");

                            // Update voice status
                            if let Some(vc_id) = voice_channel {
                                crate::music::status::update_voice_status(
                                    &data.http, vc_id, &track.title, None, Some("▶️")
                                ).await;
                            }

                            // Set it as current and start playing
                            {
                                let mut q = queue_arc.lock().await;
                                q.current = Some(track.clone());
                            }

                            if let Err(e) = crate::music::lavalink::play_track(&client, guild_id, &track).await {
                                error!(guild = %guild_id, error = %e, "Autoplay: failed to play related track");
                            } else {
                                // Get queue state to build card
                                let (loop_mode, shuffled, volume, queue_len, old_msg) = {
                                    let q = queue_arc.lock().await;
                                    (q.loop_mode, q.shuffle, q.volume, q.tracks.len(), q.now_playing_msg)
                                };

                                // Delete old now-playing message
                                if let Some((chan_id, msg_id)) = old_msg {
                                    let _ = data.http.delete_message(chan_id, msg_id, None).await;
                                }

                                // Send new now-playing card
                                if let Some(chan_id) = text_channel {
                                    use crate::commands::music_cards::build_now_playing_card;
                                    let card = build_now_playing_card(&track, 0, loop_mode, shuffled, volume, queue_len, false);
                                    if let Ok(msg) = crate::components::v2::respond_to_channel(&data.http, chan_id, &card).await {
                                        let mut q = queue_arc.lock().await;
                                        q.now_playing_msg = Some((chan_id, msg.id));
                                    }
                                }
                            }
                            return; // Do NOT fall through to queue-ended logic
                        }
                        Err(e) => {
                            warn!(guild = %guild_id, error = %e, "Autoplay: failed to find related track, falling back");
                        }
                    }
                }
            }

            // ── Normal queue-exhausted flow ───────────────────────────────────
            if let Some(vc_id) = voice_channel {
                let is_24_7 = {
                    let app_state = data.state.read().await;
                    let db_lock = app_state.db.read().await;
                    db_lock.twenty_four_seven.contains(&guild_id.get())
                };
                
                if is_24_7 {
                    crate::music::status::update_voice_status(&data.http, vc_id, "Idle - Use /play", None, None).await;
                } else {
                    crate::music::status::update_voice_status(&data.http, vc_id, "", None, None).await;
                    
                    let client_clone = client.clone();
                    let data_clone = data.clone();
                    let gid = guild_id;
                    
                    tokio::spawn(async move {
                        tokio::time::sleep(std::time::Duration::from_secs(300)).await;
                        
                        let is_24_7 = {
                            let app_state = data_clone.state.read().await;
                            let db_lock = app_state.db.read().await;
                            db_lock.twenty_four_seven.contains(&gid.get())
                        };
                        if is_24_7 { return; }
                        
                        let queue_arc = {
                            let state = data_clone.state.read().await;
                            state.music_queues.get(&gid).map(|ref_val| ref_val.value().clone())
                        };
                        
                        let is_empty = if let Some(q) = &queue_arc {
                            q.lock().await.current.is_none()
                        } else {
                            true
                        };
                        
                        if is_empty {
                            let _ = crate::music::lavalink::destroy_player(&client_clone, gid).await;
                            let _ = data_clone.manager.remove(gid).await;
                            
                            if let Some(q) = queue_arc {
                                let mut q_lock = q.lock().await;
                                if let Some(vc) = q_lock.voice_channel {
                                    crate::music::status::update_voice_status(&data_clone.http, vc, "", None, None).await;
                                }
                                q_lock.voice_channel = None;
                                q_lock.text_channel = None;
                                q_lock.now_playing_msg = None;
                            }
                        }
                    });
                }
            }

            if let Some(channel_id) = text_channel {
                let _ = send_queue_ended(&data.http, channel_id).await;
            }
        }
    })
}

pub fn track_error_event(
    _client: LavalinkClient,
    _session_id: String,
    event: &TrackException,
) -> futures::future::BoxFuture<'static, ()> {
    let error_msg = event.exception.message.clone();
    let event_guild_id = event.guild_id.0;
    Box::pin(async move {
        error!(
            guild = %event_guild_id,
            error = %error_msg,
            "Track error"
        );
    })
}

pub fn track_stuck_event(
    client: LavalinkClient,
    _session_id: String,
    event: &TrackStuck,
) -> futures::future::BoxFuture<'static, ()> {
    let threshold = event.threshold_ms;
    let event_guild_id = event.guild_id.0;
    Box::pin(async move {
        warn!(guild = %event_guild_id, threshold = %threshold, "Track stuck");
        let guild_id = GuildId::new(event_guild_id);
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
    })
}

// ── Event data passed into lavalink client ────────────────────────────────────

/// Data stored inside the lavalink client so event handlers can access
/// serenity state.
pub struct MusicEventData {
    pub state: std::sync::Arc<tokio::sync::RwLock<crate::state::AppState>>,
    pub http: std::sync::Arc<serenity::http::Http>,
    pub manager: std::sync::Arc<songbird::Songbird>,
}

async fn send_queue_ended(
    http: &std::sync::Arc<serenity::http::Http>,
    channel_id: serenity::model::id::ChannelId,
) -> Result<(), serenity::Error> {
    use crate::components::{
        emoji::E,
        v2::{FadeResponse, respond_to_channel},
    };

    let response = FadeResponse::new().container(None, |c| {
        c.text(format!("{} Queue ended — nothing left to play.", E::STOPPED))
    });

    let _ = respond_to_channel(http, channel_id, &response).await;
    Ok(())
}

pub fn track_start_event(
    client: LavalinkClient,
    _session_id: String,
    event: &TrackStart,
) -> futures::future::BoxFuture<'static, ()> {
    let event_guild_id = event.guild_id.0;
    let track_title = event.track.info.title.clone();
    
    Box::pin(async move {
        let guild_id = GuildId::new(event_guild_id);
        let user_data = client.data::<crate::MusicEventData>();
        let Ok(data) = user_data else { return; };
        
        let queue_arc = {
            let state_lock = data.state.read().await;
            state_lock.music_queues.get(&guild_id).map(|ref_val| ref_val.value().clone())
        };
        
        let vc = if let Some(q) = queue_arc {
            q.lock().await.voice_channel
        } else {
            None
        };
        
        if let Some(vc_id) = vc {
            crate::music::status::update_voice_status(&data.http, vc_id, &track_title, None, Some("??")).await;
        }
    })
}
