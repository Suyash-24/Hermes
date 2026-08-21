/// /volume <0-150> — set the playback volume.
use super::music_cards::{build_error_card, build_success_card};
use super::music_helpers::resolve_music_context;
use crate::components::emoji::E;
use crate::components::v2::respond_to_interaction;
use crate::error::{BotError, BotResult};
use crate::music::lavalink as lava;
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

    let vol = cmd
        .data
        .options
        .first()
        .and_then(|o| o.value.as_i64())
        .unwrap_or(100);

    if !(0..=150).contains(&vol) {
        let card = build_error_card("Volume must be between 0 and 150.");
        respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
            .await.map_err(BotError::Discord)?;
        return Ok(());
    }

    lava::set_volume(&mc.lavalink, mc.guild_id, vol as u16).await?;

    {
        let mut q = mc.queue.lock().await;
        q.volume = vol as u8;
    }

    let emoji = if vol == 0 { E::MUTED } else if vol < 50 { E::VOLUME_DOWN } else { E::VOLUME_UP };
    let card = build_success_card(&format!("{emoji} Volume set to **{vol}%**"));
    respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
        .await.map_err(BotError::Discord)?;
    Ok(())
}
