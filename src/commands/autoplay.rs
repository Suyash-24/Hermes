/// /autoplay — Toggle autoplay mode.
///
/// When enabled, the bot will automatically search for and queue a related
/// song when the queue runs dry, based on the last track that was playing.
use super::music_cards::{build_error_card, build_success_card};
use super::music_helpers::resolve_music_context;

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
    let mc = match resolve_music_context(ctx, cmd, &state, false).await? {
        Some(mc) => mc,
        None => return Ok(()),
    };

    let new_state = {
        let mut q = mc.queue.lock().await;
        q.autoplay = !q.autoplay;
        q.autoplay
    };

    let card = if new_state {
        build_success_card(&format!(
            "🔀 **Autoplay Enabled**\nThe bot will automatically queue related songs when the queue runs out."
        ))
    } else {
        build_success_card(&format!(
            "⏹️ **Autoplay Disabled**\nThe bot will stop after the current queue finishes."
        ))
    };

    cmd.edit(ctx, &card).await?;
    Ok(())
}
