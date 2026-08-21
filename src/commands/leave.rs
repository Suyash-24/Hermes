/// /leave — disconnect from the voice channel.
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
    let guild_id = match cmd.guild_id {
        Some(id) => id,
        None => {
            let card = build_error_card("Must be used in a server.");
            respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
                .await.map_err(BotError::Discord)?;
            return Ok(());
        }
    };

    // Get lavalink
    let lavalink = {
        let data = ctx.data.read().await;
        data.get::<crate::state::LavalinkKey>()
            .expect("LavalinkKey missing")
            .clone()
    };

    // Stop + destroy player.
    let _ = lava::destroy_player(&lavalink, guild_id).await;

    // Disconnect from VC.
    ctx.shard
        .set_voice_state(guild_id, None, false, false)
        .map_err(|e| BotError::Lavalink(format!("{e:?}")))?;

    // Clear the queue.
    {
        let state_lock = state.read().await;
        if let Some(q) = state_lock.music_queues.get(&guild_id) {
            let mut q = q.lock().await;
            q.current = None;
            q.clear();
            q.voice_channel = None;
            q.text_channel = None;
            q.now_playing_msg = None;
        }
    }

    let card = build_success_card(&format!("{} Disconnected from voice channel.", E::LEFT_VC));
    respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
        .await.map_err(BotError::Discord)?;
    Ok(())
}
