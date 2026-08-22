/// Ping refresh button handler.
///
/// When the user clicks "Refresh" on a `/ping` response, we rebuild the
/// ping card with fresh latency data and edit the original message in place.
use crate::components::emoji::{header, stat, E};
use crate::components::v2::{ButtonStyle, FadeResponse, IS_COMPONENTS_V2};
use crate::error::BotResult;
use crate::state::{AppState, ShardManagerKey};
use serenity::{model::application::ComponentInteraction, prelude::*};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;

pub async fn handle_refresh(
    ctx: &Context,
    component: &ComponentInteraction,
    _state: Arc<RwLock<AppState>>,
) -> BotResult {
    // Fresh latency reading from shard heartbeat
    let latency_display = {
        let data = ctx.data.read().await;
        if let Some(shard_mgr) = data.get::<ShardManagerKey>() {
            let runners = shard_mgr.runners.lock().await;
            runners
                .get(&ctx.shard_id)
                .and_then(|r| r.latency)
                .map(|d| format!("{}ms", d.as_millis()))
                .unwrap_or_else(|| String::from("Measuring..."))
        } else {
            String::from("Unavailable")
        }
    };

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
