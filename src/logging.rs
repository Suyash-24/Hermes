/// Logging initializer for Fade.
///
/// Uses `tracing-subscriber` with:
/// - Pretty format in dev (`pretty = true` in config)
/// - Compact structured format in prod
/// - `RUST_LOG` / `LOG_LEVEL` env var overrides the config value
use crate::config::LoggingConfig;
use tracing::Level;
use tracing_subscriber::{fmt, EnvFilter};

pub fn init(cfg: &LoggingConfig) {
    let level: Level = cfg.level.parse().unwrap_or(Level::INFO);

    let filter = EnvFilter::try_from_env("RUST_LOG")
        .or_else(|_| EnvFilter::try_new(&cfg.level))
        .unwrap_or_else(|_| EnvFilter::new("info"))
        // Quiet down chatty serenity internals unless explicitly enabled
        .add_directive("serenity=warn".parse().unwrap())
        .add_directive("tracing=warn".parse().unwrap());

    if cfg.pretty {
        fmt()
            .with_max_level(level)
            .with_env_filter(filter)
            .with_target(false)
            .with_thread_ids(false)
            .pretty()
            .init();
    } else {
        fmt()
            .with_max_level(level)
            .with_env_filter(filter)
            .with_target(true)
            .json()
            .init();
    }

    tracing::debug!("Logging initialized at level={}", level);
}
