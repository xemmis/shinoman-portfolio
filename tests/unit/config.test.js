import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config.js';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

test('defaults describe the local development server', () => {
  const config = loadConfig({});
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3000);
  assert.equal(config.publicOrigin, 'http://127.0.0.1:3000');
  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.bookingWebOrigin, undefined);
  assert.equal(config.bookingDbPath, resolve(projectRoot, '.data/bookings.sqlite'));
  assert.equal(config.catalogDbPath, resolve(projectRoot, '.data/catalog.sqlite'));
});

test('environment overrides are applied', () => {
  const bookingDbPath = resolve('/tmp/shinoman/bookings.sqlite');
  const config = loadConfig({
    NODE_ENV: 'test',
    HOST: '0.0.0.0',
    PORT: '8080',
    PUBLIC_ORIGIN: 'https://shinoman.example',
    BOOKING_DB_PATH: bookingDbPath,
    CATALOG_DB_PATH: '/tmp/shinoman/catalog.sqlite',
    BOOKING_WEB_ORIGIN: 'https://shop.example',
  });
  assert.equal(config.nodeEnv, 'test');
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 8080);
  assert.equal(config.publicOrigin, 'https://shinoman.example');
  assert.equal(config.bookingDbPath, bookingDbPath);
  assert.equal(config.catalogDbPath, resolve('/tmp/shinoman/catalog.sqlite'));
  assert.equal(config.bookingWebOrigin, 'https://shop.example');
});

test('public origin may not contain a path, query, hash or trailing slash', () => {
  for (const publicOrigin of [
    'https://shinoman.example/',
    'https://shinoman.example/katalog',
    'https://shinoman.example?utm=1',
    'https://shinoman.example#top',
    'https://user:pass@shinoman.example',
  ]) {
    assert.throws(() => loadConfig({ PUBLIC_ORIGIN: publicOrigin }), /PUBLIC_ORIGIN/, publicOrigin);
  }
});

test('production requires an explicit https public origin', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /PUBLIC_ORIGIN/);
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'http://shinoman.example' }),
    /https/,
  );
  assert.equal(
    loadConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://shinoman.example' }).publicOrigin,
    'https://shinoman.example',
  );
});

test('port must be an integer between 0 and 65535', () => {
  assert.equal(loadConfig({ PORT: '0' }).port, 0);
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT/);
  assert.throws(() => loadConfig({ PORT: '-1' }), /PORT/);
  assert.throws(() => loadConfig({ PORT: '65536' }), /PORT/);
});
