import { Client } from 'seyfert';
import { loadConfig } from './config';
import { initAppState, appState } from './state';
import { initLavalink, lavalink } from './music/manager';
import { setClient } from './client';
import { initLogging, logger, printClaudeBanner } from './logging';

import { errorCard } from './cards/common';

const log = logger('boot');

// Global unhandled error guards so temporary network drops or Lavalink hiccups never kill the bot process
process.on('unhandledRejection', (reason: any) => {
  log.error('Unhandled Rejection:', reason?.stack || reason?.message || reason);
});

process.on('uncaughtException', (err: Error) => {
  log.error('Uncaught Exception:', err.stack || err.message);
});

async function boot() {
  const config = loadConfig();
  initLogging(config.logging);
  printClaudeBanner(config.bot.name);

  initAppState(config);

  const client = new Client({
    allowedMentions: { replied_user: false },
    handlePayload: async (_shardId, packet) => {
      try {
        void lavalink()
          .sendRawData(packet as any)
          .catch(() => {});
      } catch {}
    },
    commands: {
      defaults: {
        onOptionsError(context, metadata) {
          const missing = Object.keys(metadata).join(', ');
          const state = appState();
          context
            .editOrReply(
              errorCard(
                `Missing or invalid option: **${missing}**\nTry \`/utility help\` for usage details.`,
              ).toMessage(),
            )
            .catch(() => {});
        },
        onRunError(context, error) {
          log.error(`Command ${context.command.name} error:`, error);
          context
            .editOrReply(
              errorCard(
                `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`,
              ).toMessage(),
            )
            .catch(() => {});
        },
      },
      // Slash-command-only bot: no prefix handling. Type `/<command>` instead.
    },
  });
  setClient(client);

  initLavalink(client, config);

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

boot().catch((err) => {
  log.fatal('Fatal boot error:', err);
  process.exit(1);
});
