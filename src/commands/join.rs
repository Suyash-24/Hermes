/// /join — join the invoker's voice channel.
use super::music_cards::{build_error_card, build_success_card};
use super::music_helpers::resolve_music_context;
use crate::components::emoji::E;

use crate::error::BotResult;
use crate::state::AppState;
use serenity::prelude::*;
use std::sync::Arc;
use tokio::sync::RwLock;

pub async fn run(
    ctx: &Context,
    cmd: &crate::commands::context::CommandContext<'_>,
    state: Arc<RwLock<AppState>>,
    _args: &[&str],
) -> BotResult<()> {
    let mc = match resolve_music_context(ctx, cmd, &state, false).await {
        Ok(c) => c,
        Err(e) => {
            let card = build_error_card(&e.to_string());
            cmd.respond(ctx, &card).await?;
            return Ok(());
        }
    };

    let is_playing = {
        let q = mc.queue.lock().await;
        if let Some(bot_vc) = q.voice_channel {
            if bot_vc != mc.voice_channel && q.current.is_some() {
                true
            } else {
                false
            }
        } else {
            false
        }
    };

    if is_playing {
        let card = build_error_card("I am already playing music in another voice channel!");
        cmd.respond(ctx, &card).await?;
        return Ok(());
    }

    // Use songbird to join the voice channel
    let manager = songbird::get(ctx).await.expect("Songbird client placed in at initialization").clone();
    let handler = manager.join_gateway(mc.guild_id, mc.voice_channel).await;

    match handler {
        Ok((conn_info, _)) => {
            let lava_conn = lavalink_rs::model::player::ConnectionInfo {
                endpoint: conn_info.endpoint.clone(),
                token: conn_info.token.clone(),
                session_id: conn_info.session_id.clone(),
                channel_id: Some(mc.voice_channel.into()),
            };

            // Initialize the player context with the connection info
            if let Err(e) = mc.lavalink.create_player_context(mc.guild_id, lava_conn).await {
                let card = build_error_card(&format!("Failed to create player context: {}", e));
                cmd.respond(ctx, &card).await?;
                return Ok(());
            }
        }
        Err(why) => {
            let card = build_error_card(&format!("Could not connect to voice channel: {}", why));
            cmd.respond(ctx, &card).await?;
            return Ok(());
        }
    }

    {
        let mut q = mc.queue.lock().await;
        q.voice_channel = Some(mc.voice_channel);
        q.text_channel = Some(cmd.channel_id());
    }

    // Set idle voice channel status
    crate::music::status::update_voice_status(
        &ctx.http,
        mc.voice_channel,
        "Play a song with /play",
        None,
        None,
    ).await;

    let card = build_success_card(&format!("{} Joined voice channel!", E::JOINED_VC));
    cmd.respond(ctx, &card).await?;
    Ok(())
}
