# Этап 0 — каркас Express

## Цель

Перевести legacy-сайт на каркас Express 5, сохранив текущие URL, статусы booking API и схему `bookings.sqlite`, и подготовить инфраструктуру для следующих этапов. SEO-маршруты не добавлялись.

## Что сделано

- `package.json`: ESM, `engines.node: ">=26 <27"`, скрипты `start`, `dev`, `test`; зависимости `express@^5.3.0`, `pug@^3.0.4`, зафиксирован `package-lock.json`.
- `.gitignore`: `node_modules/`, `.tmp/`, `test-results/`, `playwright-report/` (`.data/` сохранён).
- `src/config.js`: `loadConfig(env)` с `host`, `port`, `publicOrigin`, `bookingDbPath`, `catalogDbPath`, `bookingWebOrigin`, `nodeEnv`; проверка origin (без пути/query/hash/слеша), production требует явный HTTPS `PUBLIC_ORIGIN`.
- `src/booking/booking-db.js`: открытие `bookings.sqlite`, `busy_timeout`, WAL и исходная схема таблицы без изменений.
- `src/booking/schedule.js`: адреса, часы, горизонт 28 дней, минское время и построение расписания.
- `src/routes/booking.routes.js`: `GET /api/availability`, `POST /api/bookings`; сохранены валидация, коды 200/201/400/409/415, идемпотентность `requestId`, CORS-поведение `BOOKING_WEB_ORIGIN`, `Cache-Control: no-store`.
- `src/routes/static.routes.js`: явный allowlist файлов/каталогов, динамический `/katalog/data.json`, 308-редиректы `/katalog`, `/katalog/shiny`, `/katalog/diski`, `/zapis-na-shinomontazh`.
- `src/app.js`: Express 5, Pug, strict/case-sensitive routing, `nosniff`, `no-referrer`, HTML-страница ошибки, JSON-ошибки для `/api/*`.
- `src/server.js`: `http.createServer({ requestTimeout: 15000 }, app)`, запуск на `HOST:PORT`, корректное закрытие БД по SIGINT/SIGTERM.
- `server.mjs`: тонкий wrapper `import './src/server.js'`.
- `tests/integration/legacy.test.js`: перенос `katalog/catalog.test.mjs` со spawn `src/server.js`; добавлена проверка повторной заявки на тот же слот (409).
- Новые тесты: `tests/unit/config.test.js`, `tests/unit/booking-db.test.js`, `tests/integration/server.test.js`.
- `AGENTS.md`, `.github/workflows/ci.yml`, обновлён `README.md`.

## Проверки

`npm test` — 12 тестов, 12 pass, 0 fail на Node.js 26.13.1.

Живые проверки на запущенном сервере:

| Запрос | Результат |
| --- | --- |
| `GET /api/availability` | 200 |
| `POST /api/bookings` (новый слот) | 201 |
| `POST /api/bookings` (тот же слот, другой `requestId`) | 409 |
| `POST /api/bookings` с `Content-Type: text/plain` | 415 |
| `GET /` | 200 |
| `GET /zapis-na-shinomontazh/` | 200 |
| `GET /katalog/shiny/` | 200 |
| `GET /.data/catalog.sqlite` | 404 |
| `GET /package.json` | 404 |
| `GET /src/config.js` | 404 |
| `npm start` | сервер стартует, `/api/availability` → 200 |
| `node server.mjs` | wrapper работает, `/` → 200 |

Тестовые заявки в `.data/bookings.sqlite` после ручной проверки удалены.

## Решения и сомнения

- Статический allowlist реализован как таблица файлов, собранная при создании приложения. Служебные каталоги не попадают в неё по построению; новые файлы требуют перезапуска (как и в legacy-сервере).
- `BOOKING_WEB_ORIGIN` теперь валидируется как origin; значение со слешем вызовет ошибку старта вместо молчаливого несовпадения CORS.
- Битый или превышающий 4 КБ JSON возвращает 400, как раньше, а не 413 от body-parser.
- Парсер заявок отклоняет gzip-тело с 400. Обычная заявка на тот же слот после отказа создаётся с 201.
- Явный маршрут `HEAD /api/availability` возвращает 404. CORS применяется к путям с префиксом `/api/`, поэтому `OPTIONS /api` возвращает 404, а `OPTIONS /api/bookings` возвращает 204.
- HTML-страница 404 содержит ссылку «На главную» на `/`.
- Отклонение по требованию этапа: 404/500 для не-API путей отдаются HTML, в legacy-сервере это был JSON.
- `publicOrigin` по умолчанию фиксирован на `http://127.0.0.1:3000`; при `PORT=0` в лог пишется фактический порт. Это нужно учесть при генерации canonical на следующих этапах.

## Следующий этап

Не начат.
