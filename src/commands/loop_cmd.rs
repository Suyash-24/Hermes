/// /loop [off|track|queue] — toggle loop mode.
use super::music_cards::{build_error_card, build_success_card};
use super::music_helpers::resolve_music_context;
use crate::components::emoji::E;

use crate::error::BotResult;
use crate::music::queue::LoopMode;
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

    let mode_str = match cmd { crate::commands::context::CommandContext::Slash(c) => c.data.options().iter().find_map(|opt| match &opt.value { serenity::model::application::ResolvedValue::String(s) => Some(*s), _ => None }), crate::commands::context::CommandContext::Prefix(_) => _args.first().copied() };

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
    cmd.respond(ctx, &card).await?;
    Ok(())
}
