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
    args: &[&str],
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

    // Bot owner can also set it
    let is_owner = {
        let state_read = state.read().await;
        state_read.config.bot.owners.contains(&cmd.user_id().get())
    };

    if !has_perms && !is_owner {
        let card = build_error_card("You must have `Manage Server` permission to use this command.");
        cmd.respond(ctx, &card).await?;
        return Ok(());
    }

    let new_prefix = if args.is_empty() {
        if let Some(serenity::model::application::CommandDataOptionValue::String(s)) = cmd.get_option("prefix") {
            s.to_string()
        } else {
            let card = build_error_card("Usage: setprefix <new_prefix>");
            cmd.respond(ctx, &card).await?;
            return Ok(());
        }
    } else {
        args[0].to_string()
    };

    if new_prefix.len() > 5 && new_prefix.to_lowercase() != "default" && new_prefix.to_lowercase() != "reset" && new_prefix.to_lowercase() != "remove" {
        let card = build_error_card("Prefix cannot be longer than 5 characters.");
        cmd.respond(ctx, &card).await?;
        return Ok(());
    }

    let is_reset = matches!(new_prefix.to_lowercase().as_str(), "default" | "reset" | "remove");

    {
        let state_read = state.read().await;
        let mut db = state_read.db.write().await;
        if is_reset {
            db.guild_prefixes.remove(&guild_id.get());
        } else {
            db.guild_prefixes.insert(guild_id.get(), new_prefix.clone());
        }
        db.save();
    }

    let msg = if is_reset {
        format!("{} Server prefix has been reset to the default.", crate::components::emoji::E::OK)
    } else {
        format!("{} Server prefix has been set to `{}`\n(The default prefix will also still work).", crate::components::emoji::E::OK, new_prefix)
    };

    let card = build_success_card(&msg);
    cmd.respond(ctx, &card).await?;

    Ok(())
}
