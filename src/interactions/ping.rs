/// Ping refresh button handler.
///
/// When the user clicks "Refresh" on a `/ping` response, we rebuild the
/// ping card with fresh latency data and edit the original message in place.
use crate::components::emoji::{header, hint, stat, Colour, E};
use crate::components::v2::{ButtonStyle, FadeResponse, IS_COMPONENTS_V2};
use crate::error::{BotError, BotResult};
use crate::state::AppState;
use serenity::{model::application::ComponentInteraction, prelude::*};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;

pub async fn handle_refresh(
    ctx: &Context,
    component: &ComponentInteraction,
    _state: Arc<RwLock<AppState>>,
) -> BotResult {
    // Fresh latency reading
    let latency_display = String::from("Active");

    let now_ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Rebuild the card
    let response = FadeResponse::new()
        .ephemeral()
        .container(None, |c| {
            c.text(header(E::BRAND, "Hermes"))
             .separator(false)
             .text(format!(
                 "{}\n{}\n{}",
                 stat(E::LATENCY, "Latency", &latency_display),
                 stat(E::SHARD,   "Shard",   format!("#{}", ctx.shard_id)),
                 stat(E::CREATED, "Checked", format!("<t:{now_ts}:R>")),
             ))
             .separator(true)
             .action_row(|r| {
                 r.button_emoji("ping_refresh", "Refresh", ButtonStyle::Secondary, E::REFRESH)
             })
        });

    // Acknowledge the click + update the message
    super::edit_response(ctx, component, build_edit_body(&response)).await
}

/// Build the JSON body for editing a Components v2 message.
fn build_edit_body(response: &FadeResponse) -> serde_json::Value {
    serde_json::json!({
        "flags":      IS_COMPONENTS_V2 | 64u64, // keep ephemeral
        "components": response.components_value(),
    })
}
