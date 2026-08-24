use crate::commands::music_cards::{build_error_card, build_success_card};
use crate::components::emoji::E;
use crate::error::BotResult;
use crate::state::AppState;
use serenity::prelude::*;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

/// Parse a duration string like "30d", "1y", "12h" into seconds.
fn parse_duration(s: &str) -> Option<u64> {
    if s.eq_ignore_ascii_case("lifetime") {
        return Some(0);
    }
    
    let chars = s.chars().collect::<Vec<_>>();
    let mut num_str = String::new();
    let mut unit = String::new();

    for c in chars {
        if c.is_ascii_digit() {
            num_str.push(c);
        } else {
            unit.push(c.to_ascii_lowercase());
        }
    }

    let num: u64 = num_str.parse().ok()?;
    
    let multiplier = match unit.as_str() {
        "s" | "sec" | "secs" => 1,
        "m" | "min" | "mins" => 60,
        "h" | "hr" | "hrs" => 3600,
        "d" | "day" | "days" => 86400,
        "w" | "wk" | "weeks" => 604800,
        "mo" | "month" | "months" => 2_592_000, // 30 days
        "y" | "yr" | "years" => 31_536_000,     // 365 days
        _ => return None,
    };

    Some(num * multiplier)
}

pub async fn run(
    ctx: &Context,
    cmd: &crate::commands::context::CommandContext<'_>,
    state: Arc<tokio::sync::RwLock<AppState>>,
    args: &[&str],
) -> BotResult<()> {
    // Check if user is owner
    let is_owner = {
        let state_read = state.read().await;
        state_read.config.bot.owners.contains(&cmd.user_id().get())
    };

    if !is_owner {
        let card = build_error_card("Only bot owners can use this command.");
        cmd.respond(ctx, &card).await?;
        return Ok(());
    }

    // Extract action, guild, duration from slash options OR prefix args
    let (action, guild_str, duration_str) = match cmd {
        crate::commands::context::CommandContext::Slash(slash) => {
            let options = slash.data.options();
            let action = options.iter()
                .find(|o| o.name == "action")
                .and_then(|o| if let serenity::model::application::ResolvedValue::String(s) = &o.value { Some(*s) } else { None })
                .unwrap_or("");
            let guild = options.iter()
                .find(|o| o.name == "guild")
                .and_then(|o| if let serenity::model::application::ResolvedValue::String(s) = &o.value { Some(*s) } else { None })
                .unwrap_or("");
            let dur = options.iter()
                .find(|o| o.name == "duration")
                .and_then(|o| if let serenity::model::application::ResolvedValue::String(s) = &o.value { Some(*s) } else { None })
                .unwrap_or("");
            (action.to_string(), guild.to_string(), dur.to_string())
        }
        crate::commands::context::CommandContext::Prefix(_) => {
            if args.is_empty() {
                let card = build_error_card("Usage: `premium <add|remove> <guild_id> [duration]`\nExample: `premium add 12345 30d` or `premium add 12345 lifetime`");
                cmd.respond(ctx, &card).await?;
                return Ok(());
            }
            let action = args[0].to_string();
            let guild = args.get(1).copied().unwrap_or("").to_string();
            let dur = args.get(2).copied().unwrap_or("").to_string();
            (action, guild, dur)
        }
    };

    if action.is_empty() || guild_str.is_empty() {
        let card = build_error_card("Usage: `/premium add <guild_id> <duration>` or `/premium remove <guild_id>`");
        cmd.respond(ctx, &card).await?;
        return Ok(());
    }

    let action = action.to_lowercase();

    if action == "add" {
        let guild_id: u64 = match guild_str.parse() {
            Ok(id) => id,
            Err(_) => {
                let card = build_error_card("Invalid Guild ID.");
                cmd.respond(ctx, &card).await?;
                return Ok(());
            }
        };

        // Allow empty duration to mean "lifetime"
        let dur_input = if duration_str.trim().is_empty() { "lifetime" } else { duration_str.trim() };
        let duration_secs = match parse_duration(dur_input) {
            Some(d) => d,
            None => {
                let card = build_error_card("Invalid duration format. Use `lifetime`, `30d`, `1y`, etc.");
                cmd.respond(ctx, &card).await?;
                return Ok(());
            }
        };

        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let expiration = if duration_secs == 0 { 0 } else { now + duration_secs };

        {
            let state_read = state.read().await;
            let mut db = state_read.db.write().await;
            db.premium_guilds.insert(guild_id, expiration);
            db.save();
        }

        let time_str = if duration_secs == 0 {
            "lifetime".to_string()
        } else {
            format!("<t:{}:R>", expiration)
        };

        let card = build_success_card(&format!("{} Granted premium to Guild `{}` until {}", E::STAR, guild_id, time_str));
        cmd.respond(ctx, &card).await?;
        
    } else if action == "remove" {
        let guild_id: u64 = match guild_str.parse() {
            Ok(id) => id,
            Err(_) => {
                let card = build_error_card("Invalid Guild ID.");
                cmd.respond(ctx, &card).await?;
                return Ok(());
            }
        };

        {
            let state_read = state.read().await;
            let mut db = state_read.db.write().await;
            db.premium_guilds.remove(&guild_id);
            // Also disable 24/7 if they had it on
            db.twenty_four_seven.remove(&guild_id);
            db.save();
        }

        let card = build_success_card(&format!("{} Removed premium from Guild `{}` (and disabled 24/7 if active).", E::ERROR, guild_id));
        cmd.respond(ctx, &card).await?;
    } else {
        let card = build_error_card("Invalid action. Use `add` or `remove`.");
        cmd.respond(ctx, &card).await?;
    }

    Ok(())
}
