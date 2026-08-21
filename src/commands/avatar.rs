/// /avatar [user] — display a user's avatar in full resolution.
use crate::components::emoji::{header, hint, stat, Colour, E};
use crate::components::v2::{respond_to_interaction, ButtonStyle, FadeResponse};
use crate::error::{BotError, BotResult};
use crate::state::AppState;
use serenity::{
    model::application::{
        CommandInteraction, ResolvedOption, ResolvedValue,
    },
    prelude::*,
};
use std::sync::Arc;
use tokio::sync::RwLock;

pub async fn run(
    ctx: &Context,
    cmd: &CommandInteraction,
    _state: Arc<RwLock<AppState>>,
) -> BotResult {
    // Resolve target — falls back to invoker
    let target = cmd.data.options().iter().find_map(|opt| {
        if opt.name == "user" {
            if let ResolvedOption { value: ResolvedValue::User(u, _), .. } = opt {
                return Some((*u).clone());
            }
        }
        None
    }).unwrap_or_else(|| cmd.user.clone());

    let display_name = target.global_name.as_deref().unwrap_or(&target.name).to_string();

    // Avatar URLs
    let base_url = target.avatar_url().unwrap_or_else(|| target.default_avatar_url());
    let png_hd   = base_url.replace("size=1024", "size=4096").replace(".webp", ".png");
    let has_anim = target.avatar.as_deref().map(|a| a.starts_with("a_")).unwrap_or(false);
    let gif_url  = has_anim.then(|| {
        base_url.replace("size=1024", "size=4096").replace(".webp", ".gif")
    });

    // Guild-specific avatar
    let guild_avatar = cmd.member.as_ref().and_then(|m| m.avatar_url())
        .map(|u| u.replace("size=1024", "size=4096"));

    let response = FadeResponse::new()
        .container(Some(Colour::FADE), |c| {
            let c = c.section(|s| {
                let s = s.text(header(E::BRAND, &display_name))
                         .text(stat(E::ID, "User ID", target.id));
                if guild_avatar.is_some() {
                    s.text(hint("Server avatar available below"))
                } else {
                    s
                }
                .thumbnail(&png_hd)
            })
            .separator(true);

            let c = c.media_gallery(|g| {
                let g = g.item(&png_hd, Some(&display_name));
                if let Some(ref ga) = guild_avatar {
                    g.item(ga, Some("Server avatar"))
                } else { g }
            })
            .separator(true);

            c.action_row(|r| {
                let r = r.link(&png_hd, "PNG 4K");
                let r = if let Some(ref gif) = gif_url {
                    r.link(gif, "GIF 4K")
                } else {
                    r.button_disabled("No GIF", ButtonStyle::Secondary)
                };
                if let Some(ref ga) = guild_avatar {
                    r.link(ga, "Server avatar")
                } else { r }
            })
        });

    respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &response)
        .await
        .map_err(BotError::Discord)
}