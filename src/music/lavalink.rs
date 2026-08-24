/// Lavalink helper functions for Fade.
///
/// Wraps common lavalink-rs operations: joining VC, searching, playing,
/// pausing, seeking, volume, etc.
use crate::error::{BotError, BotResult};
use crate::music::TrackInfo;
use lavalink_rs::{
    client::LavalinkClient,
    model::{
        search::SearchEngines,
        track::TrackData,
    },
};
use serenity::model::id::GuildId;

// ── Search ────────────────────────────────────────────────────────────────────

/// Search YouTube (or load a URL) and return the first batch of tracks.
/// For a direct URL, returns the tracks in that playlist/single.
/// For a text query, returns up to `limit` search results.
pub async fn search_tracks(
    lavalink: &LavalinkClient,
    guild_id: GuildId,
    query: &str,
    limit: usize,
) -> BotResult<Vec<TrackInfo>> {
    // Determine if this is a URL or a search query.
    let search_query = if is_url(query) {
        query.to_string()
    } else {
        SearchEngines::YouTube.to_query(query).map_err(|e| BotError::Lavalink(e.to_string()))?
    };

    let results = lavalink
        .load_tracks(guild_id, &search_query)
        .await
        .map_err(|e| BotError::Lavalink(e.to_string()))?;

    use lavalink_rs::model::track::TrackLoadData;
    let tracks: Vec<TrackInfo> = match results.data {
        Some(TrackLoadData::Track(t)) => vec![lava_to_track(t, 0, "")],
        Some(TrackLoadData::Playlist(pl)) => pl
            .tracks
            .into_iter()
            .take(limit)
            .map(|t| lava_to_track(t, 0, ""))
            .collect(),
        Some(TrackLoadData::Search(hits)) => hits
            .into_iter()
            .take(limit)
            .map(|t| lava_to_track(t, 0, ""))
            .collect(),
        _ => vec![],
    };

    if tracks.is_empty() {
        return Err(BotError::NoResults(query.to_string()));
    }

    Ok(tracks)
}

/// Search and return just the top result.
pub async fn search_one(
    lavalink: &LavalinkClient,
    guild_id: GuildId,
    query: &str,
    requested_by: u64,
    requested_by_name: &str,
) -> BotResult<TrackInfo> {
    let search_query = if is_url(query) {
        query.to_string()
    } else {
        SearchEngines::YouTube.to_query(query).map_err(|e| BotError::Lavalink(e.to_string()))?
    };

    let results = lavalink
        .load_tracks(guild_id, &search_query)
        .await
        .map_err(|e| BotError::Lavalink(e.to_string()))?;

    use lavalink_rs::model::track::TrackLoadData;
    let track = match results.data {
        Some(TrackLoadData::Track(t)) => lava_to_track(t, requested_by, requested_by_name),
        Some(TrackLoadData::Playlist(pl)) => {
            let first = pl.tracks.into_iter().next()
                .ok_or_else(|| BotError::NoResults(query.to_string()))?;
            lava_to_track(first, requested_by, requested_by_name)
        }
        Some(TrackLoadData::Search(hits)) => {
            let first = hits.into_iter().next()
                .ok_or_else(|| BotError::NoResults(query.to_string()))?;
            lava_to_track(first, requested_by, requested_by_name)
        }
        _ => return Err(BotError::NoResults(query.to_string())),
    };

    Ok(track)
}

/// Search and return a related track for autoplay, avoiding the exact last track.
pub async fn search_autoplay(
    lavalink: &LavalinkClient,
    guild_id: GuildId,
    query: &str,
    history: &std::collections::VecDeque<String>,
    requested_by: u64,
    requested_by_name: &str,
) -> BotResult<TrackInfo> {
    let search_query = SearchEngines::YouTube.to_query(query).map_err(|e| BotError::Lavalink(e.to_string()))?;

    let results = lavalink
        .load_tracks(guild_id, &search_query)
        .await
        .map_err(|e| BotError::Lavalink(e.to_string()))?;

    use lavalink_rs::model::track::TrackLoadData;
    let track = match results.data {
        Some(TrackLoadData::Search(hits)) => {
            let mut selected = None;
            for hit in hits.into_iter() {
                let hit_str = format!("{} by {}", hit.info.title, hit.info.author);
                // Check if hit_str is in history
                if !history.iter().any(|h| h.eq_ignore_ascii_case(&hit_str)) {
                    selected = Some(hit);
                    break;
                }
            }
            let track_data = selected.ok_or_else(|| BotError::NoResults(query.to_string()))?;
            lava_to_track(track_data, requested_by, requested_by_name)
        }
        Some(TrackLoadData::Playlist(pl)) => {
            let mut selected = None;
            for hit in pl.tracks.into_iter() {
                let hit_str = format!("{} by {}", hit.info.title, hit.info.author);
                if !history.iter().any(|h| h.eq_ignore_ascii_case(&hit_str)) {
                    selected = Some(hit);
                    break;
                }
            }
            let track_data = selected.ok_or_else(|| BotError::NoResults(query.to_string()))?;
            lava_to_track(track_data, requested_by, requested_by_name)
        }
        Some(TrackLoadData::Track(t)) => lava_to_track(t, requested_by, requested_by_name),
        _ => return Err(BotError::NoResults(query.to_string())),
    };

    Ok(track)
}

