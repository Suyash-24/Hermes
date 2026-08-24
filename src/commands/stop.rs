/// /stop — stop playback and clear the queue.
use super::music_cards::{build_error_card, build_success_card};
use super::music_helpers::resolve_music_context;
use crate::components::emoji::E;

use crate::error::BotResult;
use crate::music::lavalink as lava;
use crate::state::AppState;
use serenity::prelude::*;
use std::sync::Arc;
use tokio::sync::RwLock;

pub async fn run(ctx: &Context, cmd: &crate::commands::context::CommandContext<'_>, state: Arc<RwLock<AppState>>, _args: &[&str]) -> BotResult<()> {
    let mc = match resolve_music_context(ctx, cmd, &state, true).await {
        Ok(c) => c,
        Err(e) => {
            let card = build_error_card(&e.to_string());
            cmd.respond(ctx, &card).await?;
            return Ok(());
        }
    };

    lava::stop(&mc.lavalink, mc.guild_id).await?;

    let is_24_7 = {
        let app_state = state.read().await;
        let db_lock = app_state.db.read().await;
        db_lock.twenty_four_seven.contains(&mc.guild_id.get())
    };

    if !is_24_7 {
        if let Some(manager) = songbird::get(ctx).await {
            let _ = manager.remove(mc.guild_id).await;
        }
        let _ = crate::music::lavalink::destroy_player(&mc.lavalink, mc.guild_id).await;
        
        let mut q = mc.queue.lock().await;
        if let Some(vc_id) = q.voice_channel {
            crate::music::status::update_voice_status(&ctx.http, vc_id, "", None, None).await;
        }
        q.voice_channel = None;
        q.text_channel = None;
        q.now_playing_msg = None;
    } else {
        let q = mc.queue.lock().await;
        if let Some(vc_id) = q.voice_channel {
            crate::music::status::update_voice_status(&ctx.http, vc_id, "Idle - Use /play", None, None).await;
        }
    }

    {
        let mut q = mc.queue.lock().await;
        q.current = None;
        q.clear();
    }

    let card = build_success_card(&format!("{} Stopped playback and cleared the queue.", E::STOPPED));
    cmd.respond(ctx, &card).await?;
    Ok(())
}
