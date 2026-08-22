/// Fade's slash command registry and dispatcher.
///
/// `register_global` registers all slash commands with Discord.
/// `dispatch` routes incoming commands to their handlers.
///
/// # Music commands
///   /play     — search & play
///   /pause    — pause
///   /resume   — resume
///   /skip     — skip track(s)
///   /stop     — stop + clear
///   /join     — join VC
///   /leave    — leave VC
///   /queue    — show queue
///   /nowplaying — show now playing card
///   /volume   — set volume
///   /seek     — seek to timestamp
///   /loop     — toggle loop mode
///   /shuffle  — toggle shuffle
///   /remove   — remove track
///   /move     — reorder track
///   /clear    — clear queue
///   /lyrics   — fetch lyrics

// ── Music commands ────────────────────────────────────────────────────────────
pub mod clear;
pub mod context;
pub mod join;
pub mod leave;
pub mod loop_cmd;
pub mod lyrics;
pub mod move_cmd;
pub mod music_cards;
pub mod music_helpers;
pub mod nowplaying;
pub mod pause;
pub mod play;
pub mod queue_cmd;
pub mod remove;
pub mod resume;
pub mod seek;
pub mod shuffle;
pub mod skip;
pub mod stop;
pub mod volume;

// ── Existing utility commands ─────────────────────────────────────────────────
pub mod avatar;
pub mod info;
pub mod ping;
pub mod prefix;

use crate::error::{BotError, BotResult};
use crate::state::AppState;
use serenity::{
    builder::{CreateCommand, CreateCommandOption},
    model::{
        application::{CommandInteraction, CommandOptionType},
        prelude::*,
    },
    prelude::*,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

// ── Registration ──────────────────────────────────────────────────────────────

pub async fn register_global(ctx: &Context) -> BotResult {
    let commands = build_commands();
    Command::set_global_commands(&ctx.http, commands)
        .await
        .map_err(BotError::Discord)?;
    info!("Registered {} slash commands", all_command_names().len());
    Ok(())
}

fn all_command_names() -> &'static [&'static str] {
    &[
        "ping", "info", "avatar",
        "play", "pause", "resume", "skip", "stop", "join", "leave",
        "queue", "nowplaying", "volume", "seek", "loop", "shuffle",
        "remove", "move", "clear", "lyrics",
    ]
}

fn build_commands() -> Vec<CreateCommand> {
    vec![
        // ── Utility ───────────────────────────────────────────────────────────
        CreateCommand::new("ping")
            .description("Check Fade's latency and shard info"),

        CreateCommand::new("info")
            .description("Show bot information and server stats"),

        CreateCommand::new("avatar")
            .description("Show a user's avatar")
            .add_option(
                CreateCommandOption::new(CommandOptionType::User, "user", "The user to show")
                    .required(false),
            ),

        // ── Music ─────────────────────────────────────────────────────────────
        CreateCommand::new("play")
            .description("Search YouTube or play a URL")
            .add_option(
                CreateCommandOption::new(CommandOptionType::String, "query", "Search query or URL")
                    .required(true),
            ),

        CreateCommand::new("pause")
            .description("Pause the current track"),

        CreateCommand::new("resume")
            .description("Resume paused playback"),

        CreateCommand::new("skip")
            .description("Skip the current track or next N tracks")
            .add_option(
                CreateCommandOption::new(CommandOptionType::Integer, "count", "Number of tracks to skip")
                    .required(false)
                    .min_int_value(1)
                    .max_int_value(50),
            ),

        CreateCommand::new("stop")
            .description("Stop playback and clear the queue"),

        CreateCommand::new("join")
            .description("Join your voice channel"),

        CreateCommand::new("leave")
            .description("Leave the voice channel"),

        CreateCommand::new("queue")
            .description("Show the current queue")
            .add_option(
                CreateCommandOption::new(CommandOptionType::Integer, "page", "Page number")
                    .required(false)
                    .min_int_value(1),
            ),

        CreateCommand::new("nowplaying")
            .description("Show the now-playing card with controls"),

        CreateCommand::new("volume")
            .description("Set playback volume (0-150)")
            .add_option(
                CreateCommandOption::new(CommandOptionType::Integer, "level", "Volume level (0-150)")
                    .required(true)
                    .min_int_value(0)
                    .max_int_value(150),
            ),

        CreateCommand::new("seek")
            .description("Seek to a position in the current track")
            .add_option(
                CreateCommandOption::new(CommandOptionType::String, "position", "Timestamp (mm:ss or hh:mm:ss)")
                    .required(true),
            ),

        CreateCommand::new("loop")
            .description("Toggle loop mode (off / track / queue)")
            .add_option(
                CreateCommandOption::new(CommandOptionType::String, "mode", "Loop mode")
                    .required(false)
                    .add_string_choice("Off", "off")
                    .add_string_choice("Track", "track")
                    .add_string_choice("Queue", "queue"),
            ),

        CreateCommand::new("shuffle")
            .description("Toggle shuffle mode"),

        CreateCommand::new("remove")
            .description("Remove a track from the queue by position")
            .add_option(
                CreateCommandOption::new(CommandOptionType::Integer, "position", "Queue position (1-based)")
                    .required(true)
                    .min_int_value(1),
            ),

        CreateCommand::new("move")
            .description("Move a track to a different queue position")
            .add_option(
                CreateCommandOption::new(CommandOptionType::Integer, "from", "Current position (1-based)")
                    .required(true)
                    .min_int_value(1),
            )
            .add_option(
                CreateCommandOption::new(CommandOptionType::Integer, "to", "Target position (1-based)")
                    .required(true)
                    .min_int_value(1),
            ),

        CreateCommand::new("clear")
            .description("Clear the queue (keeps current track)"),

        CreateCommand::new("lyrics")
            .description("Fetch lyrics for a song")
            .add_option(
                CreateCommandOption::new(
                    CommandOptionType::String,
                    "query",
                    "Song name or 'Artist - Title' (defaults to current track)",
                )
                .required(false),
            ),
    ]
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

pub async fn dispatch(
    ctx: &Context,
    cmd: &CommandInteraction,
    state: Arc<RwLock<AppState>>,
) -> BotResult {
    match cmd.data.name.as_str() {
        // Utility
        "ping"        => ping::run(ctx, cmd, state).await,
        "info"        => info::run(ctx, cmd, state).await,
        "avatar"      => avatar::run(ctx, cmd, state).await,

        // Music
        "play"        => play::run(ctx, cmd, state).await,
        "pause"       => pause::run(ctx, cmd, state).await,
        "resume"      => resume::run(ctx, cmd, state).await,
        "skip"        => skip::run(ctx, cmd, state).await,
        "stop"        => stop::run(ctx, cmd, state).await,
        "join"        => join::run(ctx, cmd, state).await,
        "leave"       => leave::run(ctx, cmd, state).await,
        "queue"       => queue_cmd::run(ctx, cmd, state).await,
        "nowplaying"  => nowplaying::run(ctx, cmd, state).await,
        "volume"      => volume::run(ctx, cmd, state).await,
        "seek"        => seek::run(ctx, cmd, state).await,
        "loop"        => loop_cmd::run(ctx, cmd, state).await,
        "shuffle"     => shuffle::run(ctx, cmd, state).await,
        "remove"      => remove::run(ctx, cmd, state).await,
        "move"        => move_cmd::run(ctx, cmd, state).await,
        "clear"       => clear::run(ctx, cmd, state).await,
        "lyrics"      => lyrics::run(ctx, cmd, state).await,

        name => Err(BotError::UnknownCommand(name.to_string())),
    }
}
