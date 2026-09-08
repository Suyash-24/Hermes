import { Client } from 'seyfert';
import { loadConfig } from './config';
import { initAppState, appState } from './state';
import { initLavalink } from './music/manager';
import { setClient } from './client';
import { logger } from './logging';

const log = logger('boot');

async function boot() {
  const config = loadConfig();
  log.info(`Booting Fade as ${config.bot.name}...`);

  initAppState(config);

  const client = new Client({
    commands: {
      prefix: (message) => {
        const state = appState();
        if (message.guildId) {
          const custom = state.db.guildPrefixes.get(message.guildId);
          if (custom) return [custom];
        }
        return [state.config.bot.prefix];
      }
    }
  });
  setClient(client);

  const manager = initLavalink(client, config);

  await client.start();
  
  log.info('Fade is online.');
}

boot().catch(err => {
  log.fatal('Fatal boot error:', err);
  process.exit(1);
});
