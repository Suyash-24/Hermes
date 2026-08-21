/// /move <from> <to> — reorder a track in the queue.
use super::music_cards::{build_error_card, build_success_card};
use super::music_helpers::resolve_music_context;
use crate::components::emoji::E;
use crate::components::v2::respond_to_interaction;
use crate::error::{BotError, BotResult};
use crate::state::AppState;
use serenity::{model::application::CommandInteraction, prelude::*};
use std::sync::Arc;
use tokio::sync::RwLock;

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

    let from = cmd.data.options.first().and_then(|o| o.value.as_i64()).unwrap_or(0) as usize;
    let to   = cmd.data.options.get(1).and_then(|o| o.value.as_i64()).unwrap_or(0) as usize;

    let success = {
        let mut q = mc.queue.lock().await;
        q.move_track(from, to)
    };

    if success {
        let card = build_success_card(&format!(
            "{} Moved track from position #{from} to #{to}",
            E::FORWARD
        ));
        respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
            .await.map_err(BotError::Discord)?;
    } else {
        let card = build_error_card(&format!("Invalid positions: #{from} → #{to}."));
        respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
            .await.map_err(BotError::Discord)?;
    }

    Ok(())
}
