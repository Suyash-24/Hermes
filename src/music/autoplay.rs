use crate::error::{BotError, BotResult};
use crate::music::lavalink::{search_autoplay, search_one};
use lavalink_rs::client::LavalinkClient;
use crate::music::queue::TrackInfo;
use reqwest::Client;
use serenity::model::id::GuildId;
use std::collections::VecDeque;

async fn query_puter(title: &str, author: &str, history: &VecDeque<String>, token: &str) -> BotResult<String> {
    let client = Client::new();
    
    // Format history string for context
    let history_str = if history.is_empty() {
        "".to_string()
    } else {
        let titles: Vec<_> = history.iter().map(|s| format!("'{}'", s)).collect();
        format!(" Do NOT recommend any of these recently played tracks: {}.", titles.join(", "))
    };

    let body = serde_json::json!({
        "model": "gpt-4o-mini",
        "messages": [
            {
                "role": "system",
                "content": format!("You are a music recommendation engine. Given a track, output EXACTLY ONE related song in the format 'Title by Artist'. Avoid recommending a song by the exact same artist if possible.{} Do not output any other text, quotes, or markdown.", history_str)
            },
            {
                "role": "user",
                "content": format!("Suggest a song similar to '{}' by '{}'.", title, author)
            }
        ]
    });

    let res = client
        .post("https://api.puter.com/puterai/openai/v1/chat/completions")
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .map_err(|e| BotError::Custom(e.to_string()))?;

    let json: serde_json::Value = res.json().await.map_err(|e| BotError::Custom(e.to_string()))?;
    
    if let Some(content) = json["choices"][0]["message"]["content"].as_str() {
        Ok(content.trim().to_string())
    } else {
        Err(BotError::Custom("Invalid response from Puter AI".to_string()))
    }
}

async fn query_lastfm(title: &str, author: &str, history: &VecDeque<String>, api_key: &str) -> BotResult<String> {
    let client = Client::new();
    let url = format!(
        "http://ws.audioscrobbler.com/2.0/?method=track.getsimilar&artist={}&track={}&api_key={}&format=json&limit=15",
        urlencoding::encode(author),
        urlencoding::encode(title),
        api_key
    );

    let res = client.get(&url).send().await.map_err(|e| BotError::Custom(e.to_string()))?;
    let json: serde_json::Value = res.json().await.map_err(|e| BotError::Custom(e.to_string()))?;

    if let Some(tracks) = json["similartracks"]["track"].as_array() {
        for track in tracks {
            if let (Some(name), Some(artist)) = (track["name"].as_str(), track["artist"]["name"].as_str()) {
                let track_str = format!("{} by {}", name, artist);
                // Skip if it's in history
                if history.iter().any(|h| h.eq_ignore_ascii_case(name) || h.eq_ignore_ascii_case(&track_str)) {
                    continue;
                }
                
                if artist.to_lowercase() != author.to_lowercase() {
                    return Ok(track_str);
                }
            }
        }
        // Fallback to the first track that isn't in history
        for track in tracks {
            if let (Some(name), Some(artist)) = (track["name"].as_str(), track["artist"]["name"].as_str()) {
                let track_str = format!("{} by {}", name, artist);
                if !history.iter().any(|h| h.eq_ignore_ascii_case(name) || h.eq_ignore_ascii_case(&track_str)) {
                    return Ok(track_str);
                }
            }
        }
    }

    Err(BotError::Custom("No similar tracks found on Last.fm".to_string()))
}

pub async fn prefetch_autoplay(
    lavalink: LavalinkClient,
    guild_id: GuildId,
    last_title: String,
    last_author: String,
    history: VecDeque<String>,
    puter_token: Option<String>,
    lastfm_key: Option<String>,
) -> BotResult<TrackInfo> {
    // 1. Try Puter API
    if let Some(token) = puter_token {
        if let Ok(track_name) = query_puter(&last_title, &last_author, &history, &token).await {
            let search_query = format!("ytsearch:{}", track_name);
            if let Ok(track) = search_one(&lavalink, guild_id, &search_query, 0, "Autoplay").await {
                return Ok(track);
            }
        }
    }
    
    // 2. Try Last.fm API
    if let Some(key) = lastfm_key {
        if let Ok(track_name) = query_lastfm(&last_title, &last_author, &history, &key).await {
            let search_query = format!("ytsearch:{}", track_name);
            if let Ok(track) = search_one(&lavalink, guild_id, &search_query, 0, "Autoplay").await {
                return Ok(track);
            }
        }
    }
    
    // 3. Fallback to standard Lavalink YouTube mix
    let search_query = format!("{} {} mix", last_title, last_author);
    search_autoplay(&lavalink, guild_id, &search_query, &history, 0, "Autoplay").await
}
