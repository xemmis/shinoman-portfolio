import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { openBookingDb } from '../../src/booking/booking-db.js';
import { loadConfig } from '../../src/config.js';
import { createApp } from '../../src/app.js';

const allowedOrigin = 'https://shop.example';

async function launch(context) {
  const directory = mkdtempSync(join(tmpdir(), 'shinoman-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '0',
    BOOKING_DB_PATH: join(directory, 'bookings.sqlite'),
    CATALOG_DB_PATH: join(directory, 'catalog.sqlite'),
    BOOKING_WEB_ORIGIN: allowedOrigin,
  });
  const bookingDb = openBookingDb(config.bookingDbPath);
  const app = createApp({ config, bookingDb });
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  context.after(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
    bookingDb.close();
    app.locals.catalog.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return base;
}

function postBooking(base, body, contentType = 'application/json') {
  return fetch(`${base}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('legacy pages, assets and redirects stay available', async (context) => {
  const base = await launch(context);

  const pages = [
    '/', '/index.html', '/styles.css', '/app.js', '/assets/shinoman-logo.png',
    '/zapis-na-shinomontazh/', '/zapis-na-shinomontazh/booking.js',
    '/katalog/shiny/', '/katalog/shiny/index.html', '/katalog/diski/',
    '/katalog/catalog.css', '/katalog/catalog-page.mjs', '/katalog/catalog-model.mjs',
    '/katalog/images/catalog-wheel.svg',
  ];
  for (const path of pages) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer', path);
    await response.arrayBuffer();
  }
  assert.match((await fetch(base + '/')).headers.get('content-type'), /^text\/html; charset=utf-8$/);
  assert.equal((await fetch(base + '/', { method: 'HEAD' })).status, 200);

  const redirects = [
    ['/katalog', '/katalog/shiny/'],
    ['/katalog/', '/katalog/shiny/'],
    ['/katalog?season=winter', '/katalog/shiny/?season=winter'],
    ['/katalog/shiny', '/katalog/shiny/'],
    ['/katalog/diski?x=1', '/katalog/diski/?x=1'],
    ['/zapis-na-shinomontazh', '/zapis-na-shinomontazh/'],
  ];
  for (const [from, to] of redirects) {
    const response = await fetch(base + from, { redirect: 'manual' });
    assert.equal(response.status, 308, from);
    assert.equal(response.headers.get('location'), to, from);
    await response.arrayBuffer();
  }

  const data = await fetch(base + '/katalog/data.json');
  assert.equal(data.status, 200);
  assert.match(data.headers.get('content-type'), /^application\/json; charset=utf-8$/);
  assert.equal(data.headers.get('cache-control'), 'no-store');
  assert.ok((await data.json()).items.length > 0);

  const forbidden = [
    '/.data/catalog.sqlite', '/.data/bookings.sqlite', '/package.json', '/package-lock.json',
    '/src/config.js', '/src/app.js', '/server.mjs', '/katalog/catalog-store.mjs',
    '/tests/integration/server.test.js', '/node_modules/express/package.json', '/.git/HEAD',
    '/migrations/001.sql', '/README.md', '/.gitignore',
  ];
  for (const path of forbidden) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path);
    assert.match(response.headers.get('content-type'), /^text\/html; charset=utf-8$/, path);
    await response.arrayBuffer();
  }

  const page404 = await fetch(base + '/missing-page');
  assert.equal(page404.status, 404);
  const errorPage = await page404.text();
  assert.match(errorPage, /Страница не найдена/);
  assert.match(errorPage, /<a href="\/">На главную<\/a>/);

  const api404 = await fetch(base + '/api/missing');
  assert.equal(api404.status, 404);
  assert.match(api404.headers.get('content-type'), /^application\/json/);
  assert.deepEqual(await api404.json(), { error: 'Адрес API не найден.' });
});

test('booking API only serves availability on GET and applies CORS below /api/', async (context) => {
  const base = await launch(context);

  const head = await fetch(base + '/api/availability', { method: 'HEAD' });
  const apiRoot = await fetch(base + '/api?test=1', { method: 'OPTIONS', headers: { Origin: allowedOrigin } });
  const apiPrefix = await fetch(base + '/api/', { method: 'OPTIONS', headers: { Origin: allowedOrigin } });

  assert.deepEqual({ head: head.status, apiRoot: apiRoot.status, apiPrefix: apiPrefix.status }, {
    head: 404, apiRoot: 404, apiPrefix: 204,
  });
  assert.equal(apiRoot.headers.get('vary'), null);
  assert.equal(apiRoot.headers.get('access-control-allow-origin'), null);
  assert.equal(apiPrefix.headers.get('access-control-allow-origin'), allowedOrigin);
});

test('booking API keeps statuses, idempotency and CORS', async (context) => {
  const base = await launch(context);

  const availabilityResponse = await fetch(base + '/api/availability');
  assert.equal(availabilityResponse.status, 200);
  assert.equal(availabilityResponse.headers.get('cache-control'), 'no-store');
  const availability = await availabilityResponse.json();
  assert.equal(availability.location, 'magistral');
  assert.deepEqual(Object.keys(availability.locations), ['magistral', 'slobodskaya']);
  assert.equal(availability.days.length, 28);
  assert.ok(availability.days.every(({ slots }) => slots.length === 12));

  assert.equal((await fetch(base + '/api/availability?location=unknown')).status, 400);

  const allowed = await fetch(base + '/api/availability', { headers: { Origin: allowedOrigin } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), allowedOrigin);
  assert.equal(allowed.headers.get('vary'), 'Origin');
  await allowed.arrayBuffer();

  const foreign = await fetch(base + '/api/availability', { headers: { Origin: 'https://evil.example' } });
  assert.equal(foreign.status, 403);
  assert.deepEqual(await foreign.json(), { error: 'Источник запроса не разрешён.' });

  const sameSite = await fetch(base + '/api/availability', { headers: { Origin: base } });
  assert.equal(sameSite.status, 200);
  assert.equal(sameSite.headers.get('access-control-allow-origin'), null);
  await sameSite.arrayBuffer();

  const preflight = await fetch(base + '/api/bookings', { method: 'OPTIONS', headers: { Origin: allowedOrigin } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
  assert.equal(preflight.headers.get('access-control-allow-headers'), 'Content-Type');

  const slot = availability.days
    .flatMap(({ date, slots }) => slots.map(({ time, status }) => ({ date, time, status })))
    .find(({ status }) => status === 'available');
  assert.ok(slot, 'в расписании есть свободный слот');

  const booking = {
    requestId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    location: availability.location,
    date: slot.date,
    time: slot.time,
    name: 'Тест',
    phone: '+375291234567',
    car: 'Demo',
    plate: 'TEST',
  };

  assert.equal((await postBooking(base, booking, 'text/plain')).status, 415);
  assert.equal((await postBooking(base, '{')).status, 400);
  assert.equal((await postBooking(base, {})).status, 400);
  assert.equal((await postBooking(base, { ...booking, name: 'x'.repeat(5000) })).status, 400);
  assert.equal((await postBooking(base, { ...booking, phone: 'abc' })).status, 400);
  assert.equal((await postBooking(base, { ...booking, date: '2000-01-01' })).status, 400);

  const compressed = await fetch(base + '/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
    body: gzipSync(JSON.stringify(booking)),
  });
  assert.equal(compressed.status, 400);

  const created = await postBooking(base, booking);
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { saved: true });

  const repeated = await postBooking(base, booking);
  assert.equal(repeated.status, 200);
  assert.deepEqual(await repeated.json(), { saved: true });

  const conflict = await postBooking(base, { ...booking, requestId: '00000000-0000-4000-8000-000000000001' });
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: 'Это время уже занято. Закройте форму и выберите другой час.' });

  const updated = await fetch(base + '/api/availability').then((response) => response.json());
  const bookedSlot = updated.days.find(({ date }) => date === slot.date).slots.find(({ time }) => time === slot.time);
  assert.equal(bookedSlot.status, 'booked');
});
