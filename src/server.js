import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { openBookingDb } from './booking/booking-db.js';
import { createApp } from './app.js';

const config = loadConfig();
const bookingDb = openBookingDb(config.bookingDbPath);
const app = createApp({ config, bookingDb });
const server = createServer({ requestTimeout: 15000 }, app);

server.listen(config.port, config.host, () => {
  const { port } = server.address();
  console.log(`Шиноман: http://${config.host}:${port}/`);
});

let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (closing) return;
    closing = true;
    server.close(() => {
      bookingDb.close();
      app.locals.catalog.close();
    });
    server.closeIdleConnections();
  });
}
