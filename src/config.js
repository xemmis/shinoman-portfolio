import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const defaultPublicOrigin = 'http://127.0.0.1:3000';

function parsePort(value) {
  if (!/^\d+$/.test(value)) {
    throw new Error('PORT должен быть целым числом от 0 до 65535.');
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port > 65535) {
    throw new Error('PORT должен быть целым числом от 0 до 65535.');
  }
  return port;
}

function parseOrigin(value, { name = 'PUBLIC_ORIGIN', requireHttps = false } = {}) {
  if (typeof value !== 'string' || value.trim() !== value || value === '') {
    throw new Error(`${name} должен быть абсолютным URL вида https://example.com.`);
  }
  if (value.endsWith('/')) {
    throw new Error(`${name} не должен заканчиваться слешем.`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} должен быть абсолютным URL вида https://example.com.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} должен использовать протокол http или https.`);
  }
  if (url.username || url.password) {
    throw new Error(`${name} не должен содержать логин или пароль.`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} не должен содержать путь, query или hash.`);
  }
  if (url.origin !== value) {
    throw new Error(`${name} должен содержать только схему, хост и порт.`);
  }
  if (requireHttps && url.protocol !== 'https:') {
    throw new Error(`${name} в production должен использовать https.`);
  }
  return value;
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const production = nodeEnv === 'production';
  const explicitPublicOrigin = typeof env.PUBLIC_ORIGIN === 'string' && env.PUBLIC_ORIGIN !== '';

  if (production && !explicitPublicOrigin) {
    throw new Error('В production требуется явный PUBLIC_ORIGIN.');
  }

  return Object.freeze({
    host: env.HOST || '127.0.0.1',
    port: parsePort(env.PORT ?? '3000'),
    publicOrigin: parseOrigin(explicitPublicOrigin ? env.PUBLIC_ORIGIN : defaultPublicOrigin, {
      requireHttps: production,
    }),
    bookingDbPath: resolve(env.BOOKING_DB_PATH || resolve(projectRoot, '.data', 'bookings.sqlite')),
    catalogDbPath: resolve(env.CATALOG_DB_PATH || resolve(projectRoot, '.data', 'catalog.sqlite')),
    bookingWebOrigin: env.BOOKING_WEB_ORIGIN
      ? parseOrigin(env.BOOKING_WEB_ORIGIN, { name: 'BOOKING_WEB_ORIGIN' })
      : undefined,
    nodeEnv,
  });
}
