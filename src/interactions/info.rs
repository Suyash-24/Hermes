/// Info refresh button handler.
///
/// Rebuilds the `/info` card with live cache data and edits in place.
use crate::components::emoji::{header, hint, stat, subheader, Colour, E};
use crate::components::v2::{ButtonStyle, FadeResponse, IS_COMPONENTS_V2};
use crate::error::{BotError, BotResult};
use crate::state::AppState;
use serenity::{model::application::ComponentInteraction, prelude::*};
use std::sync::Arc;
use tokio::sync::RwLock;

pub async fn handle_refresh(
    ctx: &Context,
    component: &ComponentInteraction,
    _state: Arc<RwLock<AppState>>,
) -> BotResult {
    let bot_user    = ctx.cache.current_user().clone();
    let guild_count = ctx.cache.guild_count();
    let version     = env!("CARGO_PKG_VERSION");

    let (guild_name, member_count, channel_count, boost_level) =
        if let Some(gid) = component.guild_id {
            if let Some(g) = ctx.cache.guild(gid) {
                (g.name.clone(), g.member_count, g.channels.len(), g.premium_tier.num())
            } else {
                ("Unknown".into(), 0, 0, 0)
            }
        } else {
            ("Direct Message".into(), 0, 0, 0)
        };

    let bot_avatar = bot_user
        .avatar_url()
        .unwrap_or_else(|| bot_user.default_avatar_url());

    let response = FadeResponse::new()
        .container(Some(Colour::FADE), |c| {
            c.section(|s| {
                s.text(header(E::BRAND, &bot_user.name))
                 .text(hint(format!("v{version} {E::DOT} shard #{}", ctx.shard_id)))
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
        });

    super::edit_response(ctx, component, build_edit_body(&response)).await
}

fn build_edit_body(response: &FadeResponse) -> serde_json::Value {
    serde_json::json!({
        "flags":      IS_COMPONENTS_V2,
        "components": response.components_value(),
    })
}