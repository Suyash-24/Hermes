/// /info — Show bot information and server stats.
/// Also contains the info refresh button handler.
use crate::components::emoji::{header, hint, stat, subheader, Colour, E};
use crate::components::v2::{ButtonStyle, FadeResponse, IS_COMPONENTS_V2, respond_to_interaction};
use crate::error::{BotError, BotResult};
use crate::state::AppState;
use serenity::{model::application::{CommandInteraction, ComponentInteraction}, prelude::*};
use std::sync::Arc;
use tokio::sync::RwLock;

// ── Slash command ─────────────────────────────────────────────────────────────

pub async fn run(
    ctx: &Context,
    cmd: &CommandInteraction,
    _state: Arc<RwLock<AppState>>,
) -> BotResult {
    let response = build_info_response(ctx, cmd.guild_id).await;
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
    let response = build_info_response(ctx, component.guild_id).await;
    crate::interactions::edit_response(ctx, component, build_edit_body(&response)).await
}

fn build_edit_body(response: &FadeResponse) -> serde_json::Value {
    serde_json::json!({
        "flags":      IS_COMPONENTS_V2,
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

    let (guild_name, member_count, channel_count, boost_level) =
        if let Some(gid) = guild_id {
            if let Some(g) = ctx.cache.guild(gid) {
                (g.name.clone(), g.member_count, g.channels.len(), g.premium_tier as u8)
            } else {
                ("Unknown".into(), 0, 0, 0)
            }
        } else {
            ("Direct Message".into(), 0, 0, 0)
        };

    let bot_avatar = bot_user
        .avatar_url()
        .unwrap_or_else(|| bot_user.default_avatar_url());

    FadeResponse::new()
        .container(Some(Colour::FADE), |c| {
            c.section(|s| {
                s.text(header(E::BRAND, &bot_user.name))
                 .text(hint(format!("v{} {} shard #{}", version, E::DOT, ctx.shard_id)))
                 .thumbnail(&bot_avatar)
            })
            .separator(true)
            .text(subheader("Bot"))
            .text(format!(
                "{}\n{}\n{}",
                stat(E::SERVERS,  "Servers",  format!("{guild_count}")),
                stat(E::LATENCY,  "Shard",    format!("#{}", ctx.shard_id)),
                stat(E::VERSION,  "Version",  format!("v{version}")),
            ))
            .separator(false)
            .text(subheader(&guild_name))
            .text(format!(
                "{}\n{}\n{}",
                stat(E::MEMBERS,  "Members",   format!("{member_count}")),
                stat(E::CHANNELS, "Channels",  format!("{channel_count}")),
                stat(E::BOOSTS,   "Boost tier",format!("{boost_level}")),
            ))
            .separator(true)
            .action_row(|r| {
                r.link("https://github.com", "Source")
                 .button_emoji("info_refresh", "Refresh", ButtonStyle::Secondary, E::REFRESH)
            })
        })
}