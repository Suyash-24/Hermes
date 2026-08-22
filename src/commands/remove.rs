/// /remove <position> — remove a track at the given queue position.
use super::music_cards::{build_error_card, build_success_card};
use super::music_helpers::resolve_music_context;
use crate::components::emoji::E;
use crate::components::v2::respond_to_interaction;
use crate::error::{BotError, BotResult};
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

    let pos = cmd
        .data
        .options
        .first()
        .and_then(|o| o.value.as_i64())
        .unwrap_or(0) as usize;

    let removed = {
        let mut q = mc.queue.lock().await;
        q.remove(pos)
    };

    match removed {
        Some(track) => {
            let card = build_success_card(&format!(
                "{} Removed **{}** from position #{pos}",
                E::CLOSE, track.title
            ));
            cmd.respond(ctx, &card).await?;
        }
        None => {
            let card = build_error_card(&format!("No track at position #{pos}."));
            cmd.respond(ctx, &card).await?;
        }
    }

    Ok(())
}
