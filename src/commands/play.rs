/// /play <query|url> — search YouTube or play a URL.
///
/// If the bot is not in a voice channel, it joins the invoker's VC first.
/// Adds to queue if something is already playing.
use super::music_cards::{build_error_card, build_now_playing_card, build_playlist_queued_card, build_queued_card};
use super::music_helpers::resolve_music_context;

use crate::error::BotResult;
use crate::music::lavalink as lava;
use crate::state::AppState;
use serenity::prelude::*;
use std::sync::Arc;
use tokio::sync::RwLock;

pub async fn run(
    ctx: &Context,
    cmd: &crate::commands::context::CommandContext<'_>,
    state: Arc<RwLock<AppState>>,
    args: &[&str],
) -> BotResult<()> {
    // Defer response so we have time to fetch track data.
    cmd.defer(ctx).await?;

    let query = match cmd {
        crate::commands::context::CommandContext::Slash(c) => c
            .data
            .options
            .first()
            .and_then(|o| o.value.as_str())
            .unwrap_or("")
            .to_string(),
        crate::commands::context::CommandContext::Prefix(_) => args.join(" "),
    };

    if query.is_empty() {
        let card = build_error_card("Please provide a search query or URL.");
        cmd.edit(ctx, &card).await?;
        return Ok(());
    }

    let mc = match resolve_music_context(ctx, cmd, &state, false).await {
        Ok(c) => c,
        Err(e) => {
            let card = build_error_card(&e.to_string());
            cmd.edit(ctx, &card).await?;
            return Ok(());
        }
    };

    // Join VC if not already in one.
    let already_in_vc = {
        let q = mc.queue.lock().await;
        q.voice_channel.is_some()
    };
    if !already_in_vc {
        // Use songbird to join the voice channel
        let manager = songbird::get(ctx).await.expect("Songbird client placed in at initialization").clone();
        let handler = manager.join_gateway(mc.guild_id, mc.voice_channel).await;
        tracing::info!("Songbird join_gateway result: {:?}", handler.as_ref().map(|_| "Ok").unwrap_or("Err"));

        match handler {
            Ok((conn_info, _)) => {
                tracing::info!(endpoint = %conn_info.endpoint, session_id = %conn_info.session_id, "Songbird connected");
                let lava_conn = lavalink_rs::model::player::ConnectionInfo {
                    endpoint: conn_info.endpoint.clone(),
                    token: conn_info.token.clone(),
                    session_id: conn_info.session_id.clone(),
                    channel_id: Some(mc.voice_channel.into()),
                };
                
                // Initialize the player context with the connection info
                if let Err(e) = mc.lavalink.create_player_context(mc.guild_id, lava_conn).await {
                    tracing::error!("create_player_context failed: {e}");
                    let card = build_error_card(&format!("Failed to create player context: {}", e));
                    cmd.edit(ctx, &card).await?;
                    return Ok(());
                }
            }
            Err(why) => {
                tracing::error!("Songbird join_gateway error: {why}");
                let card = build_error_card(&format!("Could not connect to voice channel: {}", why));
                cmd.edit(ctx, &card).await?;
                return Ok(());
            }
        }

        let mut q = mc.queue.lock().await;
        q.voice_channel = Some(mc.voice_channel);
        q.text_channel = Some(cmd.channel_id());
    }

    // Resolve tracks.
    let requested_by = cmd.user_id().get();
    let requested_by_name = cmd.user_name();

    let tracks = match lava::search_all(
        &mc.lavalink,
        mc.guild_id,
        &query,
        requested_by,
        &requested_by_name,
    )
    .await
    {
        Ok(t) => t,
        Err(e) => {
            let card = build_error_card(&e.to_string());
            cmd.edit(ctx, &card).await?;
            return Ok(());
        }
    };

    // Determine if playing immediately or queueing.
    let is_currently_playing = {
        let q = mc.queue.lock().await;
        q.current.is_some()
    };

    if tracks.len() > 1 {
        // Playlist — add all tracks.
        let count = tracks.len();
        {
            let mut q = mc.queue.lock().await;
            for track in &tracks {
                q.push(track.clone());
            }
        }

        if !is_currently_playing {
            // Start playing the first track.
            let first = tracks[0].clone();
            lava::play_track(&mc.lavalink, mc.guild_id, &first).await?;
            {
                let mut q = mc.queue.lock().await;
                q.current = Some(first.clone());
                q.tracks.pop_front(); // remove the now-playing from queue list
            }

            let (loop_mode, shuffled, volume) = {
                let q = mc.queue.lock().await;
                (q.loop_mode, q.shuffle, q.volume)
            };

            let card = build_now_playing_card(&first, 0, loop_mode, shuffled, volume, count.saturating_sub(1), false);
            let msg = cmd.edit(ctx, &card).await?;
            
            let mut q = mc.queue.lock().await;
            q.now_playing_msg = Some((msg.channel_id, msg.id));
        } else {
            let card = build_playlist_queued_card(&tracks);
            cmd.edit(ctx, &card).await?;
        }
    } else {
        // Single track.
        let track = tracks.into_iter().next().unwrap();

        if !is_currently_playing {
            // Play now.
            lava::play_track(&mc.lavalink, mc.guild_id, &track).await?;
            {
                let mut q = mc.queue.lock().await;
                q.current = Some(track.clone());
            }

            let (loop_mode, shuffled, volume) = {
                let q = mc.queue.lock().await;
                (q.loop_mode, q.shuffle, q.volume)
            };

            let card = build_now_playing_card(&track, 0, loop_mode, shuffled, volume, 0, false);
            let msg = cmd.edit(ctx, &card).await?;
            
            let mut q = mc.queue.lock().await;
            q.now_playing_msg = Some((msg.channel_id, msg.id));
        } else {
            // Enqueue.
            let position = {
                let mut q = mc.queue.lock().await;
                q.push(track.clone());
                q.tracks.len()
            };

            let card = build_queued_card(&track, position);
            cmd.edit(ctx, &card).await?;
        }
    }

    Ok(())
}
