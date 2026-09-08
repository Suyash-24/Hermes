import { createEvent } from 'seyfert';
import { lavalink } from '../music/manager';

export default createEvent({
  data: { name: 'raw' },
  run(packet: any) {
    try {
      void lavalink().sendRawData(packet).catch(() => {});
    } catch {}
  }
});
