/// /nowplaying — show the current track with live progress.
use super::music_cards::{build_error_card, build_now_playing_card};
use super::music_helpers::resolve_music_context;
use crate::components::v2::respond_to_interaction;
use crate::error::{BotError, BotResult};
use crate::music::lavalink as lava;
use crate::state::AppState;
use serenity::{model::application::ComponentInteraction, prelude::*};
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

    let (current, loop_mode, shuffled, volume, queue_len) = {
        let q = mc.queue.lock().await;
        (
            q.current.clone(),
            q.loop_mode,
            q.shuffle,
            q.volume,
            q.tracks.len(),
        )
    };

    let track = match current {
        Some(t) => t,
        None => {
            let card = build_error_card("Nothing is currently playing.");
            cmd.respond(ctx, &card).await?;
            return Ok(());
        }
    };

    let position_ms = lava::get_position(&mc.lavalink, mc.guild_id)
        .await
        .unwrap_or(0);

    let card = build_now_playing_card(&track, position_ms, loop_mode, shuffled, volume, queue_len, false);
    cmd.respond(ctx, &card).await?;
    Ok(())
}
