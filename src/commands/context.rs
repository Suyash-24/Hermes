use serenity::{
    model::{
        application::CommandInteraction,
        channel::Message,
        id::{ChannelId, GuildId, UserId},
    },
    prelude::*,
};
use crate::components::v2::{FadeResponse, respond_to_channel};
use crate::error::BotResult;

pub enum CommandContext<'a> {
    Slash(&'a CommandInteraction),
    Prefix(&'a Message),
}

impl<'a> CommandContext<'a> {
    pub fn guild_id(&self) -> Option<GuildId> {
        match self {
            Self::Slash(cmd) => cmd.guild_id,
            Self::Prefix(msg) => msg.guild_id,
        }
    }

    pub fn channel_id(&self) -> ChannelId {
        match self {
            Self::Slash(cmd) => cmd.channel_id,
            Self::Prefix(msg) => msg.channel_id,
        }
    }

    pub fn user_id(&self) -> UserId {
        match self {
            Self::Slash(cmd) => cmd.user.id,
            Self::Prefix(msg) => msg.author.id,
        }
    }

    pub fn user_name(&self) -> String {
        match self {
            Self::Slash(cmd) => cmd.user.name.clone(),
            Self::Prefix(msg) => msg.author.name.clone(),
        }
    }

    pub async fn defer(&self, ctx: &Context) -> BotResult<()> {
        match self {
            Self::Slash(cmd) => {
                cmd.defer(&ctx.http).await.map_err(BotError::Discord)?;
            }
            Self::Prefix(msg) => {
                // For prefix, we can send a typing indicator
                let _ = msg.channel_id.broadcast_typing(&ctx.http).await;
            }
        }
        Ok(())
    }

    pub async fn respond(&self, ctx: &Context, card: &FadeResponse) -> BotResult<()> {
        match self {
            Self::Slash(cmd) => {
                crate::components::v2::respond_to_interaction(&ctx.http, cmd.id.get(), &cmd.token, card)
                    .await.map_err(BotError::Discord)?;
            }
            Self::Prefix(msg) => {
                let _ = respond_to_channel(&ctx.http, msg.channel_id, card).await;
            }
        }
        Ok(())
    }

    pub async fn edit(&self, ctx: &Context, card: &FadeResponse) -> BotResult<Message> {
        match self {
            Self::Slash(cmd) => {
                crate::components::v2::edit_interaction_response(&ctx.http, &cmd.token, card)
                    .await.map_err(BotError::Discord)
            }
            Self::Prefix(msg) => {
                respond_to_channel(&ctx.http, msg.channel_id, card).await.map_err(BotError::Discord)
            }
        }
    }
}
