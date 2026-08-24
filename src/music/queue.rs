/// Queue structures for Fade's music system.
///
/// `GuildQueue` holds all playback state for a single guild:
/// - Track list (VecDeque for O(1) front operations)
/// - Current track
/// - Loop mode
/// - Volume (0–150)
/// - Reference to the now-playing message for live updates
use serenity::model::id::{ChannelId, MessageId};
use std::collections::VecDeque;

// ── Loop mode ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum LoopMode {
    #[default]
    Off,
    Track,
    Queue,
}

impl LoopMode {
    pub fn label(&self) -> &'static str {
        match self {
            LoopMode::Off => "Off",
            LoopMode::Track => "Track",
            LoopMode::Queue => "Queue",
        }
    }

    pub fn emoji(&self) -> &'static str {
        match self {
            LoopMode::Off => "➡️",
            LoopMode::Track => "🔂",
            LoopMode::Queue => "🔁",
        }
    }

    /// Cycle to the next mode: Off → Track → Queue → Off
    pub fn next(self) -> Self {
        match self {
            LoopMode::Off => LoopMode::Track,
            LoopMode::Track => LoopMode::Queue,
            LoopMode::Queue => LoopMode::Off,
        }
    }
}

// ── Track info ────────────────────────────────────────────────────────────────

/// Metadata for a single queued track.
#[derive(Debug, Clone)]
pub struct TrackInfo {
    /// Encoded Lavalink track string.
    pub encoded: String,
    /// Human-readable title.
    pub title: String,
    /// Artist / uploader name.
    pub author: String,
    /// Duration in milliseconds.
    pub duration_ms: u64,
    /// Direct stream URL (used for seek, etc.).
    pub uri: Option<String>,
    /// Artwork / thumbnail URL.
    pub artwork_url: Option<String>,
    /// Who requested this track (Discord user ID).
    pub requested_by: u64,
    /// Username of requester.
    pub requested_by_name: String,
    /// Whether this track is a livestream.
    pub is_stream: bool,
    /// Lavalink track identifier (unique per track).
    pub identifier: String,
    /// Source name (e.g. "youtube").
    pub source_name: String,
}

impl TrackInfo {
    pub fn duration_display(&self) -> String {
        if self.is_stream {
            "LIVE".to_string()
        } else {
            crate::components::emoji::format_duration_ms(self.duration_ms)
        }
    }
}

// ── Guild queue ───────────────────────────────────────────────────────────────

/// All music state for a single guild.
#[derive(Debug, Default)]
pub struct GuildQueue {
    /// Upcoming tracks (not including current).
    pub tracks: VecDeque<TrackInfo>,
    /// Currently playing track (if any).
    pub current: Option<TrackInfo>,
    /// Loop behaviour.
    pub loop_mode: LoopMode,
    /// Volume percentage (0–150).
    pub volume: u8,
    /// Whether shuffle mode is active.
    pub shuffle: bool,
    /// The channel and message ID of the now-playing card (for live edits).
    pub now_playing_msg: Option<(ChannelId, MessageId)>,
    /// The text channel to send track-end notifications to.
    pub text_channel: Option<ChannelId>,
    /// The voice channel the bot is in.
    pub voice_channel: Option<ChannelId>,
    /// Whether autoplay is enabled (play related songs when queue is empty).
    pub autoplay: bool,
}

impl GuildQueue {
    pub fn new() -> Self {
        Self {
            volume: 100,
            ..Default::default()
        }
    }

    /// Add a track to the back of the queue.
    pub fn push(&mut self, track: TrackInfo) {
        self.tracks.push_back(track);
    }

    /// Add a track to play next (front of queue).
    pub fn push_front(&mut self, track: TrackInfo) {
        self.tracks.push_front(track);
    }

    /// Pop the next track from the queue.
    /// Handles loop modes: Track repeats current, Queue moves it to the back.
    pub fn pop_next(&mut self) -> Option<TrackInfo> {
        match self.loop_mode {
            LoopMode::Track => {
                // Re-queue the current track first, then return it.
                self.current.clone()
            }
            LoopMode::Queue => {
                // Move current to back, then pop front.
                if let Some(cur) = self.current.take() {
                    self.tracks.push_back(cur);
                }
                let next = self.tracks.pop_front();
                self.current = next.clone();
                next
            }
            LoopMode::Off => {
                let next = self.tracks.pop_front();
                self.current = next.clone();
                next
            }
        }
    }

    /// Skip n tracks (default 1). Returns the new current track.
    pub fn skip(&mut self, count: usize) -> Option<TrackInfo> {
        let count = count.max(1);
        // Remove the ones we're skipping from the front.
        for _ in 0..count.saturating_sub(1) {
            self.tracks.pop_front();
        }
        self.loop_mode = LoopMode::Off; // Skip breaks loop-track mode
        let next = self.tracks.pop_front();
        self.current = next.clone();
        next
    }

    /// Remove track at 1-based position from the queue (not counting current).
    pub fn remove(&mut self, position: usize) -> Option<TrackInfo> {
        if position == 0 || position > self.tracks.len() {
            return None;
        }
        let idx = position - 1;
        // VecDeque doesn't have O(1) removal in the middle, but queues are small.
        let track = self.tracks.remove(idx);
        track
    }

    /// Move track from 1-based `from` to 1-based `to` position.
    pub fn move_track(&mut self, from: usize, to: usize) -> bool {
        if from == 0 || to == 0 || from > self.tracks.len() || to > self.tracks.len() {
            return false;
        }
        let track = self.tracks.remove(from - 1);
        if let Some(t) = track {
            let insert_pos = (to - 1).min(self.tracks.len());
            self.tracks.insert(insert_pos, t);
            true
        } else {
            false
        }
    }

    /// Shuffle the queue using a simple Fisher-Yates shuffle.
    pub fn shuffle_queue(&mut self) {
        use std::time::{SystemTime, UNIX_EPOCH};
        let len = self.tracks.len();
        if len < 2 {
            return;
        }
        // Simple LCG-based shuffle (no rand dep needed)
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .subsec_nanos() as u64;
        let mut rng = seed;
        let v: Vec<TrackInfo> = self.tracks.drain(..).collect();
        let mut v = v;
        for i in (1..len).rev() {
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let j = (rng >> 33) as usize % (i + 1);
            v.swap(i, j);
        }
        self.tracks = VecDeque::from(v);
    }

    /// Clear the queue (keeps current track playing).
    pub fn clear(&mut self) {
        self.tracks.clear();
    }

    /// Total number of tracks including current.
    pub fn total_count(&self) -> usize {
        self.current.as_ref().map_or(0, |_| 1) + self.tracks.len()
    }

    /// Total duration of all queued (not current) tracks in milliseconds.
    pub fn queue_duration_ms(&self) -> u64 {
        self.tracks.iter().map(|t| t.duration_ms).sum()
    }

    /// Is the queue completely empty (no current + no queued)?
    pub fn is_empty(&self) -> bool {
        self.current.is_none() && self.tracks.is_empty()
    }
}
