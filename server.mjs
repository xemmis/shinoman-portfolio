import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = fileURLToPath(new URL('.', import.meta.url));
const locations = {
  magistral: 'Минск, ГСПК Магистраль-88 (ОМА Малиновка)',
  slobodskaya: 'Минск, ул. Слободская, 136',
};
const hours = Array.from({ length: 12 }, (_, index) => `${String(index + 8).padStart(2, '0')}:00`);
const horizon = 28;
const minskClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Minsk',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function minskNow() {
  const parts = Object.fromEntries(minskClock.formatToParts().map(({ type, value }) => [type, value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function addDays(date, days) {
  const target = new Date(`${date}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() + days);
  return target.toISOString().slice(0, 10);
}

const databasePath = resolve(process.env.BOOKING_DB_PATH || resolve(root, '.data', 'bookings.sqlite'));
mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA busy_timeout = 5000;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS bookings (
    request_id TEXT PRIMARY KEY NOT NULL,
    location TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    car TEXT NOT NULL,
    plate TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(location, date, time)
  ) STRICT;
`);

const reserved = db.prepare('SELECT date, time FROM bookings WHERE location = ? AND date BETWEEN ? AND ?');
const save = db.prepare(`
  INSERT INTO bookings (request_id, location, date, time, name, phone, car, plate)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT DO NOTHING
`);
const findRequest = db.prepare('SELECT location, date, time, name, phone, car, plate FROM bookings WHERE request_id = ?');

const staticFiles = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/assets/shinoman-logo.png', ['assets/shinoman-logo.png', 'image/png']],
  ['/assets/shinoman-logo-dark.png', ['assets/shinoman-logo-dark.png', 'image/png']],
  ['/zapis-na-shinomontazh/', ['zapis-na-shinomontazh/index.html', 'text/html']],
  ['/zapis-na-shinomontazh/index.html', ['zapis-na-shinomontazh/index.html', 'text/html']],
  ['/zapis-na-shinomontazh/booking.js', ['zapis-na-shinomontazh/booking.js', 'text/javascript']],
  ['/zapis-na-shinomontazh/booking.css', ['zapis-na-shinomontazh/booking.css', 'text/css']],
].map(([url, [path, type]]) => [url, { body: readFileSync(resolve(root, path)), type }]));

function json(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= 4096) chunks.push(chunk);
  }
  if (size > 4096) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

function schedule(response, location) {
  const now = minskNow();
  const bookings = new Set(reserved.all(location, now.date, addDays(now.date, horizon - 1))
    .map(({ date, time }) => `${date} ${time}`));
  const days = Array.from({ length: horizon }, (_, index) => {
    const date = addDays(now.date, index);
    const slots = hours.map((time) => {
      let status = 'available';
      if (bookings.has(`${date} ${time}`)) status = 'booked';
      else if (date === now.date && time <= now.time) status = 'unavailable';
      return { time, status };
    });
    return { date, slots };
  });
  json(response, 200, { location, locations, days });
}

async function book(request, response) {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    return json(response, 415, { error: 'Форма должна быть отправлена в формате JSON.' });
  }
  const fields = { location: 30, date: 10, time: 5, name: 80, phone: 35, car: 80, plate: 24 };
  const input = await readJson(request);
  const booking = {};
  for (const [key, maxLength] of Object.entries(fields)) {
    const value = typeof input?.[key] === 'string' ? input[key].trim() : '';
    if (!value || value.length > maxLength || /[\u0000-\u001f\u007f]/u.test(value)) {
      return json(response, 400, { error: 'Проверьте, что все поля заполнены.' });
    }
    booking[key] = value;
  }
  const requestId = input.requestId;
  if (typeof requestId !== 'string' || !/^[\da-f-]{36}$/i.test(requestId)) {
    return json(response, 400, { error: 'Обновите страницу и откройте форму снова.' });
  }
  const { location, date, time, name, phone, car, plate } = booking;
  if (!/^\+?[\d ()-]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g, ''))) {
    return json(response, 400, { error: 'Введите корректный номер телефона.' });
  }
  const existing = findRequest.get(requestId);
  if (existing && Object.keys(fields).every((key) => booking[key] === existing[key])) {
    return json(response, 200, { saved: true });
  }
  const now = minskNow();
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Array.from({ length: horizon }, (_, index) => addDays(now.date, index)).includes(date);
  if (!Object.hasOwn(locations, location) || !validDate || !hours.includes(time)) {
    return json(response, 400, { error: 'Выберите адрес, дату и время из расписания.' });
  }
  if (date === now.date && time <= now.time) {
    return json(response, 409, { error: 'Это время уже прошло. Выберите другой час.' });
  }
  const result = save.run(requestId, location, date, time, name, phone, car, plate);
  if (!result.changes) {
    return json(response, 409, { error: 'Это время уже занято. Закройте форму и выберите другой час.' });
  }
  return json(response, 201, { saved: true });
}

const webOrigin = process.env.BOOKING_WEB_ORIGIN;
const server = createServer({ requestTimeout: 15000 }, async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const url = new URL(request.url, 'http://localhost');
    const { pathname, searchParams } = url;
    if (pathname.startsWith('/api/')) {
      const origin = request.headers.origin;
      const sameSite = origin && [`https://${request.headers.host}`, `http://${request.headers.host}`].includes(origin);
      response.setHeader('Vary', 'Origin');
      if (origin && origin === webOrigin) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      } else if (origin && !sameSite) {
        return json(response, 403, { error: 'Источник запроса не разрешён.' });
      }
      if (request.method === 'OPTIONS') {
        response.writeHead(204);
        return response.end();
      }
      if (request.method === 'GET' && pathname === '/api/availability') {
        const location = searchParams.get('location') ?? Object.keys(locations)[0];
        if (!Object.hasOwn(locations, location)) return json(response, 400, { error: 'Неизвестный адрес.' });
        return schedule(response, location);
      }
      if (request.method === 'POST' && pathname === '/api/bookings') {
        return await book(request, response);
      }
      return json(response, 404, { error: 'Адрес API не найден.' });
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      if (pathname === '/zapis-na-shinomontazh') {
        response.writeHead(308, { Location: '/zapis-na-shinomontazh/' });
        return response.end();
      }
      const file = staticFiles.get(pathname);
      if (file) {
        const type = file.type.startsWith('text/') ? `${file.type}; charset=utf-8` : file.type;
        response.writeHead(200, { 'Content-Type': type });
        return response.end(file.body);
      }
    }
    return json(response, 404, { error: 'Страница не найдена.' });
  } catch (error) {
    console.error('Booking server error:', error.code || error.name);
    if (!response.headersSent && !response.destroyed) {
      return json(response, 500, { error: 'Сервис записи временно недоступен.' });
    }
    response.end();
  }
});

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);
server.listen(port, host, () => {
  console.log(`Шиноман: http://${host}:${server.address().port}/`);
});
