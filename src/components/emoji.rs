/// Fade's emoji system.
///
/// Every emoji Fade uses lives here — no magic strings scattered in command
/// files. Grouped by role so responses feel cohesive and intentional.
///
/// Design direction: cool, minimal, slightly celestial.
/// Avoid: bright primary colours, overly playful, random.
///
/// # Usage
/// ```rust
/// use crate::components::emoji::E;
///
/// let header = format!("{} Fade", E::BRAND);
/// let stat   = format!("{} {} members", E::MEMBERS, count);
/// ```

pub struct E;

impl E {
    // ── Brand / Identity ──────────────────────────────────────────────────────
    pub const BRAND:       &'static str = "🌊"; // Fade's signature
    pub const STAR:        &'static str = "✦";  // decorative accent (no variation selector)
    pub const SPARK:       &'static str = "✧";  // lighter accent
    pub const CROWN:       &'static str = "◈";  // owner / top rank

    // ── Status ────────────────────────────────────────────────────────────────
    pub const ONLINE:      &'static str = "🟢";
    pub const IDLE:        &'static str = "🟡";
    pub const DND:         &'static str = "🔴";
    pub const OFFLINE:     &'static str = "⚫";
    pub const OK:          &'static str = "✓";
    pub const ERROR:       &'static str = "✗";
    pub const WARN:        &'static str = "⚠";
    pub const INFO:        &'static str = "◎";

    // ── Actions / UI ─────────────────────────────────────────────────────────
    pub const REFRESH:     &'static str = "🔄";
    pub const BACK:        &'static str = "←";
    pub const FORWARD:     &'static str = "→";
    pub const LINK:        &'static str = "⎋";
    pub const CLOSE:       &'static str = "✕";
    pub const CONFIRM:     &'static str = "✔";
    pub const SEARCH:      &'static str = "⌕";
    pub const SETTINGS:    &'static str = "⚙";
    pub const PIN:         &'static str = "⊕";
    pub const COPY:        &'static str = "⎙";

    // ── Server / Guild stats ──────────────────────────────────────────────────
    pub const MEMBERS:     &'static str = "◉";
    pub const CHANNELS:    &'static str = "≡";
    pub const ROLES:       &'static str = "◆";
    pub const BOOSTS:      &'static str = "⬡";
    pub const CREATED:     &'static str = "◷";
    pub const REGION:      &'static str = "◍";
    pub const ID:          &'static str = "⋕";

    // ── Bot stats ─────────────────────────────────────────────────────────────
    pub const LATENCY:     &'static str = "⚡";
    pub const SHARD:       &'static str = "◈";
    pub const UPTIME:      &'static str = "⏲";
    pub const SERVERS:     &'static str = "⊞";
    pub const VERSION:     &'static str = "◇";
    pub const MEMORY:      &'static str = "▣";
    pub const CPU:         &'static str = "▤";

    // ── User profile ──────────────────────────────────────────────────────────
    pub const USER:        &'static str = "◯";
    pub const AVATAR:      &'static str = "▣";
    pub const JOINED:      &'static str = "◷";
    pub const BADGE:       &'static str = "◈";
    pub const NITRO:       &'static str = "⬡";

    // ── Moderation ────────────────────────────────────────────────────────────
    pub const BAN:         &'static str = "⊗";
    pub const KICK:        &'static str = "⊘";
    pub const MUTE:        &'static str = "⊖";
    pub const WARN_MOD:    &'static str = "⚠";
    pub const LOG:         &'static str = "⊟";
    pub const SHIELD:      &'static str = "⬡";
    pub const LOCK:        &'static str = "⊕";
    pub const UNLOCK:      &'static str = "⊖";

    // ── Music ─────────────────────────────────────────────────────────────────
    pub const MUSIC:       &'static str = "🎵";
    pub const PLAYING:     &'static str = "▶";
    pub const PAUSED:      &'static str = "⏸";
    pub const STOPPED:     &'static str = "⏹";
    pub const SKIP:        &'static str = "⏭";
    pub const PREV:        &'static str = "⏮";
    pub const QUEUE:       &'static str = "≡";
    pub const SHUFFLE:     &'static str = "🔀";
    pub const LOOP:        &'static str = "🔁";
    pub const LOOP_ONE:    &'static str = "🔂";
    pub const VOLUME_UP:   &'static str = "🔊";
    pub const VOLUME_DOWN: &'static str = "🔉";
    pub const MUTED:       &'static str = "🔇";
    pub const NOTE:        &'static str = "♪";
    pub const NOTES:       &'static str = "♫";
    pub const DISC:        &'static str = "💿";
    pub const MIC:         &'static str = "🎤";
    pub const WAVE:        &'static str = "〰";
    pub const HEADPHONES:  &'static str = "🎧";
    pub const SPEAKER:     &'static str = "🔈";
    pub const LYRICS:      &'static str = "📜";
    pub const DURATION:    &'static str = "⏱";
    pub const JOINED_VC:   &'static str = "🔊";
    pub const LEFT_VC:     &'static str = "🔇";

