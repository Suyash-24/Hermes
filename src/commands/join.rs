/// /join — join the invoker's voice channel.
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
    let mc = match resolve_music_context(ctx, cmd, &state, false).await {
        Ok(c) => c,
        Err(e) => {
            let card = build_error_card(&e.to_string());
            respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
                .await.map_err(BotError::Discord)?;
            return Ok(());
        }
    };

    // Use songbird to join the voice channel
    let manager = songbird::get(ctx).await.expect("Songbird client placed in at initialization").clone();
    let handler = manager.join_gateway(mc.guild_id, mc.voice_channel).await;

    match handler {
        Ok((conn_info, _)) => {
            let lava_conn = lavalink_rs::model::player::ConnectionInfo {
                endpoint: conn_info.endpoint.clone(),
                token: conn_info.token.clone(),
                session_id: conn_info.session_id.clone(),
                channel_id: Some(mc.voice_channel.into()),
            };

            // Initialize the player context with the connection info
            if let Err(e) = mc.lavalink.create_player_context(mc.guild_id, lava_conn).await {
                let card = build_error_card(&format!("Failed to create player context: {}", e));
                respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
                    .await
                    .map_err(BotError::Discord)?;
                return Ok(());
            }
        }
        Err(why) => {
            let card = build_error_card(&format!("Could not connect to voice channel: {}", why));
            respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
                .await
                .map_err(BotError::Discord)?;
            return Ok(());
        }
    }

    {
        let mut q = mc.queue.lock().await;
        q.voice_channel = Some(mc.voice_channel);
        q.text_channel = Some(cmd.channel_id);
    }

    let card = build_success_card(&format!("{} Joined voice channel!", E::JOINED_VC));
    respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
        .await.map_err(BotError::Discord)?;
    Ok(())
}
