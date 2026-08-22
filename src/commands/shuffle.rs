/// /shuffle — toggle shuffle mode and optionally shuffle the current queue.
use super::music_cards::{build_error_card, build_success_card};
use super::music_helpers::resolve_music_context;
use crate::components::emoji::E;

use crate::error::BotResult;
use crate::state::AppState;
use serenity::{model::application::prelude::*};
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

    let (new_state, queue_len) = {
        let mut q = mc.queue.lock().await;
        q.shuffle = !q.shuffle;
        if q.shuffle {
            q.shuffle_queue();
        }
        (q.shuffle, q.tracks.len())
    };

    let msg = if new_state {
        format!("{} Shuffle **enabled** — {queue_len} tracks reshuffled.", E::SHUFFLE)
    } else {
        format!("{} Shuffle **disabled**.", E::SHUFFLE)
    };

    let card = build_success_card(&msg);
    cmd.respond(ctx, &card).await?;
    Ok(())
}
