use reqwest::Client;
use serde_json::json;
use serenity::model::id::ChannelId;
use tracing::error;
use std::sync::Arc;

pub async fn update_voice_status(
    http: &Arc<serenity::http::Http>,
    channel_id: ChannelId,
    status: &str,
    emoji_id: Option<u64>,
    emoji_name: Option<&str>,
) {
    // Strip "Bot " prefix if it exists in token, since we add it below
    let token = http.token().replace("Bot ", "");
    
    let client = Client::new();
    let url = format!("https://discord.com/api/v10/channels/{}/voice-status", channel_id.get());

    let mut payload = json!({ "status": status });
    if let Some(id) = emoji_id {
        payload["emoji_id"] = json!(id.to_string());
        payload["emoji_name"] = serde_json::Value::Null;
    } else if let Some(name) = emoji_name {
        payload["emoji_name"] = json!(name);
        payload["emoji_id"] = serde_json::Value::Null;
    } else {
        payload["emoji_id"] = serde_json::Value::Null;
        payload["emoji_name"] = serde_json::Value::Null;
    }

    let res = client
        .put(&url)
        .header("Authorization", format!("Bot {}", token))
        .json(&payload)
        .send()
        .await;

    match res {
        Ok(resp) => {
            if !resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    error!("Failed to update voice status: {}", text);
                }
            }
        }
        Err(e) => {
            error!("Error sending voice status update: {}", e);
        }
    }
}
