use crate::components::v2::FadeResponse;
use crate::error::BotResult;
use crate::state::AppState;
use serenity::prelude::*;
use std::sync::Arc;
use tokio::sync::RwLock;

pub async fn run(
    ctx: &Context,
    cmd: &crate::commands::context::CommandContext<'_>,
    _state: Arc<RwLock<AppState>>,
    _args: &[&str],
) -> BotResult<()> {
    cmd.defer(ctx).await?;

    let bot_name = ctx.cache.current_user().name.clone();
    let bot_avatar = ctx.cache.current_user().face();

    let default_prefix = {
        let data = ctx.data.read().await;
        data.get::<crate::config::Config>().unwrap().bot.prefix.clone()
    };
    
    let pfx = if let Some(guild_id) = cmd.guild_id() {
        let state_guard = _state.read().await;
        state_guard.db.get_prefix(guild_id.get()).await.unwrap_or(None).unwrap_or(default_prefix)
    } else {
        default_prefix
    };

    let header = format!("**{} Help Center** 📖\nHere is everything I can do!\n\n✨ **Prefix:** `{}`", bot_name, pfx);

    let music_cmds = "🎵 **Music**\n`play`, `pause`, `resume`, `skip`, `stop`, `join`, `leave`, `queue`, `nowplaying`, `volume`, `seek`, `loop`, `shuffle`, `remove`, `move`, `clear`, `lyrics`";
    let util_cmds = "🛠️ **Utility**\n`ping`, `info`, `avatar`, `serveravatar`, `serverbanner`, `serverbio`, `24/7`, `premium`, `noprefix`, `setprefix`";

    let card = FadeResponse::new().container(None, |c| {
        c.section(|s| {
            s.text(header)
             .thumbnail(bot_avatar)
        })
        .separator(true)
        .text(music_cmds)
        .separator(false)
        .text(util_cmds)
        .action_row(|r| {
            r.link("https://discord.com/invite/SmdUGNXjYv", "Support Server")
        })
    });

    cmd.edit(ctx, &card).await?;

    Ok(())
}
