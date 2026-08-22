/// /ping — Check Fade's latency and shard info.
/// /ping refresh button interaction handler.
use crate::components::emoji::{header, stat, E};
use crate::components::v2::{ButtonStyle, FadeResponse, IS_COMPONENTS_V2, respond_to_interaction};
use crate::error::{BotError, BotResult};
use crate::state::{AppState, ShardManagerKey};
use serenity::{model::application::ComponentInteraction, prelude::*};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;

// ── Slash command ─────────────────────────────────────────────────────────────

pub async fn run(
    ctx: &Context,
    cmd: &crate::commands::context::CommandContext<'_>,
    _state: Arc<RwLock<AppState>>,
    _args: &[&str],
) -> BotResult<()> {
    // Try getting WebSocket heartbeat latency from shard manager.
    // Falls back to measuring a REST round-trip if the heartbeat hasn't fired yet.
    let latency_display = {
        let ws_latency = {
            let data = ctx.data.read().await;
            if let Some(shard_mgr) = data.get::<ShardManagerKey>() {
                let runners = shard_mgr.runners.lock().await;
                runners
                    .get(&ctx.shard_id)
                    .and_then(|r| r.latency)
                    .map(|d| format!("{}ms (WS)", d.as_millis()))
            } else {
                None
            }
        };

        match ws_latency {
            Some(l) => l,
            None => {
                // Measure REST round-trip as a proxy for latency.
                let start = std::time::Instant::now();
                let _ = ctx.http.get_current_user().await;
                format!("~{}ms (REST)", start.elapsed().as_millis())
            }
        }
    };

    let now_ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

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
    let card = FadeResponse::new()
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

    cmd.respond(ctx, &card).await?;
    Ok(())
}

// ── Refresh button ────────────────────────────────────────────────────────────

pub async fn handle_refresh(
    ctx: &Context,
    component: &ComponentInteraction,
    _state: Arc<RwLock<AppState>>,
) -> BotResult {
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

    crate::interactions::edit_response(ctx, component, build_edit_body(&response)).await
}

fn build_edit_body(response: &FadeResponse) -> serde_json::Value {
    serde_json::json!({
        "flags":      IS_COMPONENTS_V2 | 64u64,
        "components": response.components_value(),
    })
}
