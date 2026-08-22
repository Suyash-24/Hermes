/// /lyrics [query] — fetch lyrics using the lyrics.ovh API.
use crate::components::{
    emoji::{header, hint, Colour, E},
    v2::{FadeResponse},
};
use crate::error::BotResult;
use crate::state::{AppState, LavalinkKey};
use serenity::{model::application::prelude::*};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(serde::Deserialize)]
struct LyricsResponse {
    lyrics: Option<String>,
    error: Option<String>,
}

pub async fn run(ctx: &Context, cmd: &crate::commands::context::CommandContext<'_>, state: Arc<RwLock<AppState>>, _args: &[&str]) -> BotResult<()> {
    cmd.defer(ctx).await?;

    // Try to get the query from the option, or fall back to current track.
    let query = match cmd { crate::commands::context::CommandContext::Slash(c) => c.data.options().iter().find_map(|opt| match &opt.value { serenity::model::application::ResolvedValue::String(s) => Some(*s), _ => None }), crate::commands::context::CommandContext::Prefix(_) => _args.first().copied() }
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
        let guild_id = match cmd.guild_id() {
            Some(id) => id,
            None => {
                let card = error_card("Must be used in a server.");
                cmd.edit(ctx, &card).await?;
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
            Some(track) => (track.author.clone(), track.title.to_string()),
            None => {
                let card = error_card("Nothing is playing and no query was provided.");
                cmd.edit(ctx, &card).await?;
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
            cmd.edit(ctx, &card).await?;
            return Ok(());
        }
    };

    if let Some(err) = resp.error {
        let card = error_card(&format!("Lyrics not found: {err}"));
        cmd.edit(ctx, &card).await?;
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
        title.to_string()
    } else {
        format!("{artist} — {title}")
    };

    let card = FadeResponse::new().container(None, |c| {
        c.text(header(E::LYRICS, &search_label))
         .separator(true)
         .text(lyrics_display)
         .separator(false)
         .text(hint("Source: lyrics.ovh"))
    });

    cmd.edit(ctx, &card).await?;
    Ok(())
}

fn error_card(msg: &str) -> FadeResponse {
    use crate::components::emoji::Colour;
    FadeResponse::new().ephemeral().container(None, |c| {
        c.text(format!("✗ {msg}"))
    })
}
