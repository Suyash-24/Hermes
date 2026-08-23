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

    let (is_whitelisted, bound_list) = {
        let state_guard = state.read().await;
        let mut db = state_guard.db.write().await;
        
        // Remove from blacklist if it's there
        if let Some(bl) = db.blacklisted_channels.get_mut(&guild_id.get()) {
            bl.remove(&target_channel.get());
        }

        let list = db.whitelisted_channels.entry(guild_id.get()).or_default();
        
        let currently = list.contains(&target_channel.get());
        if currently {
            list.remove(&target_channel.get());
        } else {
            list.insert(target_channel.get());
        }
        
        let bound_list: Vec<String> = list.iter().map(|id| format!("<#{}>", id)).collect();
        db.save();
        (!currently, bound_list)
    };

    use crate::components::emoji::E;
    let mut msg = if is_whitelisted {
        format!("{} <#{}> is now **whitelisted/bound**. I will ONLY listen to commands in bound channels.", E::OK, target_channel.get())
    } else {
        format!("{} <#{}> is **no longer whitelisted**.", E::OK, target_channel.get())
    };

    if !bound_list.is_empty() {
        msg.push_str("\n\n**Currently Bound Channels:**\n");
        msg.push_str(&bound_list.join(", "));
    } else {
        msg.push_str("\n\n*There are currently no bound channels, so I will listen everywhere.*");
    }

    let card = FadeResponse::new().container(None, |c| c.text(msg));
    cmd.edit(ctx, &card).await?;

    Ok(())
}
