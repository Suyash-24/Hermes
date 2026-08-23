use crate::components::v2::FadeResponse;
use crate::error::{BotError, BotResult};
use crate::state::AppState;
use serenity::model::Permissions;
use serenity::prelude::*;
use std::sync::Arc;
use tokio::sync::RwLock;

pub async fn run(
    ctx: &Context,
    cmd: &crate::commands::context::CommandContext<'_>,
    state: Arc<RwLock<AppState>>,
    _args: &[&str],
) -> BotResult<()> {
    cmd.defer(ctx).await?;

    let guild_id = cmd.guild_id().ok_or(BotError::Custom("This command can only be used in a server.".to_string()))?;

    let mut has_admin = false;
    if let Ok(member) = guild_id.member(&ctx.http, cmd.user_id()).await {
        #[allow(deprecated)]
        if let Ok(perms) = member.permissions(ctx) {
            has_admin = perms.contains(Permissions::ADMINISTRATOR);
        }
    }

    if !has_admin {
        return Err(BotError::Custom("You need Administrator permissions to use this command.".to_string()));
    }

    let is_enabled = {
        let state_guard = state.read().await;
        let mut db = state_guard.db.write().await;
        
        let currently = db.admin_bypass.get(&guild_id.get()).copied().unwrap_or(true);
        db.admin_bypass.insert(guild_id.get(), !currently);
        
        db.save();
        !currently
    };

    use crate::components::emoji::E;
    let msg = if is_enabled {
        format!("{} **Admin Bypass enabled.** Server administrators will now bypass all channel restrictions.", E::OK)
    } else {
        format!("{} **Admin Bypass disabled.** Channel restrictions (whitelists/blacklists) will now apply to everyone, including administrators.", E::OK)
    };

    let card = FadeResponse::new().container(None, |c| c.text(msg));
    cmd.edit(ctx, &card).await?;

    Ok(())
}
