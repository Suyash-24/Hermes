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

    // Check admin
    let has_admin = match cmd {
        crate::commands::context::CommandContext::Prefix(msg) => {
            if let Some(member) = &msg.member {
                member.permissions.unwrap_or(Permissions::empty()).contains(Permissions::ADMINISTRATOR)
            } else {
                false
            }
        },
        crate::commands::context::CommandContext::Slash(interaction) => {
            if let Some(member) = &interaction.member {
                member.permissions.unwrap_or(Permissions::empty()).contains(Permissions::ADMINISTRATOR)
            } else {
                false
            }
        }
    };

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
