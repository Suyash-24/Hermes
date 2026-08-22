/// Shared helper for music commands.
///
/// Validates that a user is in a voice channel, optionally that the bot is
/// already connected, and extracts the guild queue.
use crate::error::{BotError, BotResult};
use crate::music::{get_or_create_queue, GuildQueue, QueueMap};
use crate::state::{AppState, LavalinkKey};
use lavalink_rs::client::LavalinkClient;
use serenity::{
    model::{
        application::CommandInteraction,
        id::{ChannelId, GuildId},
    },
    prelude::*,
};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

pub struct MusicContext {
    pub guild_id: GuildId,
    pub voice_channel: ChannelId,
    pub queue: Arc<Mutex<GuildQueue>>,
    pub lavalink: LavalinkClient,
}

/// Validate the invoker is in a voice channel and return the essentials.
/// If `require_bot_in_vc` is true, also checks that bot is already connected.
pub async fn resolve_music_context(
    ctx: &Context,
    cmd: &CommandInteraction,
    state: &Arc<RwLock<AppState>>,
    require_bot_in_vc: bool,
) -> BotResult<MusicContext> {
    let guild_id = cmd.guild_id.ok_or(BotError::Permission("Must be used in a server".into()))?;

    // Find the user's voice channel via the cache.
    let voice_channel = ctx
        .cache
        .guild(guild_id)
        .and_then(|g| {
            g.voice_states
                .get(&cmd.user.id)
                .and_then(|vs| vs.channel_id)
        })
        .ok_or(BotError::NotInVoiceChannel)?;

    // Get lavalink.
    let lavalink = {
        let data = ctx.data.read().await;
        data.get::<LavalinkKey>()
            .expect("LavalinkKey missing from TypeMap")
            .clone()
    };

    // Optionally check that bot is in a VC.
    if require_bot_in_vc {
        let bot_in_vc = {
            let queue_arc = {
                let state_lock = state.read().await;
                state_lock.music_queues.get(&guild_id).map(|q| std::sync::Arc::clone(q.value()))
            };
            if let Some(q) = queue_arc {
                q.lock().await.voice_channel.is_some()
            } else {
                false
            }
        };
        if !bot_in_vc {
            return Err(BotError::BotNotInVoiceChannel);
        }
    }

    let queue = {
        let state_lock = state.read().await;
        get_or_create_queue(&state_lock.music_queues, guild_id)
    };

    Ok(MusicContext { guild_id, voice_channel, queue, lavalink })
}


