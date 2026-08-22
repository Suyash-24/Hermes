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

    // Disconnect from VC using songbird.
    if let Some(manager) = songbird::get(ctx).await {
        let _ = manager.remove(guild_id).await;
    }

    // Clear the queue.
    {
        let queue_arc = {
            let state_lock = state.read().await;
            state_lock.music_queues.get(&guild_id).map(|q| std::sync::Arc::clone(q.value()))
        };
        if let Some(q) = queue_arc {
            let mut queue = q.lock().await;
            queue.current = None;
            queue.clear();
            queue.voice_channel = None;
            queue.text_channel = None;
            queue.now_playing_msg = None;
        }
    }

    let card = build_success_card(&format!("{} Disconnected from voice channel.", E::LEFT_VC));
    respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
        .await.map_err(BotError::Discord)?;
    Ok(())
}
