/// /queue [page] — show the current queue with pagination.
use super::music_cards::{build_error_card, build_queue_card};
use super::music_helpers::resolve_music_context;
use crate::components::v2::respond_to_interaction;
use crate::error::{BotError, BotResult};
use crate::state::AppState;
use serenity::{model::application::CommandInteraction, prelude::*};
use std::sync::Arc;
use tokio::sync::RwLock;

pub const PAGE_SIZE: usize = 8;

pub async fn run(ctx: &Context, cmd: &CommandInteraction, state: Arc<RwLock<AppState>>) -> BotResult {
    let mc = match resolve_music_context(ctx, cmd, &state, true).await {
        Ok(c) => c,
        Err(e) => {
            let card = build_error_card(&e.to_string());
            respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
                .await.map_err(BotError::Discord)?;
            return Ok(());
        }
    };

    let page = cmd
        .data
        .options
        .first()
        .and_then(|o| o.value.as_i64())
        .unwrap_or(1)
        .max(1) as usize - 1; // convert 1-based to 0-based

    let (tracks_snap, current, loop_mode, shuffled, volume) = {
        let q = mc.queue.lock().await;
        (
            q.tracks.iter().cloned().collect::<Vec<_>>(),
            q.current.clone(),
            q.loop_mode,
            q.shuffle,
            q.volume,
        )
    };

    let total_pages = (tracks_snap.len() + PAGE_SIZE - 1) / PAGE_SIZE.max(1);
    let page = page.min(total_pages.saturating_sub(1));

    let card = build_queue_card(
        &tracks_snap,
        current.as_ref(),
        page,
        total_pages,
        loop_mode,
        shuffled,
        volume,
    );
    respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
        .await.map_err(BotError::Discord)?;
    Ok(())
}
