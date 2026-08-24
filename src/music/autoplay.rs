use crate::error::{BotError, BotResult};
use crate::music::lavalink::{search_autoplay, search_one};
use lavalink_rs::client::LavalinkClient;
use lavalink_rs::model::track::TrackInfo;
use reqwest::Client;
use serenity::model::id::GuildId;

async fn query_puter(title: &str, author: &str, token: &str) -> BotResult<String> {
    let client = Client::new();
    let body = serde_json::json!({
        "model": "gpt-4o-mini",
        "messages": [
            {
                "role": "system",
                "content": "You are a music recommendation engine. Given a track, output EXACTLY ONE related song in the format 'Title by Artist'. Avoid recommending a song by the exact same artist if possible. Do not output any other text, quotes, or markdown."
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

async fn query_lastfm(title: &str, author: &str, api_key: &str) -> BotResult<String> {
    let client = Client::new();
    let url = format!(
        "http://ws.audioscrobbler.com/2.0/?method=track.getsimilar&artist={}&track={}&api_key={}&format=json&limit=5",
        urlencoding::encode(author),
        urlencoding::encode(title),
        api_key
    );

    let res = client.get(&url).send().await.map_err(|e| BotError::Custom(e.to_string()))?;
    let json: serde_json::Value = res.json().await.map_err(|e| BotError::Custom(e.to_string()))?;

    if let Some(tracks) = json["similartracks"]["track"].as_array() {
        for track in tracks {
            if let (Some(name), Some(artist)) = (track["name"].as_str(), track["artist"]["name"].as_str()) {
                if artist.to_lowercase() != author.to_lowercase() {
                    return Ok(format!("{} by {}", name, artist));
                }
            }
        }
        // Fallback to the first track if all are by the same artist
        if let Some(track) = tracks.first() {
            if let (Some(name), Some(artist)) = (track["name"].as_str(), track["artist"]["name"].as_str()) {
                return Ok(format!("{} by {}", name, artist));
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
    puter_token: Option<String>,
    lastfm_key: Option<String>,
) -> BotResult<TrackInfo> {
    // 1. Try Puter API
    if let Some(token) = puter_token {
        if let Ok(track_name) = query_puter(&last_title, &last_author, &token).await {
            let search_query = format!("ytsearch:{}", track_name);
            if let Ok(track) = search_one(&lavalink, guild_id, &search_query, 0, "Autoplay").await {
                return Ok(track);
            }
        }
    }
    
    // 2. Try Last.fm API
    if let Some(key) = lastfm_key {
        if let Ok(track_name) = query_lastfm(&last_title, &last_author, &key).await {
            let search_query = format!("ytsearch:{}", track_name);
            if let Ok(track) = search_one(&lavalink, guild_id, &search_query, 0, "Autoplay").await {
                return Ok(track);
            }
        }
    }
    
    // 3. Fallback to standard Lavalink YouTube mix
    let search_query = format!("{} {} mix", last_title, last_author);
    search_autoplay(&lavalink, guild_id, &search_query, &last_title, 0, "Autoplay").await
}
