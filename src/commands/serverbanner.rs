use crate::commands::music_cards::{build_error_card, build_success_card};
use crate::error::{BotError, BotResult};
use crate::state::AppState;
use serenity::{model::prelude::*, prelude::*};
use std::sync::Arc;
use crate::utils::image_processing::download_and_process_image;
use tracing::error;
use reqwest::Client;
use serde_json::json;

pub async fn run(
    ctx: &Context,
    cmd: &crate::commands::context::CommandContext<'_>,
    state: Arc<tokio::sync::RwLock<AppState>>,
    args: &[&str],
) -> BotResult<()> {
    let guild_id = match cmd.guild_id() {
        Some(id) => id,
        None => {
            let card = build_error_card("This command can only be used in a server.");
            cmd.respond(ctx, &card).await?;
            return Ok(());
        }
    };

    // 1. Check if user has MANAGE_GUILD
    let has_perms = match cmd.member() {
        Some(member) => member.permissions.map_or(false, |p| p.contains(Permissions::MANAGE_GUILD)),
        None => false,
    };

    let is_owner = {
        let state_read = state.read().await;
        state_read.config.bot.owners.contains(&cmd.user_id().get())
    };

    if !has_perms && !is_owner {
        let card = build_error_card("You need the `Manage Server` permission to change the bot's server avatar.");
        cmd.respond(ctx, &card).await?;
        return Ok(());
    }

    // 2. Check for Premium
    {
        let state_read = state.read().await;
        let db = state_read.db.read().await;
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        
        let has_premium = match db.premium_guilds.get(&guild_id.get()) {
            Some(&expiration) => expiration == 0 || expiration > now,
            None => false,
        };

        if !has_premium {
            let card = build_error_card("This is a Premium feature! A bot owner must grant this server premium access using the `/premium` command.");
            cmd.respond(ctx, &card).await?;
            return Ok(());
        }
    }

    // 3. Get the image URL from arguments or attachments
    let mut image_url = None;
    
    match cmd {
        crate::commands::context::CommandContext::Prefix(msg) => {
            if !msg.attachments.is_empty() {
                image_url = Some(msg.attachments[0].url.clone());
            } else if !args.is_empty() {
                image_url = Some(args[0].to_string());
            }
        },
        crate::commands::context::CommandContext::Slash(interaction) => {
            if let Some(opt) = interaction.data.options.first() {
                if let serenity::model::application::CommandDataOptionValue::Attachment(attachment_id) = &opt.value {
                    if let Some(attachment) = interaction.data.resolved.attachments.get(attachment_id) {
                        image_url = Some(attachment.url.clone());
                    }
                }
            }
        }
    }

    let url = match image_url {
        Some(u) => u,
        None => {
            let card = build_error_card("Please provide an image attachment or URL.");
            cmd.respond(ctx, &card).await?;
            return Ok(());
        }
    };

    // Acknowledge processing
    let loading_card = build_success_card("⏳ Processing and downloading image...");
    cmd.respond(ctx, &loading_card).await?;

    // 4. Download and process image
    let base64_image = match download_and_process_image(&url).await {
        Ok(b) => b,
        Err(e) => {
            let card = build_error_card(&format!("Failed to process image: {}", e));
            cmd.respond(ctx, &card).await?;
            return Ok(());
        }
    };

    // 5. Send PATCH request to Discord API for Guild Member Profile
    let bot_token = {
        let state_read = state.read().await;
        // In this architecture, token is either in config or from env var,
        // let's grab it from context HTTP client token.
        ctx.http.token().to_string()
    };

    let api_url = format!("https://discord.com/api/v10/guilds/{}/members/@me", guild_id.get());
    let payload = json!({
        "banner": base64_image
    });

    let client = Client::new();
    let resp = client.patch(&api_url)
        .header("Authorization", &bot_token)
        .json(&payload)
        .send()
        .await;

    match resp {
        Ok(response) => {
            if response.status().is_success() {
                let card = build_success_card("✅ Successfully updated the bot's server banner!");
                cmd.respond(ctx, &card).await?;
            } else {
                let err_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
                error!("Discord API error: {}", err_text);
                let card = build_error_card(&format!("Discord API rejected the banner: {}", err_text));
                cmd.respond(ctx, &card).await?;
            }
        }
        Err(e) => {
            error!("Request failed: {}", e);
            let card = build_error_card("Failed to connect to Discord API.");
            cmd.respond(ctx, &card).await?;
        }
    }

    Ok(())
}
