import { Client } from 'seyfert';
import { loadConfig } from './config';
import { initAppState, appState } from './state';
import { initLavalink } from './music/manager';
import { setClient } from './client';
import { initLogging, logger, printClaudeBanner } from './logging';

import { errorCard } from './cards/common';

const log = logger('boot');

// Patch Seyfert's HandleCommand to support natural positional arguments for Discord prefix commands
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { HandleCommand } = require('seyfert/lib/commands/handle');
  if (HandleCommand && HandleCommand.prototype) {
    HandleCommand.prototype.argsParser = function (content: string, command: any): Record<string, string> {
      const args: Record<string, string> = {};
      if (!content || !content.trim()) return args;

      // 1. Support CLI-style flags if user typed -flag value
      const flagMatches = content.match(/-(.*?)(?=\s-|$)/gs);
      if (flagMatches && flagMatches.length > 0) {
        for (const i of flagMatches) {
          const parts = i.slice(1).trim().split(/\s+/);
          const key = parts[0];
          const val = parts.slice(1).join(' ');
          if (key) args[key] = val;
        }
        return args;
      }

      // 2. Positional argument parsing matching command options
      const options = command?.options ?? [];
      if (!options || options.length === 0) return args;

      if (options.length === 1) {
        args[options[0].name] = content.trim();
        return args;
      }

      const tokens = content.trim().split(/\s+/);
      for (let i = 0; i < options.length; i++) {
        if (i >= tokens.length) break;
        if (i === options.length - 1) {
          args[options[i].name] = tokens.slice(i).join(' ');
        } else {
          args[options[i].name] = tokens[i];
        }
      }
      return args;
    };
  }
} catch (e) {
  log.warn('Failed to configure custom argsParser:', e);
}

async function boot() {
  const config = loadConfig();
  initLogging(config.logging);
  printClaudeBanner(config.bot.name);

  initAppState(config);

  const client = new Client({
    allowedMentions: { replied_user: false },
    commands: {
      defaults: {
        onOptionsError(context, metadata) {
          const missing = Object.keys(metadata).join(', ');
          const state = appState();
          context.editOrReply(
            errorCard(`Missing or invalid option: **${missing}**\nUse \`${state.config.bot.prefix}help ${context.command.name}\` for usage details.`).toMessage()
          ).catch(() => {});
        },
        onRunError(context, error) {
          log.error(`Command ${context.command.name} error:`, error);
          context.editOrReply(
            errorCard(`An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`).toMessage()
          ).catch(() => {});
        },
      },
      prefix: (message) => {
        const state = appState();
        const prefixes: string[] = [];

        if (message.guildId) {
          const custom = state.db.guildPrefixes.get(message.guildId);
          if (custom) prefixes.push(custom);
        }
        prefixes.push(state.config.bot.prefix);

        if (client.botId) {
          prefixes.push(`<@${client.botId}> `, `<@!${client.botId}> `);
        }

        const noprefixExpiry = state.db.noprefix.get(message.author.id);
        if (noprefixExpiry !== undefined) {
          if (noprefixExpiry === 0 || noprefixExpiry > Math.floor(Date.now() / 1000)) {
            prefixes.push('');
          }
        }

        return prefixes;
      }
    }
  });
  setClient(client);

  const manager = initLavalink(client, config);

  await client.start();

  try {
    log.info('Syncing slash commands to Discord...');
    await client.uploadCommands();
    log.info('Slash commands synced successfully.');
  } catch (err) {
    log.warn('Failed to upload slash commands:', err);
  }
  
  log.info('Fade is online.');
}

boot().catch(err => {
  log.fatal('Fatal boot error:', err);
  process.exit(1);
});
