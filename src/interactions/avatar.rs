use crate::components::emoji::{header, stat, E};
use crate::components::v2::{ButtonStyle, FadeResponse};
use crate::error::{BotError, BotResult};
use serenity::{
    model::application::ComponentInteraction,
    model::id::UserId,
    prelude::*,
};

pub async fn handle_toggle(ctx: &Context, component: &ComponentInteraction) -> BotResult {
    let id = component.data.custom_id.as_str();
    // Expected format: avatar_SERVER_123456 or avatar_MAIN_123456
    let parts: Vec<&str> = id.split('_').collect();
    if parts.len() < 3 {
        return crate::interactions::ack_update(ctx, component).await;
    }

    let mode = parts[1]; // "SERVER" or "MAIN"
    let user_id: UserId = match parts[2].parse::<u64>() {
        Ok(uid) => UserId::new(uid),
        Err(_) => return crate::interactions::ack_update(ctx, component).await,
    };

    let guild_id = match component.guild_id {
        Some(gid) => gid,
        None => return crate::interactions::ack_update(ctx, component).await,
    };

    // Fetch the member to get both avatars
    let member = match ctx.http.get_member(guild_id, user_id).await {
        Ok(m) => m,
        Err(_) => return crate::interactions::ack_update(ctx, component).await,
    };

    let target = member.user.clone();
    let display_name = target.global_name.as_deref().unwrap_or(&target.name).to_string();

    let base_url = target.avatar_url().unwrap_or_else(|| target.default_avatar_url());
    let png_hd = base_url.replace("size=1024", "size=4096").replace(".webp", ".png");
    let has_anim = target.avatar.as_ref().map(|a| a.to_string().starts_with("a_")).unwrap_or(false);
    let gif_url = has_anim.then(|| {
        base_url.replace("size=1024", "size=4096").replace(".webp", ".gif")
    });
    let main_url = gif_url.unwrap_or(png_hd);

    let guild_avatar = member.avatar_url().map(|u| u.replace("size=1024", "size=4096"));
    let server_url = guild_avatar.unwrap_or_else(|| main_url.clone());

    let (active_url, next_mode, button_label) = if mode == "SERVER" {
        (server_url, "MAIN", "Main Avatar")
    } else {
        (main_url.clone(), "SERVER", "Server Avatar")
    };

    let new_custom_id = format!("avatar_{}_{}", next_mode, user_id.get());

    let response = FadeResponse::new()
        .container(None, |c| {
            let c = c.section(|s| {
                s.text(header(E::BRAND, &display_name))
                 .text(stat(E::ID, "User ID", target.id))
            })
            .separator(true);

            let c = c.media_gallery(|g| {
                g.item(&active_url, None)
            })
            .separator(true);

            c.action_row(|r| {
                r.link(&active_url, "View Avatar")
                 .button(&new_custom_id, button_label, ButtonStyle::Primary)
            })
        });

    crate::interactions::edit_response(ctx, component, build_edit_body(&response)).await
}

fn build_edit_body(response: &FadeResponse) -> serde_json::Value {
    serde_json::json!({
        "flags": crate::components::v2::IS_COMPONENTS_V2,
        "components": response.components_value(),
    })
}
