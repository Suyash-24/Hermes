/// Fade — Discord bot entry point.
///
/// Boot sequence:
///   1. Load config (toml + env vars)
///   2. Init structured logging
///   3. Build shared application state
///   4. Connect to Lavalink node
///   5. Connect to Discord gateway
///   6. Park until Ctrl-C / SIGTERM, then shut down gracefully
mod commands;
mod components;
mod config;
mod db;
mod error;
mod handler;
mod interactions;
mod logging;
mod music;
mod state;

use anyhow::{Context, Result};
use lavalink_rs::{
    client::LavalinkClient,
    node::NodeBuilder,
};
use music::events::{track_end_event, track_error_event, track_stuck_event, MusicEventData};
use serenity::{
    model::gateway::GatewayIntents,
    Client,
};
use state::{AppState, AppStateKey, LavalinkKey, ShardManagerKey};
use std::sync::Arc;
use songbird::SerenityInit;
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    // ── 1. Config ─────────────────────────────────────────────────────────────
    let cfg = config::Config::load().context("Failed to load configuration")?;

    // ── 2. Logging ────────────────────────────────────────────────────────────
    logging::init(&cfg.logging);
    info!(bot = %cfg.bot.name, "Starting Fade");

    // ── 3. Shared state ───────────────────────────────────────────────────────
    let state = AppState::new(cfg.clone());

    // ── 4. Gateway intents ────────────────────────────────────────────────────
    // GUILD_VOICE_STATES is required for Lavalink to work.
    let intents = GatewayIntents::GUILDS
        | GatewayIntents::GUILD_MESSAGES
        | GatewayIntents::GUILD_MEMBERS
        | GatewayIntents::MESSAGE_CONTENT
        | GatewayIntents::GUILD_VOICE_STATES;

    // ── 5. Build serenity client ──────────────────────────────────────────────
    let mut client = Client::builder(&cfg.token, intents)
        .event_handler(handler::Handler)
        .register_songbird()
        .await
        .context("Failed to create Discord client")?;

    // ── 6. Build Lavalink client ──────────────────────────────────────────────
    info!(host = %cfg.lavalink.address(), "Connecting to Lavalink");

    let current_user_id = {
        // We need the bot user ID for Lavalink. Fetch it via REST.
        let http = &client.http;
        http.get_current_user().await.context("Failed to get current user")?.id
    };

    let lava_events = lavalink_rs::model::events::Events {
        track_start: Some(crate::music::events::track_start_event),
        track_end: Some(track_end_event),
        track_exception: Some(track_error_event),
        track_stuck: Some(track_stuck_event),
        ..Default::default()
    };

    let lava_cfg = &cfg.lavalink;
    let node = NodeBuilder {
        hostname: lava_cfg.address(),
        is_ssl: lava_cfg.https,
        events: lavalink_rs::model::events::Events::default(),
        password: lava_cfg.password.clone(),
        user_id: current_user_id.into(),
        session_id: None,
    };

    let lavalink = LavalinkClient::new_with_data(
        lava_events,
        vec![node],
        lavalink_rs::prelude::NodeDistributionStrategy::sharded(),
        Arc::new(MusicEventData {
            state: Arc::clone(&state),
            http: Arc::clone(&client.http),
            manager: client.data.read().await.get::<songbird::SongbirdKey>().unwrap().clone(),
        }),
    )
    .await;

    // ── 7. Inject shared state & lavalink into serenity's TypeMap ─────────────
    {
        let mut data = client.data.write().await;
        data.insert::<AppStateKey>(Arc::clone(&state));
        data.insert::<LavalinkKey>(lavalink);
        data.insert::<ShardManagerKey>(Arc::clone(&client.shard_manager));
    }

    // ── 8. Start gateway + graceful shutdown ──────────────────────────────────
    info!("Connecting to Discord gateway…");

    tokio::select! {
        result = client.start_autosharded() => {
            if let Err(e) = result {
                tracing::error!("Gateway error: {e}");
            }
        }
        _ = tokio::signal::ctrl_c() => {
            info!("Received Ctrl-C — shutting down Fade gracefully");
        }
    }

    info!("Fade offline. Goodbye.");
    Ok(())
}
