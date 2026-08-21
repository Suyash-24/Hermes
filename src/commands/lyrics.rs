/// /lyrics [query] — fetch lyrics using the lyrics.ovh API.
use crate::components::{
    emoji::{header, hint, Colour, E},
    v2::{FadeResponse, respond_to_interaction},
};
use crate::error::{BotError, BotResult};
use crate::state::{AppState, LavalinkKey};
use serenity::{model::application::CommandInteraction, prelude::*};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(serde::Deserialize)]
struct LyricsResponse {
    lyrics: Option<String>,
    error: Option<String>,
}

pub async fn run(ctx: &Context, cmd: &CommandInteraction, state: Arc<RwLock<AppState>>) -> BotResult {
    cmd.defer(ctx).await.map_err(BotError::Discord)?;

    // Try to get the query from the option, or fall back to current track.
    let query = cmd
        .data
        .options
        .first()
        .and_then(|o| o.value.as_str())
        .map(|s| s.to_string());

    let (artist, title) = if let Some(q) = query {
        // Try to split "Artist - Title" format.
        if let Some((a, t)) = q.split_once(" - ") {
            (a.trim().to_string(), t.trim().to_string())
        } else {
            ("".to_string(), q)
        }
    } else {
        // Fall back to currently playing track.
        let guild_id = match cmd.guild_id {
            Some(id) => id,
            None => {
                let card = error_card("Must be used in a server.");
                respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
                    .await.map_err(BotError::Discord)?;
                return Ok(());
            }
        };

        let state_lock = state.read().await;
        let current = if let Some(q) = state_lock.music_queues.get(&guild_id) {
            q.lock().await.current.clone()
        } else {
            None
        };

        match current {
            Some(track) => (track.author.clone(), track.title.clone()),
            None => {
                let card = error_card("Nothing is playing and no query was provided.");
                respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
                    .await.map_err(BotError::Discord)?;
                return Ok(());
            }
        }
    };

    // Fetch from lyrics.ovh
    let url = format!(
        "https://api.lyrics.ovh/v1/{}/{}",
        urlencoding::encode(&artist),
        urlencoding::encode(&title),
    );

    let client = reqwest::Client::new();
    let resp: LyricsResponse = match client.get(&url).send().await {
        Ok(r) => r.json().await.unwrap_or(LyricsResponse { lyrics: None, error: Some("Parse error".into()) }),
        Err(e) => {
            let card = error_card(&format!("Failed to fetch lyrics: {e}"));
            respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
                .await.map_err(BotError::Discord)?;
            return Ok(());
        }
    };

    if let Some(err) = resp.error {
        let card = error_card(&format!("Lyrics not found: {err}"));
        respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
            .await.map_err(BotError::Discord)?;
        return Ok(());
    }

    let lyrics = resp.lyrics.unwrap_or_default();
    // Discord has a message char limit — truncate lyrics at ~1800 chars.
    let lyrics_display = if lyrics.len() > 1800 {
        format!("{}…\n{}", &lyrics[..1800], hint("(truncated — lyrics too long)"))
    } else {
        lyrics
    };

    let search_label = if artist.is_empty() {
        title.clone()
    } else {
        format!("{artist} — {title}")
    };

    let card = FadeResponse::new().container(Some(Colour::LYRICS_CLR), |c| {
        c.text(header(E::LYRICS, &search_label))
         .separator(true)
         .text(lyrics_display)
         .separator(false)
         .text(hint("Source: lyrics.ovh"))
    });

    respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, &card)
        .await.map_err(BotError::Discord)?;
    Ok(())
}

fn error_card(msg: &str) -> FadeResponse {
    use crate::components::emoji::Colour;
    FadeResponse::new().ephemeral().container(Some(Colour::DANGER), |c| {
        c.text(format!("✗ {msg}"))
    })
}
