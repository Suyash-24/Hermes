/// /volume <0-150> — set the playback volume.
use super::music_cards::{build_error_card, build_success_card};
use super::music_helpers::resolve_music_context;
use crate::components::emoji::E;

use crate::error::BotResult;
use crate::music::lavalink as lava;
use crate::state::AppState;
use serenity::prelude::*;
use std::sync::Arc;
use tokio::sync::RwLock;

pub async fn run(ctx: &Context, cmd: &crate::commands::context::CommandContext<'_>, state: Arc<RwLock<AppState>>, _args: &[&str]) -> BotResult<()> {
    let mc = match resolve_music_context(ctx, cmd, &state, true).await {
        Ok(c) => c,
        Err(e) => {
            let card = build_error_card(&e.to_string());
            cmd.respond(ctx, &card).await?;
            return Ok(());
        }
    };

    let vol = match cmd { crate::commands::context::CommandContext::Slash(c) => c.data.options().iter().find_map(|opt| match &opt.value { serenity::model::application::ResolvedValue::Integer(i) => Some(*i), _ => None }), crate::commands::context::CommandContext::Prefix(_) => _args.first().and_then(|s| s.parse::<i64>().ok()) }
        .unwrap_or(100);

    if !(0..=150).contains(&vol) {
        let card = build_error_card("Volume must be between 0 and 150.");
        cmd.respond(ctx, &card).await?;
        return Ok(());
    }

    lava::set_volume(&mc.lavalink, mc.guild_id, vol as u16).await?;

    {
        let mut q = mc.queue.lock().await;
        q.volume = vol as u8;
    }

    let emoji = if vol == 0 { E::MUTED } else if vol < 50 { E::VOLUME_DOWN } else { E::VOLUME_UP };
    let card = build_success_card(&format!("{emoji} Volume set to **{vol}%**"));
    cmd.respond(ctx, &card).await?;
    Ok(())
}
