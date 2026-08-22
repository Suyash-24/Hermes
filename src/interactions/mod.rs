/// Component & modal interaction dispatcher for Fade.
///
/// Every button click, select menu change, and modal submission lands here.
/// Each handler follows the same pattern:
///   1. Acknowledge the interaction (edit the original message)
///   2. Rebuild the response using the Components v2 builder
///   3. Return BotResult — errors are caught by handler.rs
///
/// # Custom ID conventions
///   "ping_refresh"          — re-run ping, edit in place
///   "info_refresh"          — re-run info, edit in place
///   "music_pause"           — toggle pause/resume on now-playing card
///   "music_skip"            — skip current track
///   "music_stop"            — stop + clear queue
///   "music_shuffle"         — toggle shuffle
///   "music_loop"            — cycle loop mode
///   "music_vol_down"        — volume -10
///   "music_vol_up"          — volume +10
///   "music_prev"            — previous track (ack only)
///   "queue_prev_{page}"     — queue pagination prev
///   "queue_next_{page}"     — queue pagination next
pub mod info;
pub mod music;
pub mod ping;
pub mod avatar;

use crate::error::BotResult;
use crate::state::AppState;
use serenity::{
    model::application::{ComponentInteraction, ModalInteraction},
    prelude::*,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::warn;

// ── Component dispatch ────────────────────────────────────────────────────────

pub async fn dispatch(
    ctx: &Context,
    component: &ComponentInteraction,
    state: Arc<RwLock<AppState>>,
) -> BotResult {
    let id = component.data.custom_id.as_str();

    match id {
        "ping_refresh" => ping::handle_refresh(ctx, component, state).await,
        "info_refresh" => info::handle_refresh(ctx, component, state).await,

        id if id.starts_with("avatar_") => {
            avatar::handle_toggle(ctx, component).await
        }

        // Music controls
        "music_pause" | "music_skip" | "music_stop" | "music_shuffle" |
        "music_loop"  | "music_vol_down" | "music_vol_up" | "music_prev" => {
            music::handle(ctx, component, state, id).await
        }

        // Queue pagination — id is "queue_prev_{page}" or "queue_next_{page}"
        id if id.starts_with("queue_prev_") || id.starts_with("queue_next_") => {
            music::handle(ctx, component, state, id).await
        }

        _ => {
            warn!(id = %id, "Unknown component interaction");
            ack_update(ctx, component).await
        }
    }
}

// ── Modal dispatch ────────────────────────────────────────────────────────────

pub async fn dispatch_modal(
    ctx: &Context,
    modal: &ModalInteraction,
    _state: Arc<RwLock<AppState>>,
) -> BotResult {
    warn!(id = %modal.data.custom_id, "Unhandled modal submitted");
    modal
        .create_response(
            &ctx.http,
            serenity::builder::CreateInteractionResponse::Acknowledge,
        )
        .await
        .map_err(BotError::Discord)?;
    Ok(())
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/// Acknowledge a component interaction by updating the message.
/// Used when we have nothing new to say (unknown IDs, no-op buttons).
async fn ack_update(ctx: &Context, component: &ComponentInteraction) -> BotResult {
    component
        .create_response(
            &ctx.http,
            serenity::builder::CreateInteractionResponse::Acknowledge,
        )
        .await
        .map_err(BotError::Discord)?;
    Ok(())
}

/// Edit the original interaction message with a new raw JSON body.
/// Used by refresh handlers to update the Components v2 payload in place.
pub async fn edit_response(
    ctx: &Context,
    component: &ComponentInteraction,
    body: serde_json::Value,
) -> BotResult {
    // Acknowledge first — tells Discord we received the click
    component
        .create_response(
            &ctx.http,
            serenity::builder::CreateInteractionResponse::Acknowledge,
        )
        .await
        .map_err(BotError::Discord)?;

    // Then patch the original message
    ctx.http
        .edit_original_interaction_response(
            &component.token,
            &body,
            vec![],
        )
        .await
        .map_err(BotError::Discord)?;

    Ok(())
}
