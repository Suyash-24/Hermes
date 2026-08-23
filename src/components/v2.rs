/// Raw Components v2 JSON builder.
///
/// Every public type here serialises to a `serde_json::Value` that Discord
/// accepts when the message carries the IS_COMPONENTS_V2 flag (32768).
///
/// Design goals
/// ────────────
/// • Zero serenity dependency in this file — pure serde_json.
/// • Fluent builder pattern: each method returns `&mut Self`.
/// • The root type `FadeResponse` owns the full list of top-level components
///   and knows how to produce an `InteractionResponse` value for serenity.
use serde_json::{json, Value};

// ── Constants ─────────────────────────────────────────────────────────────────

pub const IS_COMPONENTS_V2: u64 = 1 << 15; // 32768

// Component type IDs
const T_ACTION_ROW:    u8 = 1;
const T_BUTTON:        u8 = 2;
const T_SECTION:       u8 = 9;
const T_TEXT_DISPLAY:  u8 = 10;
const T_THUMBNAIL:     u8 = 11;
const T_MEDIA_GALLERY: u8 = 12;
const T_SEPARATOR:     u8 = 14;
const T_CONTAINER:     u8 = 17;

// Button styles
#[derive(Clone, Copy)]
pub enum ButtonStyle {
    Primary   = 1, // blurple
    Secondary = 2, // grey
    Success   = 3, // green
    Danger    = 4, // red
    Link      = 5, // grey + external link icon
}

// Separator spacing
#[derive(Clone, Copy)]
pub enum Spacing {
    Small  = 1,
    Large  = 2,
}

// ── Root response ─────────────────────────────────────────────────────────────

/// The top-level message payload.  Call `.build()` to get the component list,
/// or `.into_interaction_response_value()` for a full interaction response body.
#[derive(Default)]
pub struct FadeResponse {
    components: Vec<Value>,
    pub(crate) ephemeral:  bool,
    flags:      u64,
}

impl FadeResponse {
    pub fn new() -> Self {
        Self {
            components: Vec::new(),
            ephemeral:  false,
            flags:      IS_COMPONENTS_V2,
        }
    }

    /// Make the response only visible to the invoking user.
    pub fn ephemeral(mut self) -> Self {
        self.ephemeral = true;
        self
    }

    // ── Top-level component pushers ───────────────────────────────────────────

    /// Append a Container (card with optional accent stripe).
    /// `accent` is a 24-bit RGB integer (e.g. `0x5865F2` for Discord blurple).
    pub fn container<F>(mut self, accent: Option<u32>, build: F) -> Self
    where
        F: FnOnce(ContainerBuilder) -> ContainerBuilder,
    {
        let builder = build(ContainerBuilder::new(accent));
        self.components.push(builder.build());
        self
    }

    /// Append a bare TextDisplay (outside any container).
    pub fn text(mut self, content: impl Into<String>) -> Self {
        self.components.push(text_display(content.into()));
        self
    }

    /// Append a Separator outside a container.
    pub fn separator(mut self, divider: bool) -> Self {
        self.components.push(separator(divider, Spacing::Small));
        self
    }

    /// Append a MediaGallery outside a container.
    pub fn media_gallery<F>(mut self, build: F) -> Self
    where
        F: FnOnce(MediaGalleryBuilder) -> MediaGalleryBuilder,
    {
        let builder = build(MediaGalleryBuilder::default());
        self.components.push(builder.build());
        self
    }

    /// Append a classic ActionRow (buttons/selects) outside a container.
    pub fn action_row<F>(mut self, build: F) -> Self
    where
        F: FnOnce(ActionRowBuilder) -> ActionRowBuilder,
    {
        let builder = build(ActionRowBuilder::default());
        self.components.push(builder.build());
        self
    }

    // ── Finalise ──────────────────────────────────────────────────────────────

    /// Returns the `components` array as a JSON Value.
    pub fn components_value(&self) -> Value {
        Value::Array(self.components.clone())
    }

    /// Produce the full JSON body for a `CreateInteractionResponse::Message`.
    /// Serenity lets you pass a raw `Value` via the `execute` helper on
    /// `CommandInteraction` — use this in command handlers.
    pub fn into_interaction_response_value(&self) -> Value {
        let mut flags = self.flags;
        if self.ephemeral {
            flags |= 64; // EPHEMERAL
        }
        json!({
            "type": 4,           // CHANNEL_MESSAGE_WITH_SOURCE
            "data": {
                "content": null,
                "flags": flags,
                "components": self.components,
            }
        })
    }
}

