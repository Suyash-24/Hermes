/// Now-playing card builder for Fade.
///
/// Builds the aesthetic Components v2 now-playing message used by /play,
/// /nowplaying, and button refresh handlers.
use crate::components::{
    emoji::{format_duration_ms, header, hint, progress_bar, E},
    v2::{ButtonStyle, FadeResponse},
};
use crate::music::{queue::LoopMode, TrackInfo};

/// Build a full now-playing card with control buttons.
pub fn build_now_playing_card(
    track: &TrackInfo,
    position_ms: u64,
    loop_mode: LoopMode,
    is_shuffled: bool,
    volume: u8,
    queue_len: usize,
    is_paused: bool,
) -> FadeResponse {
    let progress = if track.duration_ms > 0 {
        position_ms as f64 / track.duration_ms as f64
    } else {
        0.0
    };

    let bar = progress_bar(progress, 16);
    let pos_str = format_duration_ms(position_ms);
    let dur_str = track.duration_display();
    let progress_line = format!("{} `{} / {}`", bar, pos_str, dur_str);

    let loop_label = match loop_mode {
        LoopMode::Off => format!("{} Off", E::FORWARD),
        LoopMode::Track => format!("{} Track", E::LOOP_ONE),
        LoopMode::Queue => format!("{} Queue", E::LOOP),
    };

    let shuffle_label = if is_shuffled {
        format!("{} On", E::SHUFFLE)
    } else {
        format!("{} Off", E::SHUFFLE)
    };

    let pause_emoji = if is_paused { E::PLAYING } else { E::PAUSED };
    let pause_label = if is_paused { "Resume" } else { "Pause" };

    let thumbnail_url = track
        .artwork_url
        .clone()
        .unwrap_or_else(|| "https://i.imgur.com/RtdAzJA.png".to_string());

    FadeResponse::new().container(None, |c| {
        c
            // Header section with thumbnail
            .section(|s| {
                s.text(header(E::MUSIC, "Now Playing"))
                 .text(format!("**{}**\n{} {} {} `{}`",
                     truncate(&track.title, 50),
                     track.author,
                     E::DOT,
                     E::DURATION,
                     dur_str,
                 ))
                 .text(hint(format!(
                     "Requested by {} {} {} in queue",
                     track.requested_by_name,
                     E::PIPE,
                     queue_len,
                 )))
                 .thumbnail(&thumbnail_url)
            })
            .separator(true)
            // Progress bar
            .text(progress_line)
            .text(format!(
                "{} {}  {} {}  {} `{}%`",
                E::LOOP, loop_label,
                E::SHUFFLE, shuffle_label,
                E::VOLUME_UP, volume,
            ))
            .separator(true)
            // Control buttons row 1: prev / pause / skip / stop
            .action_row(|r| {
                r.button_emoji("music_prev",  "Prev",  ButtonStyle::Secondary, E::PREV)
                 .button_emoji("music_pause", pause_label, ButtonStyle::Primary, pause_emoji)
                 .button_emoji("music_skip",  "Skip",  ButtonStyle::Secondary, E::SKIP)
                 .button_emoji("music_stop",  "Stop",  ButtonStyle::Danger,    E::STOPPED)
            })
            // Control buttons row 2: shuffle / loop / vol down / vol up
            .action_row(|r| {
                r.button_emoji("music_shuffle",  "Shuffle", ButtonStyle::Secondary, E::SHUFFLE)
                 .button_emoji("music_loop",     "Loop",    ButtonStyle::Secondary, E::LOOP)
                 .button_emoji("music_vol_down", "-10",     ButtonStyle::Secondary, E::VOLUME_DOWN)
                 .button_emoji("music_vol_up",   "+10",     ButtonStyle::Secondary, E::VOLUME_UP)
            })
    })
}

/// Build a compact "added to queue" confirmation card.
pub fn build_queued_card(track: &TrackInfo, position: usize) -> FadeResponse {
    let thumbnail_url = track
        .artwork_url
        .clone()
        .unwrap_or_else(|| "https://i.imgur.com/RtdAzJA.png".to_string());

    FadeResponse::new().container(None, |c| {
        c.section(|s| {
            s.text(format!("{} **Added to Queue**", E::NOTES))
             .text(format!("**{}**\n{} {} {} `{}`",
                 truncate(&track.title, 50),
                 track.author,
                 E::DOT,
                 E::DURATION,
                 track.duration_display(),
             ))
             .text(hint(format!("Position #{position} in queue")))
             .thumbnail(&thumbnail_url)
        })
    })
}

