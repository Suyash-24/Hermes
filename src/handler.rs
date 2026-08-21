/// Fade's event handler.
///
/// Every Discord event arrives here first. The handler keeps itself thin —
/// it validates, logs, then delegates to the appropriate module. Business
/// logic never lives in this file.
use crate::state::{AppState, AppStateKey, LavalinkKey};
use serenity::{
    async_trait,
    model::{
        application::Interaction,
        gateway::Ready,
        guild::{Guild, Member},
        id::GuildId,
        voice::VoiceState,
    },
    prelude::*,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

// ── Handler struct ────────────────────────────────────────────────────────────

pub struct Handler;

// ── EventHandler impl ─────────────────────────────────────────────────────────

#[async_trait]
impl EventHandler for Handler {
    // ── Ready ─────────────────────────────────────────────────────────────────

    async fn ready(&self, ctx: Context, ready: Ready) {
        let tag = &ready.user.tag();
        let guild_count = ready.guilds.len();

        info!(
            name = %tag,
            guilds = guild_count,
            "Fade is online"
        );

        // Register slash commands globally.
        // During development, prefer guild-scoped registration (instant update).
        // Global registration can take up to 1 hour to propagate.
        if let Err(e) = crate::commands::register_global(&ctx).await {
            error!("Failed to register slash commands: {e}");
        }
    }

    // ── Interactions (slash commands, buttons, selects, modals) ───────────────

    async fn interaction_create(&self, ctx: Context, interaction: Interaction) {
        let state = get_state(&ctx).await;

        match interaction {
            Interaction::Command(cmd) => {
                let name = cmd.data.name.as_str();
                info!(command = %name, user = %cmd.user.tag(), "Slash command received");

                if let Err(e) = crate::commands::dispatch(&ctx, &cmd, state).await {
                    error!(command = %name, error = %e, "Command handler failed");
                    // Attempt to tell the user something went wrong.
                    let _ = cmd
                        .create_response(
                            &ctx,
                            serenity::builder::CreateInteractionResponse::Message(
                                serenity::builder::CreateInteractionResponseMessage::new()
                                    .content("⚠️ Something went wrong. Please try again.")
                                    .ephemeral(true),
                            ),
                        )
                        .await;
                }
            }

            Interaction::Component(component) => {
                let id = component.data.custom_id.as_str();
                info!(component_id = %id, user = %component.user.tag(), "Component interaction");

                if let Err(e) =
                    crate::interactions::dispatch(&ctx, &component, state).await
                {
                    error!(component_id = %id, error = %e, "Interaction handler failed");
                }
            }

            Interaction::Modal(modal) => {
                let id = modal.data.custom_id.as_str();
                info!(modal_id = %id, user = %modal.user.tag(), "Modal submitted");

                if let Err(e) = crate::interactions::dispatch_modal(&ctx, &modal, state).await {
                    error!(modal_id = %id, error = %e, "Modal handler failed");
                }
            }

            _ => {
                // Autocomplete, pings, etc. — handled elsewhere or ignored.
            }
        }
    }

    // ── Voice gateway events (required by Lavalink) ───────────────────────────

    async fn voice_state_update(&self, ctx: Context, _old: Option<VoiceState>, new: VoiceState) {
        let data = ctx.data.read().await;
        if let Some(lavalink) = data.get::<LavalinkKey>() {
            if let Some(guild_id) = new.guild_id {
                lavalink.handle_voice_state_update(
                    guild_id.get(),
                    new.channel_id.map(|c| c.get()),
                    new.user_id.get(),
                    new.session_id,
                );
            }
        }
    }

    async fn voice_server_update(&self, ctx: Context, update: serenity::model::event::VoiceServerUpdateEvent) {
        let data = ctx.data.read().await;
        if let Some(lavalink) = data.get::<LavalinkKey>() {
            if let Some(endpoint) = update.endpoint {
                lavalink.handle_voice_server_update(
                    update.guild_id.get(),
                    endpoint,
                    update.token,
                );
            }
        }
    }

    // ── Guild events ──────────────────────────────────────────────────────────

    async fn guild_create(&self, _ctx: Context, guild: Guild, is_new: Option<bool>) {
        if is_new == Some(true) {
            info!(guild = %guild.name, id = %guild.id, "Fade added to a new guild");
        }
    }

    async fn guild_member_addition(&self, ctx: Context, member: Member) {
        let guild_id = member.guild_id;
        info!(
            guild = %guild_id,
            user = %member.user.tag(),
            "Member joined"
        );

        // If we had welcome messages, we would handle them here.
    }

    // ── Cache ready ───────────────────────────────────────────────────────────

    async fn cache_ready(&self, _ctx: Context, guilds: Vec<GuildId>) {
        info!(guild_count = guilds.len(), "Cache fully populated");
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Extract `AppState` from the serenity `Context`.
/// Panics on failure — if state is missing the bot is in an unrecoverable state.
async fn get_state(ctx: &Context) -> Arc<RwLock<AppState>> {
    ctx.data
        .read()
        .await
        .get::<AppStateKey>()
        .expect("AppState missing from TypeMap")
        .clone()
}