// ── ContainerBuilder ──────────────────────────────────────────────────────────

pub struct ContainerBuilder {
    accent:     Option<u32>,
    spoiler:    bool,
    components: Vec<Value>,
}

impl ContainerBuilder {
    pub fn new(_accent: Option<u32>) -> Self {
        Self { accent: None, spoiler: false, components: Vec::new() }
    }

    pub fn spoiler(mut self) -> Self {
        self.spoiler = true;
        self
    }

    /// Add a TextDisplay inside this container.
    pub fn text(mut self, content: impl Into<String>) -> Self {
        self.components.push(text_display(content.into()));
        self
    }

    /// Add a Separator inside this container.
    pub fn separator(mut self, divider: bool) -> Self {
        self.components.push(separator(divider, Spacing::Small));
        self
    }

    pub fn separator_spaced(mut self, divider: bool) -> Self {
        self.components.push(separator(divider, Spacing::Large));
        self
    }

    /// Add a Section (text + optional thumbnail/button accessory).
    pub fn section<F>(mut self, build: F) -> Self
    where
        F: FnOnce(SectionBuilder) -> SectionBuilder,
    {
        let b = build(SectionBuilder::default());
        self.components.push(b.build());
        self
    }

    /// Add a MediaGallery inside this container.
    pub fn media_gallery<F>(mut self, build: F) -> Self
    where
        F: FnOnce(MediaGalleryBuilder) -> MediaGalleryBuilder,
    {
        let b = build(MediaGalleryBuilder::default());
        self.components.push(b.build());
        self
    }

    /// Add an ActionRow (buttons) inside this container.
    pub fn action_row<F>(mut self, build: F) -> Self
    where
        F: FnOnce(ActionRowBuilder) -> ActionRowBuilder,
    {
        let b = build(ActionRowBuilder::default());
        self.components.push(b.build());
        self
    }

    pub fn build(self) -> Value {
        let mut obj = json!({
            "type": T_CONTAINER,
            "components": self.components,
            "spoiler": self.spoiler,
        });
        if let Some(color) = self.accent {
            obj["accent_color"] = json!(color);
        }
        obj
    }
}

// ── SectionBuilder ────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct SectionBuilder {
    texts:     Vec<Value>,
    accessory: Option<Value>,
}

impl SectionBuilder {
    /// Add a text line to the left column (max 3 per section).
    pub fn text(mut self, content: impl Into<String>) -> Self {
        self.texts.push(text_display(content.into()));
        self
    }

    /// Set a Thumbnail as the right-hand accessory.
    pub fn thumbnail(mut self, url: impl Into<String>) -> Self {
        self.accessory = Some(json!({
            "type": T_THUMBNAIL,
            "media": { "url": url.into() }
        }));
        self
    }

    /// Set a Button as the right-hand accessory.
    pub fn button_accessory(
        mut self,
        custom_id: impl Into<String>,
        label: impl Into<String>,
        style: ButtonStyle,
    ) -> Self {
        self.accessory = Some(button_value(custom_id.into(), label.into(), style, None, None));
        self
    }

    pub fn build(self) -> Value {
        let mut obj = json!({
            "type": T_SECTION,
            "components": self.texts,
        });
        if let Some(acc) = self.accessory {
            obj["accessory"] = acc;
        }
        obj
    }
}

// ── MediaGalleryBuilder ───────────────────────────────────────────────────────

#[derive(Default)]
pub struct MediaGalleryBuilder {
    items: Vec<Value>,
}

impl MediaGalleryBuilder {
    /// Add an image (max 4 per gallery).
    pub fn item(mut self, url: impl Into<String>, description: Option<&str>) -> Self {
        let mut item = json!({ "media": { "url": url.into() } });
        if let Some(desc) = description {
            item["description"] = json!(desc);
        }
        self.items.push(item);
        self
    }

    pub fn build(self) -> Value {
        json!({
            "type": T_MEDIA_GALLERY,
            "items": self.items,
        })
    }
}

// ── ActionRowBuilder ──────────────────────────────────────────────────────────

#[derive(Default)]
pub struct ActionRowBuilder {
    components: Vec<Value>,
}

impl ActionRowBuilder {
    /// Add a regular button.
    pub fn button(
        mut self,
        custom_id: impl Into<String>,
        label: impl Into<String>,
        style: ButtonStyle,
    ) -> Self {
        self.components.push(button_value(
            custom_id.into(),
            label.into(),
            style,
            None,
            None,
        ));
        self
    }

