# Review input — этап 0 «Каркас Express»

## Цель этапа

Создать каркас Express 5, сохранить текущее поведение legacy-сайта (URL, booking API, схема БД, 308-редиректы) и подготовить инфраструктуру для следующих этапов. SEO-маршруты, canonical, sitemap и robots не добавлялись.

Спецификация этапа передана в чате; отдельного файла спецификации в репозитории нет.

## Изменённые файлы

Созданы:

- `package.json`, `package-lock.json`
- `.github/workflows/ci.yml`
- `AGENTS.md`
- `src/config.js`
- `src/app.js`
- `src/server.js`
- `src/booking/booking-db.js`
- `src/booking/schedule.js`
- `src/routes/booking.routes.js`
- `src/routes/static.routes.js`
- `src/views/error.pug`
- `tests/unit/config.test.js`
- `tests/unit/booking-db.test.js`
- `tests/integration/server.test.js`
- `docs/stage-reports/00-bootstrap.md`

Изменены:

- `.gitignore` — добавлены `node_modules/`, `.tmp/`, `test-results/`, `playwright-report/`.
- `README.md` — npm-команды, переменные окружения, структура входа.
- `server.mjs` — заменён на `import './src/server.js'`.

Перемещён:

- `katalog/catalog.test.mjs` → `tests/integration/legacy.test.js` (spawn переключён на `src/server.js`, добавлена проверка 409 на повторный слот).

## git diff --stat

```text
 .gitignore               |   4 +
 README.md                |  43 ++++++++-
 katalog/catalog.test.mjs |  96 -------------------
 server.mjs               | 239 +----------------------------------------------
 4 files changed, 45 insertions(+), 337 deletions(-)
```

Новые файлы не входят в `git diff --stat`, пока не добавлены в индекс. Полный список untracked:

```text
.github/workflows/ci.yml
AGENTS.md
package-lock.json
package.json
src/app.js
src/booking/booking-db.js
src/booking/schedule.js
src/config.js
src/routes/booking.routes.js
src/routes/static.routes.js
src/server.js
src/views/error.pug
tests/integration/legacy.test.js
tests/integration/server.test.js
tests/unit/config.test.js
tests/unit/booking-db.test.js
docs/stage-reports/00-bootstrap.md
docs/reviews/00-review-input.md
```

## Проверка npm test

На Node.js 26.13.1 прошли все 12 тестов. Интеграционные тесты отправляют HTTP-запросы на запущенный локальный сервер и проверяют gzip-отказ с 400, HEAD с 404, границу CORS и ссылку на главную в HTML-ответе 404.

## Живые проверки

Запуск `PORT=3123 node src/server.js`:

```text
GET  /api/availability               200
POST /api/bookings (новый слот)      201
POST /api/bookings (тот же слот)     409
POST /api/bookings (text/plain)      415
GET  /                                200
GET  /zapis-na-shinomontazh/          200
GET  /katalog/shiny/                  200
GET  /.data/catalog.sqlite            404
GET  /package.json                    404
GET  /src/config.js                   404
```

Заголовки `/`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Content-Type: text/html; charset=utf-8`.

`npm start` на `PORT=3124` стартовал, `/api/availability` → 200. `node server.mjs` на `PORT=3125` стартовал, `/` → 200. Временная заявка, созданная при ручной проверке, удалена из `.data/bookings.sqlite`.

## Решения

- Booking API вынесен без изменения алгоритма: те же поля, лимиты, regex, порядок проверок, коды, тексты ошибок, идемпотентность и `ON CONFLICT DO NOTHING`.
- Схема `bookings` и PRAGMA перенесены дословно.
- Статика не использует `express.static`: строится таблица разрешённых файлов из явного allowlist, поэтому `.data`, `src`, `tests`, `migrations`, `package.json`, `.git`, `node_modules` недостижимы по построению.
- 308-редиректы повторяют legacy, включая сохранение query.
- CORS применяется к путям с префиксом `/api/`. Для `OPTIONS /api/bookings` возвращается 204, для `OPTIONS /api` возвращается 404. Чужой Origin получает 403, same-site Origin пропускается без `Access-Control-Allow-Origin`.
- Ошибки парсинга JSON, включая отказ от распаковки gzip, преобразуются в 400.
- Pug используется для HTML-страницы ошибки; для `/api/*` ошибки остаются JSON.
- `publicOrigin` проверяется строго; в production обязателен явный HTTPS-origin.

## Сомнения и вопросы к SOL

1. Проверить, что `HEAD /api/availability` возвращает 404 без расчёта расписания.
2. Для не-API 404/500 теперь HTML (требование этапа), в legacy был JSON. Подтвердить, что это ожидаемое изменение.
3. `BOOKING_WEB_ORIGIN` теперь валидируется как origin и падает на старте при пути/слеше. Раньше такое значение просто не совпадало бы. Достаточно ли явной ошибки?
4. Таблица статики собирается при создании приложения; новые файлы требуют перезапуска. Это осознанно повторяет legacy-поведение.
5. `PUBLIC_ORIGIN` по умолчанию всегда `http://127.0.0.1:3000`, даже если `PORT` другой; в лог пишется фактический порт. Нужно ли на этапе canonical выводить default из `HOST`/`PORT`?
6. Полной спецификации нет в файлах — только текст этапа в чате. Если у SOL есть отдельный документ, сверить пункты с ним.

## Что проверить SOL

- Паритет booking API: статусы 200/201/400/409/415, валидация, идемпотентность `requestId`, CORS, отсутствие изменений схемы `bookings.sqlite`.
- Живость URL: `/`, `/zapis-na-shinomontazh/`, `/katalog/shiny/`, `/katalog/diski/`, картинки, `/katalog/data.json`, 308-редиректы.
- Закрытость статики: 404 для `.data`, `src`, `tests`, `migrations`, `package.json`, `.git`, `node_modules`.
- Конфигурация: запрет пути/query/hash/слеша, production-требования, дефолтные пути БД.
- Express 5-корректность: отсутствие `app.get('*')`, strict/case-sensitive routing, error middleware.
- Качество тестов: реально ли они запускают сервер и проверяют регрессии, нет ли ложноположительных проверок.
- Отсутствие SEO-маршрутов и изменений `katalog/data.json` / таблицы `catalog_snapshot`.

## Статус

Изменения не коммичены и не запушены. Этап 1 не начат. Самооценка пройдена; финальная подпись — за SOL.
