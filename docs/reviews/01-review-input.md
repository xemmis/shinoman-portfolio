# Review input — этап 1 «URL, фильтры, page-policy»

## Цель этапа

Заморозить URL-схему, нормализацию фильтров и правила статуса, canonical, robots и sitemap до подключения SQLite и HTTP-маршрутов. Этап должен дать чистые модули, которые Stage 2–4 используют без изменения контракта.

Спецификация `SEO-архитектура каталога шин и дисков.md` передана в чате. Stage 0 завершён и не переделывался.

## Изменённые файлы

Созданы только новые файлы:

| Файл | Строк |
| --- | ---: |
| `src/routes/urls.js` | 181 |
| `src/catalog/filters.js` | 269 |
| `src/seo/page-policy.js` | 563 |
| `tests/unit/urls.test.js` | 198 |
| `tests/unit/filters.test.js` | 243 |
| `tests/unit/page-policy.test.js` | 898 |
| `tests/unit/canonical.test.js` | 168 |
| `docs/stage-reports/01-url-policy.md` | — |
| `docs/reviews/01-review-input.md` | — |

Изменённых и удалённых файлов Stage 1 нет. `src/app.js`, `src/server.js`, booking API, статика, `package.json`, `package-lock.json` и зависимости не менялись.

## git diff --stat

```text
 .gitignore               |   4 +
 README.md                |  43 ++++++++-
 katalog/catalog.test.mjs |  96 -------------------
 server.mjs               | 239 +----------------------------------------------
 4 files changed, 45 insertions(+), 337 deletions(-)
```

Это остаток незакоммиченного Stage 0. Все файлы Stage 1 пока untracked и в `git diff --stat` не попадают. `git status --short`:

```text
 M .gitignore
 M README.md
 D katalog/catalog.test.mjs
 M server.mjs
?? .github/
?? AGENTS.md
?? docs/
?? package-lock.json
?? package.json
?? src/
?? tests/
```

## Проверка npm test

Node.js 26.13.1, `npm test` (`node --test tests/unit tests/integration`):

```text
ℹ tests 113
ℹ suites 0
ℹ pass 113
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 621.062
```

Новые тесты не поднимают HTTP-сервер и не открывают SQLite. Интеграционные тесты Stage 0 проходят без изменений.

После ревью проверены 404 для посадочной из другой категории, исключение исходных URL модели и категории с canonical на другой путь, одинаковое значение `sitemap: false` для второй страницы категории в обоих публичных методах и исключение посадочной с явным `?page=1`.

## Живые проверки

`PORT=3126 node src/server.js`:

```text
GET /                    200
GET /katalog/shiny/      200
GET /katalog/diski/      200
GET /api/availability    200
```

## Что реализовано

### `src/routes/urls.js`

- `SLUG_RE`, `CATEGORY_PATH_RE`, `PRODUCT_PATH_RE`, `VARIANT_PATH_RE`;
- `categoryPath`, `productPath`, `variantPath`, `skuQueryPath`, `landingPath`, `landingPagePath`, `catalogQueryPath`, `absoluteUrl`;
- `parseProductPath` различает модель и вариант, `parseCatalogPath` — категорию и посадочную;
- `FILTER_ORDER`, `SORT_VALUES`, `TRACKING_PARAMS`, `isTrackingParam`;
- порядок фильтров всегда `season`, `size`, `brand`; `page=1` не выводится; `sort` только при передаче; путь всегда начинается с `/`.

### `src/catalog/filters.js`

- `SEASONS`, `normalizeSeason`, `normalizeSize`, `normalizeBrand`, `formatSizeKey`;
- шины: `205/55 R16`, `205/55R16`, `205-55-r16` → `205-55-r16`;
- диски: `8J-18-5X112-ET45`, `8.0J-18-5x112-et45` → `8j-18-5x112-et45`;
- `buildFilterKey` и `parseFilterKey`;
- `parseCatalogQuery`: повторы `season`/`size`/`brand`/`page`/`sort` → 400; неизвестный ключ, кроме tracking → 400; `page` по `^[1-9]\d*$`; `sort` только `price`/`price-down`; словари `seasons`/`brands`/`sizes`/`categorySlug`; tracking отдельно и вне `filter_key`; идемпотентность на нормализованном URL.

