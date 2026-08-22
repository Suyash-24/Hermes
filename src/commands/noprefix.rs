use crate::commands::music_cards::{build_error_card, build_success_card};
use crate::error::BotResult;
use crate::state::AppState;
use serenity::prelude::*;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use regex::Regex;

pub async fn run(
    ctx: &Context,
    cmd: &crate::commands::context::CommandContext<'_>,
    state: Arc<tokio::sync::RwLock<AppState>>,
    args: &[&str],
) -> BotResult<()> {
    // Only bot owner can use this command
    let is_owner = {
        let state_read = state.read().await;
        state_read.config.bot.owners.contains(&cmd.user().id.get())
    };

    if !is_owner {
        let card = build_error_card("You must be a bot owner to use this command.");
        cmd.respond(ctx, &card).await?;
        return Ok(());
    }

    let (target_arg, duration_arg) = if args.is_empty() {
        let user = match cmd.get_option("user") {
            Some(serenity::model::application::CommandDataOptionValue::User(id)) => id.get().to_string(),
            _ => String::new(),
        };
        let duration = match cmd.get_option("duration") {
            Some(serenity::model::application::CommandDataOptionValue::String(s)) => s.clone(),
            _ => String::new(),
        };
        (user, duration)
    } else {
        let u = args[0].to_string();
        let d = if args.len() > 1 { args[1].to_string() } else { String::new() };
        (u, d)
    };

    if target_arg.is_empty() {
        let card = build_error_card("Usage: noprefix <@user> [duration]\nDuration can be like 2w, 60d, 24h, or lifetime. Defaults to 60d.");
        cmd.respond(ctx, &card).await?;
        return Ok(());
    }

    let mention_regex = Regex::new(r"<@!?(\d+)>").unwrap();
    let target_id = if let Some(captures) = mention_regex.captures(&target_arg) {
        captures[1].parse::<u64>().unwrap_or(0)
    } else {
        target_arg.parse::<u64>().unwrap_or(0)
    };

    if target_id == 0 {
        let card = build_error_card("Invalid user provided. Please mention a valid user.");
        cmd.respond(ctx, &card).await?;
        return Ok(());
    }

    let duration_str = if duration_arg.is_empty() { "60d".to_string() } else { duration_arg.to_lowercase() };

    let is_remove = duration_str == "remove";

    let expires_at = if is_remove {
        0
    } else if duration_str == "lifetime" {
        0
    } else {
        let duration_secs = parse_duration(&duration_str).unwrap_or(60 * 24 * 60 * 60); // default 60 days
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        now + duration_secs
    };

    {
        let state_read = state.read().await;
        let mut db = state_read.db.write().await;
        if is_remove {
            db.noprefix.remove(&target_id);
        } else {
            db.noprefix.insert(target_id, expires_at);
        }
        db.save();
    }

    let msg = if is_remove {
        format!("✅ <@{}> removed from the noprefix list.", target_id)
    } else if expires_at == 0 {
        format!("✅ <@{}> added to the noprefix list for **lifetime**.", target_id)
    } else {
        format!("✅ <@{}> added to the noprefix list until <t:{}:R>.", target_id, expires_at)
    };

    let card = build_success_card(&msg);
    cmd.respond(ctx, &card).await?;

    Ok(())
}

fn parse_duration(s: &str) -> Option<u64> {
    let re = Regex::new(r"^(\d+)([dhw])$").unwrap();
    if let Some(caps) = re.captures(s) {
        let val: u64 = caps[1].parse().unwrap_or(0);
        let mult = match &caps[2] {
            "h" => 3600,
            "d" => 86400,
            "w" => 604800,
            _ => 0,
        };
        Some(val * mult)
    } else {
        None
    }
}
