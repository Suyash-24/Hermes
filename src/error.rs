/// Central error type for the bot.
/// Each variant maps to a different failure domain so call-sites can handle
/// errors precisely without stringly-typed matching.
use thiserror::Error;

#[derive(Debug, Error)]
pub enum BotError {
    // ── Discord / serenity ────────────────────────────────────────────────────
    #[error("Discord API error: {0}")]
    Discord(#[from] serenity::Error),

    // ── Command layer ─────────────────────────────────────────────────────────
    #[error("Unknown command: {0}")]
    UnknownCommand(String),

    #[error("Command '{name}' is on cooldown for {remaining_secs}s")]
    Cooldown { name: String, remaining_secs: u64 },

    #[error("Missing permission: {0}")]
    Permission(String),

    // ── Interaction layer ─────────────────────────────────────────────────────
    #[error("Interaction timed out (component_id={component_id})")]
    InteractionTimeout { component_id: String },

    #[error("Interaction token expired")]
    TokenExpired,

    // ── Music ─────────────────────────────────────────────────────────────────
    #[error("Not in a voice channel")]
    NotInVoiceChannel,

    #[error("Bot is not in a voice channel")]
    BotNotInVoiceChannel,

    #[error("You must be in the same voice channel as the bot")]
    WrongVoiceChannel,

    #[error("Queue is empty")]
    QueueEmpty,

    #[error("Nothing is currently playing")]
    NothingPlaying,

    #[error("Invalid track position: {0}")]
    InvalidPosition(usize),

    #[error("Lavalink error: {0}")]
    Lavalink(String),

    #[error("Search returned no results for: {0}")]
    NoResults(String),

    #[error("Invalid seek timestamp: {0}")]
    InvalidTimestamp(String),

    #[error("Volume must be between 0 and 150")]
    InvalidVolume,

    // ── Config ────────────────────────────────────────────────────────────────
    #[error("Configuration error: {0}")]
    Config(String),

    // ── HTTP ──────────────────────────────────────────────────────────────────
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    // ── Internal / catch-all ─────────────────────────────────────────────────
    #[error("Internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

/// Shorthand result alias used across the crate.
pub type BotResult<T = ()> = Result<T, BotError>;