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

    use crate::components::emoji::E;

    let header = format!("{} **{} Help Center**\nExplore all the commands available to you.\n\n{} **Server Prefix:** `{}`", E::BRAND, bot_name, E::SPARK, pfx);

    let music_cmds = format!(
        "{} **Music & Audio**\n> `play` `pause` `resume` `skip` `stop` `queue`\n> `nowplaying` `volume` `seek` `loop` `shuffle`\n> `remove` `move` `clear` `lyrics` `join` `leave`",
        E::MUSIC
    );
    
    let util_cmds = format!(
        "{} **Utility & Config**\n> `ping` `info` `avatar` `serveravatar` `serverbanner`\n> `serverbio` `24/7` `premium` `noprefix` `setprefix`",
        E::SETTINGS
    );

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
            r.button_emoji("help_docs", "Documentation", crate::components::v2::ButtonStyle::Secondary, "📚")
             .link("https://discord.com/invite/SmdUGNXjYv", "Support Server")
        })
    });

    cmd.edit(ctx, &card).await?;

    Ok(())
}
