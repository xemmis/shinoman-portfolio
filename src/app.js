import express from 'express';
import { fileURLToPath } from 'node:url';
import { openCatalog } from '../katalog/catalog-store.mjs';
import { createBookingRouter } from './routes/booking.routes.js';
import { createStaticRouter } from './routes/static.routes.js';

const views = fileURLToPath(new URL('./views', import.meta.url));

function isApiRequest(request) {
  return request.path === '/api' || request.path.startsWith('/api/');
}

function sendJson(response, status, payload) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).json(payload);
}

function sendErrorPage(response, status, message) {
  response.status(status).render('error', { status, message }, (error, html) => {
    if (error) {
      response.type('text/plain').send(String(status));
      return;
    }
    response.type('html').send(html);
  });
}

export function createApp({ config, bookingDb, catalog = openCatalog(config.catalogDbPath) }) {
  const app = express();

  app.disable('x-powered-by');
  app.set('view engine', 'pug');
  app.set('views', views);
  app.set('strict routing', true);
  app.set('case sensitive routing', true);

  app.use((request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.use(/^\/api(?=\/)/, createBookingRouter({ config, bookingDb }));
  app.use(createStaticRouter({ catalog }));

  app.use((request, response) => {
    if (isApiRequest(request)) {
      return sendJson(response, 404, { error: 'Адрес API не найден.' });
    }
    sendErrorPage(response, 404, 'Страница не найдена.');
  });

  app.use((error, request, response, next) => {
    console.error('HTTP error:', error.code || error.name);
    if (response.headersSent || response.destroyed) return next(error);
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
    if (isApiRequest(request)) {
      return sendJson(response, status, { error: 'Сервис записи временно недоступен.' });
    }
    sendErrorPage(response, status, status === 500 ? 'Сервис временно недоступен.' : 'Запрос не может быть обработан.');
  });

  app.locals.catalog = catalog;

  return app;
}
