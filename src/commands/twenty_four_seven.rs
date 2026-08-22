use crate::commands::music_cards::{build_error_card, build_success_card};
use crate::error::BotResult;
use crate::state::AppState;
use serenity::model::Permissions;
use serenity::prelude::*;
use std::sync::Arc;

pub async fn run(
    ctx: &Context,
    cmd: &crate::commands::context::CommandContext<'_>,
    state: Arc<tokio::sync::RwLock<AppState>>,
    _args: &[&str],
) -> BotResult<()> {
    let guild_id = match cmd.guild_id() {
        Some(id) => id,
        None => {
            let card = build_error_card("Must be used in a server.");
            cmd.respond(ctx, &card).await?;
            return Ok(());
        }
    };

    let has_perms = match cmd.member(ctx).await {
        Ok(member) => {
            #[allow(deprecated)]
            if let Ok(perms) = member.permissions(ctx) {
                perms.contains(Permissions::MANAGE_GUILD)
            } else {
                false
            }
        },
        Err(_) => false,
    };

    let is_owner = {
        let state_read = state.read().await;
        state_read.config.bot.owners.contains(&cmd.user_id().get())
    };

    if !has_perms && !is_owner {
        let card = build_error_card("You must have `Manage Server` permission to use this command.");
        cmd.respond(ctx, &card).await?;
        return Ok(());
    }

    let is_now_enabled = {
        let state_read = state.read().await;
        let mut db = state_read.db.write().await;
        let enabled = if db.twenty_four_seven.contains(&guild_id.get()) {
            db.twenty_four_seven.remove(&guild_id.get());
            false
        } else {
            db.twenty_four_seven.insert(guild_id.get());
            true
        };
        db.save();
        enabled
    };

    let msg = if is_now_enabled {
        "✅ 24/7 mode **Enabled**. The bot will stay in the voice channel after the queue ends."
    } else {
        "❌ 24/7 mode **Disabled**. The bot will leave the voice channel when stopped or queue ends."
    };

    let card = build_success_card(msg);
    cmd.respond(ctx, &card).await?;

    Ok(())
}
