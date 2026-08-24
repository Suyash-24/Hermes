use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use tracing::{error, info};

const DB_PATH: &str = "database.json";

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Database {
    /// User ID -> Expiration Timestamp (unix seconds). 0 = lifetime.
    pub noprefix: HashMap<u64, u64>,
    /// Guild ID -> Custom Prefix string
    pub guild_prefixes: HashMap<u64, String>,
    /// Set of Guild IDs that have 24/7 mode enabled
    pub twenty_four_seven: HashSet<u64>,
    /// Guild ID -> Expiration Timestamp (unix seconds). 0 = lifetime.
    pub premium_guilds: HashMap<u64, u64>,
    /// Guild ID -> Set of Blacklisted Channel IDs
    #[serde(default)]
    pub blacklisted_channels: HashMap<u64, HashSet<u64>>,
    /// Guild ID -> Set of Whitelisted Channel IDs
    #[serde(default)]
    pub whitelisted_channels: HashMap<u64, HashSet<u64>>,
    /// Guild ID -> Admin Bypass Enabled (default true)
    #[serde(default)]
    pub admin_bypass: HashMap<u64, bool>,
    /// Guild ID -> Channel ID (stores active voice connections)
    #[serde(default)]
    pub active_voice_channels: HashMap<u64, u64>,
}

impl Database {
    pub fn load() -> Self {
        if Path::new(DB_PATH).exists() {
            match fs::read_to_string(DB_PATH) {
                Ok(content) => match serde_json::from_str(&content) {
                    Ok(db) => {
                        info!("Loaded database from {}", DB_PATH);
                        return db;
                    }
                    Err(e) => error!("Failed to deserialize database: {}", e),
                },
                Err(e) => error!("Failed to read database file: {}", e),
            }
        }
        info!("Creating new database");
        Self::default()
    }

    pub fn save(&self) {
        match serde_json::to_string_pretty(self) {
            Ok(content) => {
                if let Err(e) = fs::write(DB_PATH, content) {
                    error!("Failed to write database file: {}", e);
                }
            }
            Err(e) => error!("Failed to serialize database: {}", e),
        }
    }
}