    /// Add a button with an emoji prefix.
    pub fn button_emoji(
        mut self,
        custom_id: impl Into<String>,
        label: impl Into<String>,
        style: ButtonStyle,
        emoji: impl Into<String>,
    ) -> Self {
        self.components.push(button_value(
            custom_id.into(),
            label.into(),
            style,
            Some(emoji.into()),
            None,
        ));
        self
    }

    /// Add a link button (no custom_id, opens a URL).
    pub fn link(mut self, url: impl Into<String>, label: impl Into<String>) -> Self {
        self.components.push(json!({
            "type": T_BUTTON,
            "style": ButtonStyle::Link as u8,
            "label": label.into(),
            "url":   url.into(),
        }));
        self
    }

    /// Add a disabled button (greyed out, unclickable).
    pub fn button_disabled(
        mut self,
        label: impl Into<String>,
        style: ButtonStyle,
    ) -> Self {
        self.components.push(json!({
            "type":     T_BUTTON,
            "style":    style as u8,
            "label":    label.into(),
            "custom_id": format!("disabled_{}", uuid::Uuid::new_v4()),
            "disabled": true,
        }));
        self
    }

    pub fn build(self) -> Value {
        json!({
            "type": T_ACTION_ROW,
            "components": self.components,
        })
    }
}

// ── Primitive constructors ────────────────────────────────────────────────────

fn text_display(content: String) -> Value {
    json!({ "type": T_TEXT_DISPLAY, "content": content })
}

fn separator(divider: bool, spacing: Spacing) -> Value {
    json!({
        "type":    T_SEPARATOR,
        "divider": divider,
        "spacing": spacing as u8,
    })
}

fn button_value(
    custom_id: String,
    label: String,
    style: ButtonStyle,
    emoji: Option<String>,
    url: Option<String>,
) -> Value {
    let mut b = json!({
        "type":      T_BUTTON,
        "style":     style as u8,
        "label":     label,
        "custom_id": custom_id,
    });
    if let Some(e) = emoji {
        b["emoji"] = json!({ "name": e });
    }
    if let Some(u) = url {
        b["url"] = json!(u);
    }
    b
}

// ── Sending helpers ───────────────────────────────────────────────────────────

/// Send a `FadeResponse` as the initial response to a slash command.
///
/// Serenity 0.12 doesn't yet expose raw interaction responses, so we POST
/// directly via the HTTP client's inner `reqwest` handle using the
/// interactions endpoint.
pub async fn respond_to_interaction(
    http: &serenity::http::Http,
    interaction_id: u64,
    interaction_token: &str,
    response: &FadeResponse,
) -> Result<(), serenity::Error> {
    let body = response.into_interaction_response_value();

    http.create_interaction_response(
        interaction_id.into(),
        interaction_token,
        &body,
        vec![],  // no attachments
    )
    .await
}

/// Edit the original interaction response with a new `FadeResponse`.
pub async fn edit_interaction_response(
    http: &serenity::http::Http,
    interaction_token: &str,
    response: &FadeResponse,
) -> Result<serenity::model::channel::Message, serenity::Error> {
    let mut flags = IS_COMPONENTS_V2;
    if response.ephemeral {
        flags |= 64;
    }
    let body = serde_json::json!({
        "content": null,
        "flags": flags,
        "components": response.components_value(),
    });
    http.edit_original_interaction_response(interaction_token, &body, vec![])
        .await
}

/// Send a `FadeResponse` as a regular channel message (not an interaction reply).
/// Used by music event handlers that need to post outside of slash commands.
pub async fn respond_to_channel(
    http: &std::sync::Arc<serenity::http::Http>,
    channel_id: serenity::model::id::ChannelId,
    response: &FadeResponse,
) -> Result<serenity::model::channel::Message, serenity::Error> {
    let flags = IS_COMPONENTS_V2;
    let body = serde_json::json!({
        "flags": flags,
        "components": response.components_value(),
    });
    // POST to the messages endpoint with the Components v2 flag.
    http.send_message(channel_id, vec![], &body).await
}

/// Edit an existing channel message with a `FadeResponse`.
pub async fn edit_channel_message(
    http: &std::sync::Arc<serenity::http::Http>,
    channel_id: serenity::model::id::ChannelId,
    message_id: serenity::model::id::MessageId,
    response: &FadeResponse,
) -> Result<(), serenity::Error> {
    let flags = IS_COMPONENTS_V2;
    let body = serde_json::json!({
        "content": null,
        "flags": flags,
        "components": response.components_value(),
    });
    http.edit_message(channel_id, message_id, &body, vec![]).await?;
    Ok(())
}