/// Search and return all results from a playlist URL or search query.
pub async fn search_all(
    lavalink: &LavalinkClient,
    guild_id: GuildId,
    query: &str,
    requested_by: u64,
    requested_by_name: &str,
) -> BotResult<Vec<TrackInfo>> {
    let search_query = if is_url(query) {
        query.to_string()
    } else {
        SearchEngines::YouTube.to_query(query).map_err(|e| BotError::Lavalink(e.to_string()))?
    };

    let results = lavalink
        .load_tracks(guild_id, &search_query)
        .await
        .map_err(|e| BotError::Lavalink(e.to_string()))?;

    use lavalink_rs::model::track::TrackLoadData;
    let tracks: Vec<TrackInfo> = match results.data {
        Some(TrackLoadData::Track(t)) => vec![lava_to_track(t, requested_by, requested_by_name)],
        Some(TrackLoadData::Playlist(pl)) => pl
            .tracks
            .into_iter()
            .map(|t| lava_to_track(t, requested_by, requested_by_name))
            .collect(),
        Some(TrackLoadData::Search(hits)) => {
            if let Some(first) = hits.into_iter().next() {
                vec![lava_to_track(first, requested_by, requested_by_name)]
            } else {
                vec![]
            }
        },
        _ => vec![],
    };

    if tracks.is_empty() {
        return Err(BotError::NoResults(query.to_string()));
    }
    Ok(tracks)
}

// ── Playback control ──────────────────────────────────────────────────────────

/// Tell lavalink to play (or enqueue) a track for a guild.
pub async fn play_track(
    lavalink: &LavalinkClient,
    guild_id: GuildId,
    track: &TrackInfo,
) -> BotResult<()> {
    let ctx = lavalink.get_player_context(guild_id)
        .ok_or_else(|| BotError::Lavalink("No player context".into()))?;
    ctx.play_now(&lavalink_rs::model::track::TrackData {
            encoded: track.encoded.clone(),
            info: lavalink_rs::model::track::TrackInfo {
                identifier: track.identifier.clone(),
                is_seekable: !track.is_stream,
                author: track.author.clone(),
                length: track.duration_ms,
                is_stream: track.is_stream,
                position: 0,
                title: track.title.clone(),
                uri: track.uri.clone(),
                artwork_url: track.artwork_url.clone(),
                isrc: None,
                source_name: track.source_name.clone(),
            },
            user_data: None,
            plugin_info: Default::default(),
        })
        .await
        .map_err(|e| BotError::Lavalink(e.to_string()))?;
    Ok(())
}

/// Pause the player for a guild.
pub async fn pause(lavalink: &LavalinkClient, guild_id: GuildId) -> BotResult<()> {
    let ctx = lavalink.get_player_context(guild_id)
        .ok_or_else(|| BotError::Lavalink("No player context".into()))?;
    ctx.set_pause(true)
        .await
        .map_err(|e| BotError::Lavalink(e.to_string()))?;
    Ok(())
}

/// Resume the player for a guild.
pub async fn resume(lavalink: &LavalinkClient, guild_id: GuildId) -> BotResult<()> {
    let ctx = lavalink.get_player_context(guild_id)
        .ok_or_else(|| BotError::Lavalink("No player context".into()))?;
    ctx.set_pause(false)
        .await
        .map_err(|e| BotError::Lavalink(e.to_string()))?;
    Ok(())
}

/// Stop the player for a guild (stops track, resets position).
pub async fn stop(lavalink: &LavalinkClient, guild_id: GuildId) -> BotResult<()> {
    let ctx = lavalink.get_player_context(guild_id)
        .ok_or_else(|| BotError::Lavalink("No player context".into()))?;
    ctx.stop_now()
        .await
        .map_err(|e| BotError::Lavalink(e.to_string()))?;
    Ok(())
}

/// Seek to a position in the current track (milliseconds).
pub async fn seek(lavalink: &LavalinkClient, guild_id: GuildId, position_ms: u64) -> BotResult<()> {
    let ctx = lavalink.get_player_context(guild_id)
        .ok_or_else(|| BotError::Lavalink("No player context".into()))?;
    ctx.set_position(std::time::Duration::from_millis(position_ms))
        .await
        .map_err(|e| BotError::Lavalink(e.to_string()))?;
    Ok(())
}

/// Set playback volume (0–150).
pub async fn set_volume(lavalink: &LavalinkClient, guild_id: GuildId, volume: u16) -> BotResult<()> {
    let ctx = lavalink.get_player_context(guild_id)
        .ok_or_else(|| BotError::Lavalink("No player context".into()))?;
    ctx.set_volume(volume)
        .await
        .map_err(|e| BotError::Lavalink(e.to_string()))?;
    Ok(())
}

/// Get the current player position in milliseconds.
pub async fn get_position(lavalink: &LavalinkClient, guild_id: GuildId) -> Option<u64> {
    lavalink.get_player_context(guild_id)?
        .get_player()
        .await
        .ok()
        .map(|p| p.state.position as u64)
}

/// Disconnect and destroy the player.
pub async fn destroy_player(lavalink: &LavalinkClient, guild_id: GuildId) -> BotResult<()> {
    lavalink.delete_player(guild_id).await.map_err(|e| BotError::Lavalink(e.to_string()))?;
    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn is_url(s: &str) -> bool {
    s.starts_with("http://") || s.starts_with("https://")
}

pub fn lava_to_track(data: TrackData, requested_by: u64, requested_by_name: &str) -> TrackInfo {
    TrackInfo {
        encoded:            data.encoded.clone(),
        title:              data.info.title.clone(),
        author:             data.info.author.clone(),
        duration_ms:        data.info.length,
        uri:                data.info.uri.clone(),
        artwork_url:        data.info.artwork_url.clone(),
        requested_by,
        requested_by_name:  requested_by_name.to_string(),
        is_stream:          data.info.is_stream,
        identifier:         data.info.identifier.clone(),
        source_name:        data.info.source_name.clone(),
    }
}
