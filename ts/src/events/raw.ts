import { createEvent } from 'seyfert';
import { lavalink } from '../music/manager';

export default createEvent({
  data: { name: 'raw' },
  run(packet: any) {
    lavalink().sendRawData(packet);
  }
});
