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
        channel::Message,
        gateway::Ready,
        guild::{Guild, Member},
        id::GuildId,
        voice::VoiceState,
    },
    prelude::*,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info};

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
                    // Try editing deferred response first; if that fails, try creating a new one.
                    let edited = cmd
                        .edit_response(
                            &ctx,
                            serenity::builder::EditInteractionResponse::new()
                                .content("⚠️ Something went wrong. Please try again."),
                        )
                        .await;
                    if edited.is_err() {
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
                    update.guild_id.expect("Missing GuildId").get(),
                    endpoint,
                    Some(update.token),
                );
            }
        }
    }

    // ── Prefix commands (!play etc.) ────────────────────────────────────────

    async fn message(&self, ctx: Context, msg: Message) {
        // Ignore bots.
        if msg.author.bot {
            return;
        }

        let content = msg.content.trim().to_string();

        let state = get_state(&ctx).await;
        let (default_prefix, is_noprefix, custom_prefix) = {
            let s = state.read().await;
            let mut db = s.db.write().await;
            
            // Cleanup expired noprefix
            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
            db.noprefix.retain(|_, &mut exp| exp == 0 || exp > now);
            
            let is_np = db.noprefix.contains_key(&msg.author.id.get());
            let custom = if let Some(gid) = msg.guild_id {
                db.guild_prefixes.get(&gid.get()).cloned()
            } else {
                None
            };
            
            (s.config.bot.prefix.clone(), is_np, custom)
        };

        let bot_id = ctx.cache.current_user().id;
        let bot_mention = format!("<@{}>", bot_id);
        let bot_mention_nick = format!("<@!{}>", bot_id);

        let mut rest_opt = None;
        let mut was_mention = false;
        let mut rest_str = content.as_str();
        
        let mentions_bot = msg.mentions_user_id(bot_id) 
            || msg.mentions_me(&ctx.http).await.unwrap_or(false)
            || content.contains(&bot_id.to_string())
            || content.contains("1398578769438048368");
            
        // Fallback for literal text mentions (if Discord didn't format them as a real mention)
        if !mentions_bot {
            if let Some(r) = rest_str.strip_prefix("@leos") {
                rest_str = r.trim_start();
                was_mention = true;
            } else if let Some(r) = rest_str.strip_prefix("@hermes.bot") {
                rest_str = r.trim_start();
                was_mention = true;
            }
        }
        
        if mentions_bot || was_mention {
            let re = regex::Regex::new(r"<@!?&?[0-9]+>").unwrap();
            
            // If the message is ONLY mentions or the literal fallbacks
            if re.replace_all(rest_str, "").trim().is_empty() {
                rest_str = "";
                was_mention = true;
            } else {
                // If it has text, strip the first mention if it's at the beginning
                if let Some(r) = rest_str.strip_prefix(&bot_mention) {
                    rest_str = r.trim_start();
                    was_mention = true;
                } else if let Some(r) = rest_str.strip_prefix(&bot_mention_nick) {
                    rest_str = r.trim_start();
                    was_mention = true;
                } else if let Some(m) = re.find(rest_str) {
                    if m.start() == 0 {
                        rest_str = rest_str[m.end()..].trim_start();
                        was_mention = true;
                    }
                }
            }
        }

        if let Some(ref custom) = custom_prefix {
            if let Some(r) = rest_str.strip_prefix(custom) {
                rest_opt = Some(r.trim_start());
            } else if let Some(r) = rest_str.strip_prefix(&default_prefix) {
                rest_opt = Some(r.trim_start());
            } else if is_noprefix || was_mention {
                rest_opt = Some(rest_str);
            }
        } else if let Some(r) = rest_str.strip_prefix(&default_prefix) {
            rest_opt = Some(r.trim_start());
        } else if is_noprefix || was_mention {
            rest_opt = Some(rest_str);
        }

        if let Some(rest) = rest_opt {
            if rest.is_empty() {
                if was_mention {
                    use crate::components::v2::{FadeResponse, respond_to_channel};
                    
                    let pfx = custom_prefix.clone().unwrap_or(default_prefix.clone());
                    let bot_name = ctx.cache.current_user().name.clone();
                    let bot_avatar = ctx.cache.current_user().face();
                    
                    let section_text = format!("**Hey there!** ✨\nHello! I'm **{}**, an all-in-one community bot.\n\n✨ **Prefix:** `{}`\n\n✨ You can also run commands by tagging me! e.g. `<@{}> play lo-fi`", bot_name, pfx, bot_id);
                    let help_text = "Need help? Use the `help` command to see everything I can do!".to_string();
                    
                    let card = FadeResponse::new().container(None, |c| {
                        c.section(|s| {
                             s.text(section_text)
                              .thumbnail(bot_avatar)
                         })
                         .text(help_text)
                         .action_row(|r| {
                             r.link("https://discord.com/invite/SmdUGNXjYv", "Support Server")
                         })
                    });
                    
                    if let Err(e) = respond_to_channel(&ctx.http, msg.channel_id, &card).await {
                        tracing::error!("Failed to send mention greeting: {:?}", e);
                    }
                }
                return;
            }

            let mut parts = rest.split_whitespace();
            let command_name = match parts.next() {
                Some(cmd) => cmd.to_lowercase(),
                None => return,
            };
            
            let args: Vec<&str> = parts.collect();
            let ctx_cmd = crate::commands::context::CommandContext::Prefix(&msg);
            
            // Dispatch
            let result = match command_name.as_str() {
                // Utility
                "ping"        => crate::commands::ping::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "info"        => crate::commands::info::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "avatar"      => crate::commands::avatar::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                
                // Music
                "play" | "p"  => crate::commands::play::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "pause"       => crate::commands::pause::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "resume"      => crate::commands::resume::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "skip" | "s"  => crate::commands::skip::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "stop"        => crate::commands::stop::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "join"        => crate::commands::join::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "leave"       => crate::commands::leave::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "queue" | "q" => crate::commands::queue_cmd::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "nowplaying" | "np" => crate::commands::nowplaying::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "volume" | "v" => crate::commands::volume::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "seek"        => crate::commands::seek::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "loop"        => crate::commands::loop_cmd::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "shuffle"     => crate::commands::shuffle::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "remove"      => crate::commands::remove::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "move"        => crate::commands::move_cmd::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "clear"       => crate::commands::clear::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "noprefix"    => crate::commands::noprefix::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "setprefix"   => crate::commands::setprefix::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "24/7" | "247" => crate::commands::twenty_four_seven::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "lyrics"      => crate::commands::lyrics::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "premium"     => crate::commands::premium::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "serveravatar" => crate::commands::serveravatar::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "serverbanner" => crate::commands::serverbanner::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                "serverbio"   => crate::commands::serverbio::run(&ctx, &ctx_cmd, Arc::clone(&state), &args).await,
                
                _ => return, // Unknown command
            };
            
            if let Err(e) = result {
                tracing::error!("Prefix command failed: {e}");
            }
        }
    }

    // ── Guild events ──────────────────────────────────────────────────────────

    async fn guild_create(&self, _ctx: Context, guild: Guild, is_new: Option<bool>) {
        if is_new == Some(true) {
            info!(guild = %guild.name, id = %guild.id, "Fade added to a new guild");
        }
    }

    async fn guild_member_addition(&self, _ctx: Context, member: Member) {
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
