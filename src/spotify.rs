use serde::Deserialize;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

#[derive(Debug, Deserialize)]
struct SpotifyTokenResponse {
    access_token: String,
    expires_in: u64,
}

#[derive(Debug, Deserialize)]
struct SpotifyPlaylistTracksResponse {
    items: Vec<SpotifyPlaylistItem>,
    next: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SpotifyPlaylistItem {
    track: Option<SpotifyTrack>,
}

#[derive(Debug, Deserialize)]
struct SpotifyTrack {
    name: String,
    artists: Vec<SpotifyArtist>,
}

#[derive(Debug, Deserialize)]
struct SpotifyArtist {
    name: String,
}

#[derive(Debug)]
pub struct SpotifyClient {
    http: reqwest::Client,
    client_id: String,
    client_secret: String,
    refresh_token: String,
    cached_token: Mutex<Option<(String, Instant)>>,
}

impl SpotifyClient {
    pub fn new(client_id: String, client_secret: String, refresh_token: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            client_id,
            client_secret,
            refresh_token,
            cached_token: Mutex::new(None),
        }
    }

    async fn get_access_token(&self) -> Result<String, reqwest::Error> {
        {
            let cache = self.cached_token.lock().await;
            if let Some((token, expiry)) = cache.as_ref() {
                if Instant::now() < *expiry {
                    return Ok(token.clone());
                }
            }
        }

        let params = [
            ("grant_type", "refresh_token"),
            ("refresh_token", self.refresh_token.as_str()),
            ("client_id", self.client_id.as_str()),
            ("client_secret", self.client_secret.as_str()),
        ];

        let resp: SpotifyTokenResponse = self
            .http
            .post("https://accounts.spotify.com/api/token")
            .form(&params)
            .send()
            .await?
            .json()
            .await?;

        let expiry = Instant::now() + Duration::from_secs(resp.expires_in.saturating_sub(60));
        *self.cached_token.lock().await = Some((resp.access_token.clone(), expiry));

        Ok(resp.access_token)
    }

    /// Returns "Artist - Title" search strings for every track in the playlist.
    /// Caps at `max_tracks` to prevent timeouts.
    pub async fn get_playlist_search_queries(
        &self,
        playlist_id: &str,
        max_tracks: usize,
    ) -> Result<Vec<String>, reqwest::Error> {
        let token = self.get_access_token().await?;
        let mut queries = Vec::new();
        let mut offset: u32 = 0;
        let limit: u32 = 100;

        loop {
            let url = format!(
                "https://api.spotify.com/v1/playlists/{playlist_id}/tracks?limit={limit}&offset={offset}"
            );

            let resp: SpotifyPlaylistTracksResponse = self
                .http
                .get(&url)
                .bearer_auth(&token)
                .send()
                .await?
                .json()
                .await?;

            let batch_len = resp.items.len();

            for item in resp.items {
                if queries.len() >= max_tracks {
                    break;
                }
                if let Some(track) = item.track {
                    let artist = track
                        .artists
                        .first()
                        .map(|a| a.name.clone())
                        .unwrap_or_default();
                    queries.push(format!("{} - {}", artist, track.name));
                }
            }

            if queries.len() >= max_tracks || resp.next.is_none() || batch_len == 0 {
                break;
            }
            offset += limit;
        }

        Ok(queries)
    }
}

/// Extracts the playlist ID from a Spotify playlist URL.
pub fn extract_playlist_id(url: &str) -> Option<String> {
    if !url.contains("spotify.com/playlist/") {
        return None;
    }
    let after = url.split("playlist/").nth(1)?;
    let id = after.split(['?', '#']).next()?;
    Some(id.to_string())
}