    // ── Progress bar ──────────────────────────────────────────────────────────
    pub const BAR_FULL:    &'static str = "▓";
    pub const BAR_EMPTY:   &'static str = "░";
    pub const BAR_HEAD:    &'static str = "◉";

    // ── Separators / decorative ───────────────────────────────────────────────
    pub const DOT:         &'static str = "·";
    pub const BULLET:      &'static str = "▸";
    pub const DASH:        &'static str = "—";
    pub const PIPE:        &'static str = "│";
    pub const CORNER:      &'static str = "╰";
    pub const LINE:        &'static str = "─";

    // ── Response accent colours (for Container accent_color) ──────────────────
    // Use these with `FadeResponse::container(None, ...)`
}

/// Accent colours for Container components.
/// 24-bit RGB integers.
pub struct Colour;

impl Colour {
    // Fade's palette — cool, desaturated, intentional
    pub const BLURPLE:     u32 = 0x5865F2; // Discord brand
    pub const FADE:        u32 = 0x7B8CDE; // Fade's signature blue-purple
    pub const SLATE:       u32 = 0x4A5568; // neutral dark
    pub const MIST:        u32 = 0x718096; // neutral mid
    pub const ICE:         u32 = 0xA0AEC0; // light neutral
    pub const VOID:        u32 = 0x2D3748; // near-black
    pub const AURORA:      u32 = 0x667EEA; // soft indigo
    pub const DUSK:        u32 = 0x764BA2; // deep purple
    pub const OCEAN:       u32 = 0x006994; // deep teal-blue
    pub const FROST:       u32 = 0x81ECEC; // pale cyan

    // Semantic
    pub const SUCCESS:     u32 = 0x48BB78; // green
    pub const WARNING:     u32 = 0xECC94B; // amber
    pub const DANGER:      u32 = 0xFC8181; // soft red
    pub const INFO:        u32 = 0x63B3ED; // sky blue

    // Music-specific
    pub const MUSIC:       u32 = 0x9B59B6; // rich violet for now-playing
    pub const QUEUE_CLR:   u32 = 0x3498DB; // blue for queue
    pub const LYRICS_CLR:  u32 = 0x1ABC9C; // teal for lyrics
}

// ── Formatted line helpers ────────────────────────────────────────────────────

/// Format a stat row: `{emoji}  **{label}** — {value}`
pub fn stat(emoji: &str, label: &str, value: impl std::fmt::Display) -> String {
    format!("{emoji}  **{label}** — {value}")
}

/// Format a muted hint line: `-# {text}`
pub fn hint(text: impl Into<String>) -> String {
    format!("-# {}", text.into())
}

/// Format a section header: `## {emoji} {title}`
pub fn header(emoji: &str, title: impl Into<String>) -> String {
    format!("## {emoji} {}", title.into())
}

/// Format a subheader: `### {title}`
pub fn subheader(title: impl Into<String>) -> String {
    format!("### {}", title.into())
}

/// A decorative divider line using Fade's accent chars.
pub fn divider_text() -> String {
    format!("{} {} {}", E::LINE.repeat(8), E::STAR, E::LINE.repeat(8))
}

/// Build a text-based progress bar.
/// `progress` is 0.0..=1.0, `width` is total bar character count.
pub fn progress_bar(progress: f64, width: usize) -> String {
    let filled = ((progress.clamp(0.0, 1.0) * width as f64) as usize).min(width);
    let empty = width.saturating_sub(filled);
    format!(
        "{}{}{}",
        E::BAR_FULL.repeat(filled),
        if filled < width { E::BAR_HEAD } else { "" },
        E::BAR_EMPTY.repeat(empty.saturating_sub(if filled < width { 1 } else { 0 })),
    )
}

/// Format milliseconds as `m:ss` or `h:mm:ss`.
pub fn format_duration_ms(ms: u64) -> String {
    let total_secs = ms / 1000;
    let hours = total_secs / 3600;
    let mins = (total_secs % 3600) / 60;
    let secs = total_secs % 60;
    if hours > 0 {
        format!("{hours}:{mins:02}:{secs:02}")
    } else {
        format!("{mins}:{secs:02}")
    }
}

/// Parse a `mm:ss` or `hh:mm:ss` timestamp into milliseconds.
pub fn parse_timestamp(ts: &str) -> Option<u64> {
    let parts: Vec<u64> = ts.split(':')
        .map(|p| p.parse().ok())
        .collect::<Option<Vec<_>>>()?;
    let ms = match parts.as_slice() {
        [m, s] => m * 60_000 + s * 1_000,
        [h, m, s] => h * 3_600_000 + m * 60_000 + s * 1_000,
        _ => return None,
    };
    Some(ms)
}
