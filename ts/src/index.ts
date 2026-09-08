import { Client } from 'seyfert';
import { loadConfig } from './config';
import { initAppState, appState } from './state';
import { initLavalink } from './music/manager';
import { setClient } from './client';
import { logger } from './logging';

import { errorCard } from './cards/common';

const log = logger('boot');

async function boot() {
  const config = loadConfig();
  log.info(`Booting Fade as ${config.bot.name}...`);

  initAppState(config);

  const client = new Client({
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