### `src/seo/page-policy.js`

- `HTTP`, `ROBOTS`, `SITEMAP_MODES`;
- `validateCanonicalPath` и `resolveEntityCanonical`;
- `getVariantCanonical` и `getOfferUrl` для трёх состояний SKU;
- `resolveProductRequest` и `resolveVariantRequest` по матрице статусов;
- `resolveCatalogRequest` по матрице фильтров, сортировки, пагинации и посадочных;
- `getSitemapPath`, `getSitemapUrl`, `getRobotsPolicy`;
- `isIndexable`, `isInSitemap`.

## Принятые решения

1. `parseCatalogQuery` принимает query-строку и полный локальный URL; это позволяет буквально проверять идемпотентность на выходе `catalogQueryPath`.
2. `resolveCatalogRequest` получил необязательный `landingRoute`. По одной сущности `landing` нельзя отличить маршрут посадочной от посадочной, найденной по `filter_key`; без флага работает вывод по наличию фильтров.
3. Для всех успешных товарных ответов выбран `robots: index`; дублирование непубликуемого SKU снимается canonical, а не `noindex`.
4. Явный `?page=1` на обычном листинге — 301. На маршруте посадочной явный `?page=1` возвращает 200 с чистым canonical. В sitemap допускается чистый адрес посадочной.
5. 301 содержит только `location`; 400/404/410 не содержат `location` и получают `robots: noindex`.
6. Повторы tracking разрешены; повторы фильтров, `page` и `sort` — 400.
7. `validateCanonicalPath` проверяет только формат; существование цели, её статус, тип, редирект, `noindex` и цепочку canonical проверяет репозиторий.
8. Диалект размера привязан к слагам `shiny` и `diski`; неизвестная категория не нормализует размер.
9. `is_active` без значения считается активным, `is_indexable` без значения — неиндексируемым.

## Сомнения и вопросы к SOL

1. Проверить, что `/catalog/<cat>/f/<landing>?page=1` возвращает 200 с canonical без параметра и `sitemap: false`.
2. Достаточно ли `robots: index` для `?sku`-страниц без отдельной SEO-публикации, если canonical указывает на модель или на себя? Матрица не задаёт `robots` для этих двух строк.
3. Необязательный `landingRoute` расширяет сигнатуру задания. Нет ли более предпочтительного способа различить маршрут посадочной и совпадение по `filter_key` без доступа к БД?
4. `getRobotsPolicy` возвращает структуру, а не текст `robots.txt`. Правильно ли оставить рендер строки маршруту?
5. `isInSitemap(type, entity, context)` — сигнатура в задании была `isInSitemap(...)`. Проверить, что типовая форма удобна для генератора sitemap.
6. `TRACKING_PARAMS` содержит маркер `utm_*`. Проверить, что это не воспринимается как список точных имён.
7. `canonical_path` с отсутствующей целью проходит формальную проверку — это сознательно, но нужно подтвердить, что проверка существования точно остаётся в репозитории.

## Что проверить SOL

- Все строки матрицы товара: 404/410/400, три состояния `?sku`, canonical и `Offer.url`, отсутствие `Location` у 404/410.
- Матрицу варианта: текущий и исторический слаг, двойная смена слага — 301 сразу на третий URL, 410/404 без `Location`.
- Матрицу каталога: точное совпадение с посадочной, `page>1`, `page=1` без цепочки, `sort` + canonical без `sort`, `noindex`, `page=2` листинга, пустая выдача и страница за пределами.
- `validateCanonicalPath`: внешний домен, `//`, `http` в любом регистре, `?`, `#`, `\`, `%`, управляющие символы, завершающий слеш, лишние сегменты, верхний регистр, другой тип маршрута.
- Отсутствие импортов `express`, `pug`, `fs`, `node:sqlite` в трёх новых модулях.
- Отсутствие изменений Stage 0, URL-схемы, booking API и зависимостей.
- Качество тестов: каждая проверка действительно вызывает чистую функцию, нет ложноположительных ассертов.

## Статус

Изменения не коммичены и не запушены. Stage 2 (SQLite, миграции, репозиторий) не начат. Самооценка пройдена, финальная подпись — за SOL.
