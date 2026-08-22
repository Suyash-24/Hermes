/// /stop — stop playback and clear the queue.
use super::music_cards::{build_error_card, build_success_card};
use super::music_helpers::resolve_music_context;

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

    {
        let mut q = mc.queue.lock().await;
        q.current = None;
        q.clear();
    }

    let card = build_success_card("⏹ Stopped playback and cleared the queue.");
    cmd.respond(ctx, &card).await?;
    Ok(())
}
