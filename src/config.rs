/// Bot configuration.
/// Loaded once at startup from `config/default.toml` and environment variables.
/// Environment variables take precedence: `DISCORD_TOKEN` is always required.
use anyhow::{Context, Result};
use serde::Deserialize;
use std::fs;

// ── Top-level ─────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    pub bot: BotConfig,
    pub gateway: GatewayConfig,
    pub logging: LoggingConfig,
    pub lavalink: LavalinkConfig,
    pub spotify: Option<SpotifyConfig>,

    /// Discord bot token — always sourced from the environment (never the toml).
    #[serde(skip)]
    pub token: String,
}

// ── Sub-sections ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
pub struct BotConfig {
    pub name: String,
    pub prefix: String,
    #[serde(default)]
    pub owners: Vec<u64>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct GatewayConfig {
    pub shards: u64,
    pub reconnect_timeout: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LoggingConfig {
    pub level: String,
    pub pretty: bool,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LavalinkConfig {
    pub host: String,
    pub port: u16,
    pub password: String,
    pub https: bool,
}

impl LavalinkConfig {
    pub fn address(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }

    pub fn ws_url(&self) -> String {
        let scheme = if self.https { "wss" } else { "ws" };
        format!("{scheme}://{}:{}", self.host, self.port)
    }

    pub fn http_url(&self) -> String {
        let scheme = if self.https { "https" } else { "http" };
        format!("{scheme}://{}:{}", self.host, self.port)
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct SpotifyConfig {
    pub client_id: String,
    pub client_secret: String,
    pub refresh_token: String,
}

// ── Loader ────────────────────────────────────────────────────────────────────

impl Config {
    /// Load configuration.
    ///
    /// 1. Reads `config/default.toml` for structural defaults.
    /// 2. Reads `DISCORD_TOKEN` from the environment (required).
    /// 3. Optionally reads `LOG_LEVEL` to override `logging.level`.
    /// 4. Optionally reads `LAVALINK_PASSWORD` / `LAVALINK_HOST` / `LAVALINK_PORT`.
    pub fn load() -> Result<Self> {
        // Load .env file if present (dev convenience, ignored in prod)
        let _ = dotenvy::dotenv();

        let toml_path = "config/default.toml";
        let raw = fs::read_to_string(toml_path)
            .with_context(|| format!("Failed to read {toml_path}"))?;

        let mut cfg: Config =
            toml::from_str(&raw).with_context(|| format!("Invalid TOML in {toml_path}"))?;

        // Token is mandatory — must come from the environment, never hardcoded.
        cfg.token = std::env::var("DISCORD_TOKEN")
            .context("DISCORD_TOKEN environment variable is not set")?;

        // Optional env overrides
        if let Ok(level) = std::env::var("LOG_LEVEL") {
            cfg.logging.level = level;
        }
        if let Ok(pw) = std::env::var("LAVALINK_PASSWORD") {
            cfg.lavalink.password = pw;
        }
        if let Ok(host) = std::env::var("LAVALINK_HOST") {
            cfg.lavalink.host = host;
        }
        if let Ok(port) = std::env::var("LAVALINK_PORT") {
            if let Ok(p) = port.parse() {
                cfg.lavalink.port = p;
            }
        }

        // Spotify env overrides
        if let (Ok(client_id), Ok(client_secret), Ok(refresh_token)) = (
            std::env::var("SPOTIFY_CLIENT_ID"),
            std::env::var("SPOTIFY_CLIENT_SECRET"),
            std::env::var("SPOTIFY_REFRESH_TOKEN"),
        ) {
            cfg.spotify = Some(SpotifyConfig {
                client_id,
                client_secret,
                refresh_token,
            });
        }

        Ok(cfg)
    }
}
