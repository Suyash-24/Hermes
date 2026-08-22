/// /move <from> <to> — reorder a track in the queue.
use super::music_cards::{build_error_card, build_success_card};
use super::music_helpers::resolve_music_context;
use crate::components::emoji::E;

use crate::error::BotResult;
use crate::state::AppState;
use serenity::prelude::*;
use std::sync::Arc;
use tokio::sync::RwLock;

pub async fn run(
    ctx: &Context,
    cmd: &crate::commands::context::CommandContext<'_>,
    state: Arc<RwLock<AppState>>,
    args: &[&str],
) -> BotResult<()> {
    let mc = match resolve_music_context(ctx, cmd, &state, true).await {
        Ok(c) => c,
        Err(e) => {
            let card = build_error_card(&e.to_string());
            cmd.respond(ctx, &card).await?;
            return Ok(());
        }
    };

    let (from, to) = match cmd {
        crate::commands::context::CommandContext::Slash(c) => {
            let f = c.data.options.first().and_then(|o| o.value.as_i64()).unwrap_or(0) as usize;
            let t = c.data.options.get(1).and_then(|o| o.value.as_i64()).unwrap_or(0) as usize;
            (f, t)
        }
        crate::commands::context::CommandContext::Prefix(_) => {
            let f = args.first().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
            let t = args.get(1).and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
            (f, t)
        }
    };

    let success = {
        let mut q = mc.queue.lock().await;
        q.move_track(from, to)
    };

    if success {
        let card = build_success_card(&format!(
            "{} Moved track from position #{from} to #{to}",
            E::FORWARD
        ));
        cmd.respond(ctx, &card).await?;
    } else {
        let card = build_error_card(&format!("Invalid positions: #{from} → #{to}."));
        cmd.respond(ctx, &card).await?;
    }

    Ok(())
}
