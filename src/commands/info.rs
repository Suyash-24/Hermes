/// /info — Show bot information and server stats.
/// Also contains the info refresh button handler.
use crate::components::emoji::{header, hint, E};
use crate::components::v2::{ButtonStyle, FadeResponse, IS_COMPONENTS_V2};
use crate::error::{BotError, BotResult};
use crate::state::{AppState, ShardManagerKey};
use serenity::{model::application::ComponentInteraction, prelude::*};
use std::sync::Arc;
use tokio::sync::RwLock;

// ── Slash command ─────────────────────────────────────────────────────────────

pub async fn run(
    ctx: &Context,
    cmd: &crate::commands::context::CommandContext<'_>,
    _state: Arc<RwLock<AppState>>,
    _args: &[&str],
) -> BotResult<()> {
    let response = build_info_response(ctx, cmd.guild_id()).await;
    cmd.respond(ctx, &response).await?;
    Ok(())
}

// ── Refresh button ────────────────────────────────────────────────────────────

pub async fn handle_refresh(
    ctx: &Context,
    component: &ComponentInteraction,
    _state: Arc<RwLock<AppState>>,
) -> BotResult {
    let response = build_info_response(ctx, component.guild_id).await;
    crate::interactions::edit_response(ctx, component, build_edit_body(&response)).await
}

fn build_edit_body(response: &FadeResponse) -> serde_json::Value {
    serde_json::json!({
        "content": null, "flags": IS_COMPONENTS_V2,
        "components": response.components_value(),
    })
}

// ── Shared builder ────────────────────────────────────────────────────────────

async fn build_info_response(
    ctx: &Context,
    guild_id: Option<serenity::model::id::GuildId>,
) -> FadeResponse {
    let bot_user    = ctx.cache.current_user().clone();
    let guild_count = ctx.cache.guild_count();
    let version     = env!("CARGO_PKG_VERSION");

    let latency_display = {
        let ws_latency = {
            let data = ctx.data.read().await;
            if let Some(shard_mgr) = data.get::<ShardManagerKey>() {
                let runners = shard_mgr.runners.lock().await;
                runners
                    .get(&ctx.shard_id)
                    .and_then(|r| r.latency)
                    .map(|d| format!("{}ms", d.as_millis()))
            } else {
                None
            }
        };

        match ws_latency {
            Some(l) => l,
            None => {
                let start = std::time::Instant::now();
                let _ = ctx.http.get_current_user().await;
                format!("~{}ms", start.elapsed().as_millis())
            }
        }
    };

    let bot_avatar = bot_user
        .avatar_url()
        .unwrap_or_else(|| bot_user.default_avatar_url());

    FadeResponse::new()
        .container(None, |c| {
            c.section(|s| {
                s.text(header(E::BRAND, &bot_user.name))
                 .text(hint(format!("v{} {} shard #{}", version, E::DOT, ctx.shard_id)))
                 .thumbnail(&bot_avatar)
            })
            .text(format!(
                "```yaml\nVersion: v{}\nServers: {}\nShard:   #{}\nLatency: {}\n```",
                version, guild_count, ctx.shard_id, latency_display
            ))
            .separator(true)
            .action_row(|r| {
                r.link("https://github.com", "Source")
                 .button_emoji("info_refresh", "Refresh", ButtonStyle::Secondary, E::REFRESH)
            })
        })
}
