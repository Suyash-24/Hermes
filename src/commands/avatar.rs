/// /avatar [user] - display a user's avatar in full resolution.
use crate::components::emoji::{header, hint, stat, Colour, E};
use crate::components::v2::{respond_to_interaction, ButtonStyle, FadeResponse};
use crate::error::{BotError, BotResult};
use crate::state::AppState;
use serenity::{
    model::application::{ComponentInteraction, ResolvedOption, ResolvedValue},
    prelude::*,
};
use std::sync::Arc;
use tokio::sync::RwLock;

pub async fn run(
    ctx: &Context,
    cmd: &crate::commands::context::CommandContext<'_>,
    _state: Arc<RwLock<AppState>>,
    _args: &[&str],
) -> BotResult<()> {
    let mut guild_avatar = None;
    let target = match cmd {
        crate::commands::context::CommandContext::Slash(c) => c.data.options().iter().find_map(|opt| {
            if opt.name == "user" {
                if let ResolvedOption { value: ResolvedValue::User(u, _), .. } = opt {
                    return Some((*u).clone());
                }
            }
            None
        }).unwrap_or_else(|| {
            guild_avatar = c.member.as_ref().and_then(|m| m.avatar_url()).map(|u| u.replace("size=1024", "size=4096"));
            c.user.clone()
        }),
        crate::commands::context::CommandContext::Prefix(msg) => {
            if let Some(user) = msg.mentions.first() {
                user.clone()
            } else {
                msg.author.clone()
            }
        }
    };

    if guild_avatar.is_none() && cmd.guild_id().is_some() {
        if let Ok(m) = ctx.http.get_member(cmd.guild_id().unwrap(), target.id).await {
            guild_avatar = m.avatar_url().map(|url| url.replace("size=1024", "size=4096"));
        }
    }

    let display_name = target.global_name.as_deref().unwrap_or(&target.name).to_string();

    let base_url = target.avatar_url().unwrap_or_else(|| target.default_avatar_url());
    let png_hd   = base_url.replace("size=1024", "size=4096").replace(".webp", ".png");
    let has_anim = target.avatar.as_ref().map(|a| a.to_string().starts_with("a_")).unwrap_or(false);
    let gif_url  = has_anim.then(|| {
        base_url.replace("size=1024", "size=4096").replace(".webp", ".gif")
    });

    let main_url = gif_url.unwrap_or(png_hd.clone());

    let response = FadeResponse::new()
        .container(None, |c| {
            let c = c.text(header(E::BRAND, &display_name))
                     .text(stat(E::ID, "User ID", target.id))
            .separator(true);

            let c = c.media_gallery(|g| {
                g.item(&main_url, None)
            })
            .separator(true);

            c.action_row(|r| {
                let r = r.link(&main_url, "View Avatar");
                if guild_avatar.is_some() {
                    let custom_id = format!("avatar_SERVER_{}", target.id);
                    r.button(&custom_id, "Server Avatar", ButtonStyle::Primary)
                } else {
                    r
                }
            })
        });

    cmd.respond(ctx, &response).await?;
    Ok(())
}
