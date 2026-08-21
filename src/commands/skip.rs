/// /skip [count] — skip current track or the next N tracks.
use super::music_cards::{build_error_card, build_now_playing_card, build_success_card};
use super::music_helpers::resolve_music_context;
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

    let count = cmd
        .data
        .options
        .first()
        .and_then(|o| o.value.as_i64())
        .unwrap_or(1)
        .max(1) as usize;

    let next_track = {
        let mut q = mc.queue.lock().await;
        q.skip(count)
    };

    if let Some(track) = next_track {
        lava::play_track(&mc.lavalink, mc.guild_id, &track).await?;

        let (loop_mode, shuffled, volume, queue_len) = {
            let q = mc.queue.lock().await;
            (q.loop_mode, q.shuffle, q.volume, q.tracks.len())
        };

        let card = build_now_playing_card(&track, 0, loop_mode, shuffled, volume, queue_len, false);
        respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
            .await.map_err(BotError::Discord)?;
    } else {
        lava::stop(&mc.lavalink, mc.guild_id).await?;
        {
            let mut q = mc.queue.lock().await;
            q.current = None;
        }

        let card = build_success_card("⏭ Skipped — queue is now empty.");
        respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
            .await.map_err(BotError::Discord)?;
    }

    Ok(())
}
