use reqwest::Client;
use serde_json::json;
use serenity::model::id::ChannelId;
use tracing::error;
use std::sync::Arc;

pub async fn update_voice_status(
    http: &Arc<serenity::http::Http>,
    channel_id: ChannelId,
    status: &str,
) {
    // Strip "Bot " prefix if it exists in token, since we add it below
    let token = http.token().replace("Bot ", "");
    
    let client = Client::new();
    let url = format!("https://discord.com/api/v10/channels/{}/voice-status", channel_id.get());

    let res = client
        .put(&url)
        .header("Authorization", format!("Bot {}", token))
        .json(&json!({ "status": status }))
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
