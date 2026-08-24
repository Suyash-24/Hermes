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
                perms.contains(Permissions::ADMINISTRATOR)
            } else {
                false
            }
        },
        Err(_) => false,
    };

    if !has_perms {
        let card = build_error_card("You need the `Administrator` permission to use this command.");
        cmd.respond(ctx, &card).await?;
        return Ok(());
    }

    // Check for Premium
    {
        let state_read = state.read().await;
        let db = state_read.db.read().await;
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        
        let has_premium = match db.premium_guilds.get(&cmd.guild_id().unwrap().get()) {
            Some(&expiration) => expiration == 0 || expiration > now,
            None => false,
        };

        if !has_premium {
            let card = build_error_card("This is a Premium feature! A bot owner must grant this server premium access using the `/premium` command.");
            cmd.respond(ctx, &card).await?;
            return Ok(());
        }
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
        format!("{} 24/7 mode **Enabled**. The bot will stay in the voice channel after the queue ends.", crate::components::emoji::E::OK)
    } else {
        // Edge case: if disabled and we are idle in VC, leave immediately.
        let queue_arc = {
            let state_read = state.read().await;
            state_read.music_queues.get(&guild_id).map(|r| r.value().clone())
        };

        if let Some(queue_arc) = queue_arc {
            let mut q_lock = queue_arc.lock().await;
            if q_lock.current.is_none() && q_lock.voice_channel.is_some() {
                if let Some(vc_id) = q_lock.voice_channel {
                    crate::music::status::update_voice_status(&ctx.http, vc_id, "", None, None).await;
                }
                if let Some(manager) = songbird::get(ctx).await {
                    let _ = manager.remove(guild_id).await;
                }
                let lavalink = {
                    let data = ctx.data.read().await;
                    data.get::<crate::state::LavalinkKey>().expect("LavalinkKey missing").clone()
                };
                let _ = crate::music::lavalink::destroy_player(&lavalink, guild_id).await;
                
                q_lock.voice_channel = None;
                q_lock.text_channel = None;
                q_lock.now_playing_msg = None;
            }
        }
        format!("{} 24/7 mode **Disabled**. The bot will leave the voice channel when stopped or queue ends.", crate::components::emoji::E::ERROR)
    };

    let card = build_success_card(msg);
    cmd.respond(ctx, &card).await?;

    Ok(())
}
