import { createEvent } from 'seyfert';
import { lavalink } from '../music/manager';
import { logger } from '../logging';

const log = logger('boot');

export default createEvent({
  data: { name: 'botReady', once: true },
  async run(user, client) {
    log.info(`Logged in as ${user.username}#${user.discriminator} (${user.id})`);
    
    // Initialize Lavalink Manager using the bot user ID
    lavalink().init({
      id: user.id,
      username: user.username,
      displayName: user.username,
    });
  }
});
