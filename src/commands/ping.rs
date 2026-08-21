/// /ping — Check Fade's latency and shard info.
/// /ping refresh button interaction handler.
use crate::components::emoji::{header, hint, stat, Colour, E};
use crate::components::v2::{ButtonStyle, FadeResponse, IS_COMPONENTS_V2, respond_to_interaction};
use crate::error::{BotError, BotResult};
use crate::state::AppState;
use serenity::{model::application::{CommandInteraction, ComponentInteraction}, prelude::*};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;

// ── Slash command ─────────────────────────────────────────────────────────────

pub async fn run(
    ctx: &Context,
    cmd: &CommandInteraction,
    _state: Arc<RwLock<AppState>>,
) -> BotResult {
    let latency_display = String::from("Active");

    let now_ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let response = FadeResponse::new()
        .ephemeral()
        .container(Some(Colour::FADE), |c| {
            c.text(header(E::BRAND, "Fade"))
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

    respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &response)
        .await
        .map_err(BotError::Discord)
}

// ── Refresh button ────────────────────────────────────────────────────────────

pub async fn handle_refresh(
    ctx: &Context,
    component: &ComponentInteraction,
    _state: Arc<RwLock<AppState>>,
) -> BotResult {
    let latency_display = String::from("Active");

    let now_ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let response = FadeResponse::new()
        .ephemeral()
        .container(Some(Colour::FADE), |c| {
            c.text(header(E::BRAND, "Fade"))
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

    crate::interactions::edit_response(ctx, component, build_edit_body(&response)).await
}

fn build_edit_body(response: &FadeResponse) -> serde_json::Value {
    serde_json::json!({
        "flags":      IS_COMPONENTS_V2 | 64u64,
        "components": response.components_value(),
    })
}