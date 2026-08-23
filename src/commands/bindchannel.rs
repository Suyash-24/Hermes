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
    args: &[&str],
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

    let mut target_channel = cmd.channel_id();

    // Parse slash command options or prefix arguments for channel mention
    match cmd {
        crate::commands::context::CommandContext::Slash(interaction) => {
            if let Some(serenity::model::application::CommandDataOptionValue::Channel(id)) = interaction.data.options.iter().find(|opt| opt.name == "channel").map(|opt| opt.value.clone()) {
                target_channel = id;
            }
        },
        crate::commands::context::CommandContext::Prefix(_) => {
            if !args.is_empty() {
                let text = args[0].trim_matches(|c| c == '<' || c == '#' || c == '>');
                if let Ok(id) = text.parse::<u64>() {
                    target_channel = serenity::model::id::ChannelId::new(id);
                }
            }
        }
    }

    let is_whitelisted = {
        let state_guard = state.read().await;
        let mut db = state_guard.db.write().await;
        let list = db.whitelisted_channels.entry(guild_id.get()).or_default();
        
        let currently = list.contains(&target_channel.get());
        if currently {
            list.remove(&target_channel.get());
        } else {
            list.insert(target_channel.get());
        }
        
        db.save();
        !currently
    };

    use crate::components::emoji::E;
    let msg = if is_whitelisted {
        format!("{} <#{}> is now **whitelisted/bound**. I will ONLY listen to commands in bound channels.", E::OK, target_channel.get())
    } else {
        format!("{} <#{}> is **no longer whitelisted**.", E::OK, target_channel.get())
    };

    let card = FadeResponse::new().container(None, |c| c.text(msg));
    cmd.edit(ctx, &card).await?;

    Ok(())
}
