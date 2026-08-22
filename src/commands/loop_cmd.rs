/// /loop [off|track|queue] — toggle loop mode.
use super::music_cards::{build_error_card, build_success_card};
use super::music_helpers::resolve_music_context;
use crate::components::emoji::E;
use crate::components::v2::respond_to_interaction;
use crate::error::{BotError, BotResult};
use crate::music::queue::LoopMode;
use crate::state::AppState;
use serenity::{model::application::ComponentInteraction, prelude::*};
use std::sync::Arc;
use tokio::sync::RwLock;

pub async fn run(ctx: &Context, cmd: &crate::commands::context::CommandContext<'_>, state: Arc<RwLock<AppState>>, _args: &[&str]) -> BotResult<()> {
    let mc = match resolve_music_context(ctx, cmd, &state, true).await {
        Ok(c) => c,
        Err(e) => {
            let card = build_error_card(&e.to_string());
            respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
                .await.map_err(BotError::Discord)?;
            return Ok(());
        }
    };

    let mode_str = cmd
        .data
        .options
        .first()
        .and_then(|o| o.value.as_str());

    let new_mode = {
        let mut q = mc.queue.lock().await;
        let mode = match mode_str {
            Some("off")   => LoopMode::Off,
            Some("track") => LoopMode::Track,
            Some("queue") => LoopMode::Queue,
            _             => q.loop_mode.next(), // cycle if no arg
        };
        q.loop_mode = mode;
        mode
    };

    let (emoji, label) = match new_mode {
        LoopMode::Off   => (E::FORWARD,  "Loop **disabled**"),
        LoopMode::Track => (E::LOOP_ONE, "Loop set to **Track**"),
        LoopMode::Queue => (E::LOOP,     "Loop set to **Queue**"),
    };

    let card = build_success_card(&format!("{emoji} {label}"));
    respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
        .await.map_err(BotError::Discord)?;
    Ok(())
}
