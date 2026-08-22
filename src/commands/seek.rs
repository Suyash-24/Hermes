/// /seek <mm:ss> — seek to a timestamp in the current track.
use super::music_cards::{build_error_card, build_success_card};
use super::music_helpers::resolve_music_context;
use crate::components::emoji::{format_duration_ms, parse_timestamp, E};
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
            respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
                .await.map_err(BotError::Discord)?;
            return Ok(());
        }
    };

    let ts_str = cmd
        .data
        .options
        .first()
        .and_then(|o| o.value.as_str())
        .unwrap_or("");

    let position_ms = match parse_timestamp(ts_str) {
        Some(ms) => ms,
        None => {
            let card = build_error_card(&format!("Invalid timestamp `{ts_str}`. Use `mm:ss` or `hh:mm:ss`."));
            respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
                .await.map_err(BotError::Discord)?;
            return Ok(());
        }
    };

    // Validate against track duration.
    let duration_ms = {
        let q = mc.queue.lock().await;
        q.current.as_ref().map(|t| t.duration_ms).unwrap_or(0)
    };

    if duration_ms > 0 && position_ms > duration_ms {
        let card = build_error_card(&format!(
            "Cannot seek past the end of the track (`{}`).",
            format_duration_ms(duration_ms)
        ));
        respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
            .await.map_err(BotError::Discord)?;
        return Ok(());
    }

    lava::seek(&mc.lavalink, mc.guild_id, position_ms).await?;

    let card = build_success_card(&format!("{} Seeked to `{}`", E::DURATION, format_duration_ms(position_ms)));
    respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
        .await.map_err(BotError::Discord)?;
    Ok(())
}
