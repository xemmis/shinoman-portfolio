import express, { Router } from 'express';
import { bookingDates, buildSchedule, HOURS, LOCATIONS, minskNow } from '../booking/schedule.js';

const fieldLimits = { location: 30, date: 10, time: 5, name: 80, phone: 35, car: 80, plate: 24 };
const jsonBody = express.json({ limit: '4kb', inflate: false });

function sendJson(response, status, payload) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).json(payload);
}

function readBookingJson(request, response, next) {
  const contentType = request.headers['content-type']?.split(';')[0].trim();
  if (contentType !== 'application/json') {
    return sendJson(response, 415, { error: 'Форма должна быть отправлена в формате JSON.' });
  }
  jsonBody(request, response, (error) => {
    if (error) {
      // Ошибки чтения JSON преобразуются в legacy-ответ 400 при проверке полей.
      request.body = null;
    }
    next();
  });
}

export function createBookingRouter({ config, bookingDb }) {
  const router = Router({ strict: true, caseSensitive: true });

  router.use((request, response, next) => {
    const origin = request.headers.origin;
    const sameSite = origin && [`https://${request.headers.host}`, `http://${request.headers.host}`].includes(origin);
    response.setHeader('Vary', 'Origin');
    if (origin && origin === config.bookingWebOrigin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    } else if (origin && !sameSite) {
      return sendJson(response, 403, { error: 'Источник запроса не разрешён.' });
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      return response.end();
    }
    next();
  });

  router.head('/availability', (request, response, next) => next('router'));

  router.get('/availability', (request, response) => {
    const requested = request.query.location;
    const location = (Array.isArray(requested) ? requested[0] : requested) ?? Object.keys(LOCATIONS)[0];
    if (!Object.hasOwn(LOCATIONS, location)) {
      return sendJson(response, 400, { error: 'Неизвестный адрес.' });
    }
    return sendJson(response, 200, buildSchedule(bookingDb, location));
  });

  router.post('/bookings', readBookingJson, (request, response) => {
    const input = request.body;
    const booking = {};
    for (const [key, maxLength] of Object.entries(fieldLimits)) {
      const value = typeof input?.[key] === 'string' ? input[key].trim() : '';
      if (!value || value.length > maxLength || /[\u0000-\u001f\u007f]/u.test(value)) {
        return sendJson(response, 400, { error: 'Проверьте, что все поля заполнены.' });
      }
      booking[key] = value;
    }

    const requestId = input.requestId;
    if (typeof requestId !== 'string' || !/^[\da-f-]{36}$/i.test(requestId)) {
      return sendJson(response, 400, { error: 'Обновите страницу и откройте форму снова.' });
    }

    const { location, date, time, name, phone, car, plate } = booking;
    if (!/^\+?[\d ()-]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g, ''))) {
      return sendJson(response, 400, { error: 'Введите корректный номер телефона.' });
    }

    const existing = bookingDb.findRequest.get(requestId);
    if (existing && Object.keys(fieldLimits).every((key) => booking[key] === existing[key])) {
      return sendJson(response, 200, { saved: true });
    }

    const now = minskNow();
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && bookingDates(now).includes(date);
    if (!Object.hasOwn(LOCATIONS, location) || !validDate || !HOURS.includes(time)) {
      return sendJson(response, 400, { error: 'Выберите адрес, дату и время из расписания.' });
    }
    if (date === now.date && time <= now.time) {
      return sendJson(response, 409, { error: 'Это время уже прошло. Выберите другой час.' });
    }

    const result = bookingDb.save.run(requestId, location, date, time, name, phone, car, plate);
    if (!result.changes) {
      return sendJson(response, 409, { error: 'Это время уже занято. Закройте форму и выберите другой час.' });
    }
    return sendJson(response, 201, { saved: true });
  });

  router.use((request, response) => {
    sendJson(response, 404, { error: 'Адрес API не найден.' });
  });

  return router;
}
