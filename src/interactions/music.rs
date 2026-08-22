/// Music button interaction handlers for Fade.
///
/// Handles all button clicks from the now-playing card:
///   music_prev      — (not supported by Lavalink, shows error)
///   music_pause     — toggle pause/resume
///   music_skip      — skip current track
///   music_stop      — stop + clear queue
///   music_shuffle   — toggle shuffle
///   music_loop      — cycle loop mode
///   music_vol_down  — volume -10
///   music_vol_up    — volume +10
///
/// Queue pagination buttons:
///   queue_prev_{page}  — go to previous queue page
///   queue_next_{page}  — go to next queue page
use crate::commands::music_cards::{
    build_error_card, build_now_playing_card, build_queue_card, build_success_card,
};
use crate::error::{BotError, BotResult};
use crate::music::{get_or_create_queue, lavalink as lava, queue::LoopMode};
use crate::state::{AppState, LavalinkKey};
use serenity::{model::application::ComponentInteraction, prelude::*};
use std::sync::Arc;
use tokio::sync::RwLock;

const QUEUE_PAGE_SIZE: usize = 8;

pub async fn handle(
    ctx: &Context,
    component: &ComponentInteraction,
    state: Arc<RwLock<AppState>>,
    action: &str,
) -> BotResult {
    let guild_id = match component.guild_id {
        Some(id) => id,
        None => return Ok(()),
    };

    let lavalink = {
        let data = ctx.data.read().await;
        data.get::<LavalinkKey>().expect("LavalinkKey missing").clone()
    };

    let queue_arc = {
        let s = state.read().await;
        get_or_create_queue(&s.music_queues, guild_id)
    };

    if action.starts_with("music_") {
        let user_vc = ctx
            .cache
            .guild(guild_id)
            .and_then(|g| g.voice_states.get(&component.user.id).and_then(|vs| vs.channel_id));
        
        let bot_vc = queue_arc.lock().await.voice_channel;
        if let Some(b_vc) = bot_vc {
            if Some(b_vc) != user_vc {
                let card = build_error_card("You must be in the same voice channel as the bot to use controls.");
                crate::components::v2::respond_to_interaction(&ctx.http, component.id.get(), &component.token, &card).await.map_err(BotError::Discord)?;
                return Ok(());
            }
        } else {
            let card = build_error_card("Bot is not in a voice channel.");
            crate::components::v2::respond_to_interaction(&ctx.http, component.id.get(), &component.token, &card).await.map_err(BotError::Discord)?;
            return Ok(());
        }
    }

    match action {
        // ── Pause / Resume ────────────────────────────────────────────────────
        "music_pause" => {
            let current = queue_arc.lock().await.current.clone();
            match current {
                None => {
                    ack(ctx, component).await?;
                }
                Some(track) => {
                    // Toggle: try pause, if it errors try resume.
                    let result = lava::pause(&lavalink, guild_id).await;
                    if result.is_err() {
                        let _ = lava::resume(&lavalink, guild_id).await;
                    }

                    let (loop_mode, shuffled, volume, queue_len) = {
                        let q = queue_arc.lock().await;
                        (q.loop_mode, q.shuffle, q.volume, q.tracks.len())
                    };

                    let pos = lava::get_position(&lavalink, guild_id).await.unwrap_or(0);
                    let card = build_now_playing_card(&track, pos, loop_mode, shuffled, volume, queue_len, result.is_ok());
                    edit_with_card(ctx, component, &card).await?;
                }
            }
        }

        // ── Skip ──────────────────────────────────────────────────────────────
        "music_skip" => {
            let next = {
                let mut q = queue_arc.lock().await;
                q.skip(1)
            };

            if let Some(track) = next {
                lava::play_track(&lavalink, guild_id, &track).await?;

                let (loop_mode, shuffled, volume, queue_len) = {
                    let q = queue_arc.lock().await;
                    (q.loop_mode, q.shuffle, q.volume, q.tracks.len())
                };

                let card = build_now_playing_card(&track, 0, loop_mode, shuffled, volume, queue_len, false);
                edit_with_card(ctx, component, &card).await?;
            } else {
                lava::stop(&lavalink, guild_id).await?;
                queue_arc.lock().await.current = None;
                let card = build_success_card("⏭ Skipped — queue ended.");
                edit_with_card(ctx, component, &card).await?;
            }
        }

        // ── Stop ──────────────────────────────────────────────────────────────
        "music_stop" => {
            lava::stop(&lavalink, guild_id).await?;
            {
                let mut q = queue_arc.lock().await;
                q.current = None;
                q.clear();
            }
            let card = build_success_card("⏹ Stopped playback and cleared the queue.");
            edit_with_card(ctx, component, &card).await?;
        }

        // ── Shuffle ───────────────────────────────────────────────────────────
        "music_shuffle" => {
            let (new_state, current, loop_mode, volume, queue_len) = {
                let mut q = queue_arc.lock().await;
                q.shuffle = !q.shuffle;
                if q.shuffle {
                    q.shuffle_queue();
                }
                (q.shuffle, q.current.clone(), q.loop_mode, q.volume, q.tracks.len())
            };

            if let Some(track) = current {
                let pos = lava::get_position(&lavalink, guild_id).await.unwrap_or(0);
                let card = build_now_playing_card(&track, pos, loop_mode, new_state, volume, queue_len, false);
                edit_with_card(ctx, component, &card).await?;
            } else {
                ack(ctx, component).await?;
            }
        }

        // ── Loop ──────────────────────────────────────────────────────────────
        "music_loop" => {
            let (new_loop, current, shuffled, volume, queue_len) = {
                let mut q = queue_arc.lock().await;
                q.loop_mode = q.loop_mode.next();
                (q.loop_mode, q.current.clone(), q.shuffle, q.volume, q.tracks.len())
            };

            if let Some(track) = current {
                let pos = lava::get_position(&lavalink, guild_id).await.unwrap_or(0);
                let card = build_now_playing_card(&track, pos, new_loop, shuffled, volume, queue_len, false);
                edit_with_card(ctx, component, &card).await?;
            } else {
                ack(ctx, component).await?;
            }
        }

        // ── Volume Down ───────────────────────────────────────────────────────
        "music_vol_down" => {
            let (new_vol, current, loop_mode, shuffled, queue_len) = {
                let mut q = queue_arc.lock().await;
                q.volume = q.volume.saturating_sub(10);
                (q.volume, q.current.clone(), q.loop_mode, q.shuffle, q.tracks.len())
            };
            lava::set_volume(&lavalink, guild_id, new_vol as u16).await?;

            if let Some(track) = current {
                let pos = lava::get_position(&lavalink, guild_id).await.unwrap_or(0);
                let card = build_now_playing_card(&track, pos, loop_mode, shuffled, new_vol, queue_len, false);
                edit_with_card(ctx, component, &card).await?;
            } else {
                ack(ctx, component).await?;
            }
        }

        // ── Volume Up ─────────────────────────────────────────────────────────
        "music_vol_up" => {
            let (new_vol, current, loop_mode, shuffled, queue_len) = {
                let mut q = queue_arc.lock().await;
                q.volume = q.volume.saturating_add(10).min(150);
                (q.volume, q.current.clone(), q.loop_mode, q.shuffle, q.tracks.len())
            };
            lava::set_volume(&lavalink, guild_id, new_vol as u16).await?;

            if let Some(track) = current {
                let pos = lava::get_position(&lavalink, guild_id).await.unwrap_or(0);
                let card = build_now_playing_card(&track, pos, loop_mode, shuffled, new_vol, queue_len, false);
                edit_with_card(ctx, component, &card).await?;
            } else {
                ack(ctx, component).await?;
            }
        }

        // ── Previous (not supported, show error) ──────────────────────────────
        "music_prev" => {
            ack(ctx, component).await?;
        }

        // ── Queue pagination ──────────────────────────────────────────────────
        id if id.starts_with("queue_prev_") || id.starts_with("queue_next_") => {
            let page: usize = id
                .split('_')
                .last()
                .and_then(|p| p.parse::<usize>().ok())
                .unwrap_or(1)
                .max(1) - 1; // 1-based in ID → 0-based

            let (tracks_snap, current, loop_mode, shuffled, volume) = {
                let q = queue_arc.lock().await;
                (
                    q.tracks.iter().cloned().collect::<Vec<_>>(),
                    q.current.clone(),
                    q.loop_mode,
                    q.shuffle,
                    q.volume,
                )
            };

            let total_pages = (tracks_snap.len() + QUEUE_PAGE_SIZE - 1) / QUEUE_PAGE_SIZE.max(1);
            let page = page.min(total_pages.saturating_sub(1));

            let card = build_queue_card(
                &tracks_snap,
                current.as_ref(),
                page,
                total_pages,
                loop_mode,
                shuffled,
                volume,
            );
            edit_with_card(ctx, component, &card).await?;
        }

        _ => {
            ack(ctx, component).await?;
        }
    }

    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async fn ack(ctx: &Context, component: &ComponentInteraction) -> BotResult {
    component
        .create_response(
            &ctx.http,
            serenity::builder::CreateInteractionResponse::Acknowledge,
        )
        .await
        .map_err(BotError::Discord)?;
    Ok(())
}

async fn edit_with_card(
    ctx: &Context,
    component: &ComponentInteraction,
    card: &crate::components::v2::FadeResponse,
) -> BotResult {
    use crate::components::v2::IS_COMPONENTS_V2;

    // Acknowledge first.
    component
        .create_response(
            &ctx.http,
            serenity::builder::CreateInteractionResponse::Acknowledge,
        )
        .await
        .map_err(BotError::Discord)?;

    let mut flags = IS_COMPONENTS_V2;
    if card.ephemeral {
        flags |= 64;
    }

    let body = serde_json::json!({
        "content": null,
        "flags": flags,
        "components": card.components_value(),
    });

    ctx.http
        .edit_original_interaction_response(&component.token, &body, vec![])
        .await
        .map_err(BotError::Discord)?;

    Ok(())
}
