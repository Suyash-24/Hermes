/// Prefix command handler — handles `!play <query>` messages.
///
/// Unlike slash commands, prefix commands have no 3-second Discord timeout,
/// so Songbird can take as long as it needs to join the voice channel.
use crate::commands::music_cards::{build_error_card, build_now_playing_card, build_playlist_queued_card, build_queued_card};
use crate::components::v2::{FadeResponse, IS_COMPONENTS_V2};
use crate::music::{lavalink as lava};
use crate::state::{AppState, LavalinkKey};
use crate::music::get_or_create_queue;
use lavalink_rs::model::player::ConnectionInfo as LavaConnectionInfo;
use serenity::{model::channel::Message, prelude::*};
use std::sync::Arc;
use tokio::sync::RwLock;

pub async fn handle_play(
    ctx: &Context,
    msg: &Message,
    state: Arc<RwLock<AppState>>,
    query: String,
) {
    // Must be in a guild.
    let guild_id = match msg.guild_id {
        Some(id) => id,
        None => {
            let _ = msg.reply(&ctx.http, "❌ This command can only be used in a server.").await;
            return;
        }
    };

    // User must be in a voice channel.
    let voice_channel = {
        let guild = match ctx.cache.guild(guild_id) {
            Some(g) => g,
            None => {
                let _ = msg.reply(&ctx.http, "❌ Could not find guild info.").await;
                return;
            }
        };
        guild
            .voice_states
            .get(&msg.author.id)
            .and_then(|vs| vs.channel_id)
    };

    let voice_channel = match voice_channel {
        Some(c) => c,
        None => {
            let _ = msg.reply(&ctx.http, "❌ You must be in a voice channel first!").await;
            return;
        }
    };

    // Get lavalink client.
    let lavalink = {
        let data = ctx.data.read().await;
        match data.get::<LavalinkKey>() {
            Some(lv) => lv.clone(),
            None => {
                let _ = msg.reply(&ctx.http, "❌ Music service unavailable.").await;
                return;
            }
        }
    };

    // Get or create the queue for this guild.
    let queue = {
        let state_lock = state.read().await;
        get_or_create_queue(&state_lock.music_queues, guild_id)
    };

    // Check if already in VC.
    let already_in_vc = {
        let q = queue.lock().await;
        q.voice_channel.is_some()
    };

    if !already_in_vc {
        // Show typing indicator while joining — no 3-second timeout for prefix commands!
        let _ = ctx.http.broadcast_typing(msg.channel_id).await;

        // Use songbird to join the voice channel.
        let manager = match songbird::get(ctx).await {
            Some(m) => m.clone(),
            None => {
                let _ = msg.reply(&ctx.http, "❌ Voice system not initialized.").await;
                return;
            }
        };

        tracing::info!("Prefix !play: joining voice channel {voice_channel}");
        let join_result = manager.join_gateway(guild_id, voice_channel).await;

        match join_result {
            Ok((conn_info, _)) => {
                tracing::info!(endpoint = %conn_info.endpoint, "Songbird joined OK");
                let lava_conn = LavaConnectionInfo {
                    endpoint: conn_info.endpoint.clone(),
                    token: conn_info.token.clone(),
                    session_id: conn_info.session_id.clone(),
                    channel_id: Some(voice_channel.into()),
                };
                if let Err(e) = lavalink.create_player_context(guild_id, lava_conn).await {
                    tracing::error!("create_player_context failed: {e}");
                    let _ = msg.reply(&ctx.http, format!("❌ Failed to set up player: {e}")).await;
                    return;
                }

                let mut q = queue.lock().await;
                q.voice_channel = Some(voice_channel);
                q.text_channel = Some(msg.channel_id);
            }
            Err(e) => {
                tracing::error!("Songbird join_gateway error: {e}");
                let _ = msg.reply(&ctx.http, format!("❌ Could not join voice channel: {e}")).await;
                return;
            }
        }
    }

    let requested_by = msg.author.id.get();
    let requested_by_name = msg.author.name.clone();

    let tracks = match lava::search_all(&lavalink, guild_id, &query, requested_by, &requested_by_name).await {
        Ok(t) => t,
        Err(e) => {
            let _ = msg.reply(&ctx.http, format!("❌ Could not find tracks: {e}")).await;
            return;
        }
    };

    if tracks.is_empty() {
        let _ = msg.reply(&ctx.http, "❌ No results found.").await;
        return;
    }

    let is_currently_playing = {
        let q = queue.lock().await;
        q.current.is_some()
    };

    if tracks.len() > 1 {
        let count = tracks.len();
        {
            let mut q = queue.lock().await;
            for track in &tracks {
                q.push(track.clone());
            }
        }
        if !is_currently_playing {
            let first = tracks[0].clone();
            if let Err(e) = lava::play_track(&lavalink, guild_id, &first).await {
                let _ = msg.reply(&ctx.http, format!("❌ Playback error: {e}")).await;
                return;
            }
            {
                let mut q = queue.lock().await;
                q.current = Some(first.clone());
                q.tracks.pop_front();
            }
            let (loop_mode, shuffled, volume) = {
                let q = queue.lock().await;
                (q.loop_mode, q.shuffle, q.volume)
            };
            let card = build_now_playing_card(&first, 0, loop_mode, shuffled, volume, count.saturating_sub(1), false);
            send_card(ctx, msg, &card).await;
        } else {
            let card = build_playlist_queued_card(&tracks);
            send_card(ctx, msg, &card).await;
        }
    } else {
        let track = tracks.into_iter().next().unwrap();
        if !is_currently_playing {
            if let Err(e) = lava::play_track(&lavalink, guild_id, &track).await {
                let _ = msg.reply(&ctx.http, format!("❌ Playback error: {e}")).await;
                return;
            }
            {
                let mut q = queue.lock().await;
                q.current = Some(track.clone());
            }
            let (loop_mode, shuffled, volume) = {
                let q = queue.lock().await;
                (q.loop_mode, q.shuffle, q.volume)
            };
            let card = build_now_playing_card(&track, 0, loop_mode, shuffled, volume, 0, false);
            send_card(ctx, msg, &card).await;
        } else {
            let position = {
                let mut q = queue.lock().await;
                q.push(track.clone());
                q.tracks.len()
            };
            let card = build_queued_card(&track, position);
            send_card(ctx, msg, &card).await;
        }
    }
}

/// Send a FadeResponse card as a regular channel message using components v2.
async fn send_card(ctx: &Context, msg: &Message, card: &FadeResponse) {
    let map = serde_json::json!({
        "content": "",
        "components": card.components_value(),
        "flags": IS_COMPONENTS_V2,
    });
    let _ = ctx.http.send_message(msg.channel_id, vec![], &map).await;
}

