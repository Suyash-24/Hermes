/// Shared application state.
///
/// An `Arc<AppState>` is stored in serenity's `TypeMap` under the `AppStateKey`
/// key. Every event handler receives the framework `Context`, from which it can
/// retrieve the state with a single call to `ctx.data.read()`.
///
/// # Example
/// ```rust
/// let data = ctx.data.read().await;
/// let state = data.get::<AppStateKey>().expect("state missing");
/// ```
use crate::config::Config;
use crate::music::QueueMap;
use dashmap::DashMap;
use lavalink_rs::client::LavalinkClient;
use serenity::prelude::TypeMapKey;
use std::sync::Arc;
use tokio::sync::RwLock;

// ── State definition ──────────────────────────────────────────────────────────

#[derive(Debug)]
pub struct AppState {
    /// Resolved configuration (immutable after startup).
    pub config: Config,

    /// Persistent database configuration.
    pub db: Arc<RwLock<crate::db::Database>>,

    /// Per-command cooldown tracking.
    /// Key: `"{user_id}:{command_name}"` — Value: Unix timestamp when cooldown expires.
    pub cooldowns: DashMap<String, u64>,

    /// Active interaction sessions (e.g. paginated embeds, multi-step flows).
    /// Key: custom component_id — Value: arbitrary session data as JSON string.
    pub sessions: DashMap<String, SessionData>,

    /// Per-guild music queues.
    pub music_queues: QueueMap,

    /// Spotify API client (if configured)
    pub spotify: Option<Arc<crate::spotify::SpotifyClient>>,
}

#[derive(Debug, Clone)]
pub struct SessionData {
    /// Who started this session.
    pub user_id: u64,
    /// Unix timestamp when this session expires.
    pub expires_at: u64,
    /// Arbitrary payload (command-specific state).
    pub payload: serde_json::Value,
}

// ── Constructor ───────────────────────────────────────────────────────────────

impl AppState {
    pub fn new(config: Config) -> Arc<RwLock<Self>> {
        let spotify_client = config.spotify.as_ref().map(|s| {
            Arc::new(crate::spotify::SpotifyClient::new(
                s.client_id.clone(),
                s.client_secret.clone(),
                s.refresh_token.clone(),
            ))
        });

        Arc::new(RwLock::new(Self {
            config,
            db: Arc::new(RwLock::new(crate::db::Database::load())),
            cooldowns: DashMap::new(),
            sessions: DashMap::new(),
            music_queues: DashMap::new(),
            spotify: spotify_client,
        }))
    }
}

// ── TypeMapKey registrations ──────────────────────────────────────────────────

/// Key used to store `AppState` inside serenity's `TypeMap`.
pub struct AppStateKey;

impl TypeMapKey for AppStateKey {
    type Value = Arc<RwLock<AppState>>;
}

/// Key used to store the `LavalinkClient` inside serenity's `TypeMap`.
pub struct LavalinkKey;

impl TypeMapKey for LavalinkKey {
    type Value = LavalinkClient;
}

/// Key used to store the `ShardManager` inside serenity's `TypeMap`.
pub struct ShardManagerKey;

impl TypeMapKey for ShardManagerKey {
    type Value = std::sync::Arc<serenity::gateway::ShardManager>;
}