/// Build a playlist queued confirmation card.
pub fn build_playlist_queued_card(tracks: &[TrackInfo]) -> FadeResponse {
    let total_ms: u64 = tracks.iter().map(|t| t.duration_ms).sum();
    FadeResponse::new().container(None, |c| {
        c.text(format!(
            "{} **Playlist Added** — {} tracks {} `{}`",
            E::DISC,
            tracks.len(),
            E::PIPE,
            format_duration_ms(total_ms),
        ))
    })
}

/// Build an error card.
pub fn build_error_card(message: &str) -> FadeResponse {
    let has_emoji = message.chars().next().map(|c| !c.is_ascii()).unwrap_or(false);
    let content = if has_emoji {
        message.to_string()
    } else {
        format!("{} {}", E::ERROR, message)
    };

    FadeResponse::new().ephemeral().container(None, |c| {
        c.text(content)
    })
}

/// Build a success card.
pub fn build_success_card(message: &str) -> FadeResponse {
    FadeResponse::new().container(None, |c| {
        c.text(message)
    })
}

/// Build the paginated queue card.
pub fn build_queue_card(
    tracks: &[crate::music::TrackInfo],
    current: Option<&TrackInfo>,
    page: usize,
    total_pages: usize,
    loop_mode: LoopMode,
    is_shuffled: bool,
    volume: u8,
) -> FadeResponse {
    const PAGE_SIZE: usize = 8;
    let start = page * PAGE_SIZE;
    let page_tracks = tracks.iter().skip(start).take(PAGE_SIZE);

    let mut lines = Vec::new();
    if let Some(cur) = current {
        lines.push(format!(
            "{} **{}** — {}\n{}",
            E::PLAYING,
            truncate(&cur.title, 45),
            cur.author,
            hint(format!("{} {}", E::DURATION, cur.duration_display())),
        ));
    }

    for (i, track) in page_tracks.enumerate() {
        let pos = start + i + 1;
        lines.push(format!(
            "{}. **{}** — {}  `{}`",
            pos,
            truncate(&track.title, 40),
            track.author,
            track.duration_display(),
        ));
    }

    let queue_text = if lines.is_empty() {
        format!("{} Queue is empty", E::QUEUE)
    } else {
        lines.join("\n")
    };

    let total_ms: u64 = tracks.iter().map(|t| t.duration_ms).sum();
    let footer = format!(
        "{} Loop: {} {} Shuffle: {} {} Vol: {}%  {} Total: {}",
        E::LOOP, loop_mode.label(),
        E::DOT,
        if is_shuffled { "On" } else { "Off" },
        E::DOT,
        volume,
        E::PIPE,
        format_duration_ms(total_ms),
    );

    FadeResponse::new().container(None, |c| {
        let c = c
            .text(header(E::QUEUE, format!("Queue  {} Page {}/{}", E::PIPE, page + 1, total_pages.max(1))))
            .separator(true)
            .text(queue_text)
            .separator(true)
            .text(hint(footer));

        if total_pages > 1 {
            c.action_row(|r| {
                let r = if page > 0 {
                    r.button_emoji(
                        format!("queue_prev_{page}"),
                        "Prev",
                        ButtonStyle::Secondary,
                        E::BACK,
                    )
                } else {
                    r.button_disabled("Prev", ButtonStyle::Secondary)
                };
                let r = if page + 1 < total_pages {
                    r.button_emoji(
                        format!("queue_next_{}", page + 2),
                        "Next",
                        ButtonStyle::Secondary,
                        E::FORWARD,
                    )
                } else {
                    r.button_disabled("Next", ButtonStyle::Secondary)
                };
                r
            })
        } else {
            c
        }
    })
}

/// Truncate a string to `max` chars, appending `…` if truncated.
pub fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max.saturating_sub(1)).collect();
        format!("{truncated}…")
    }
}
