// Нормализация фильтров каталога и разбор query-строки. Этап 1: чистые
// функции без Express, Pug, файловой системы и БД.

import { FILTER_ORDER, SORT_VALUES, isTrackingParam, SLUG_RE } from '../routes/urls.js';

export const SEASONS = Object.freeze(['winter', 'summer', 'all-season']);

const TIRE_KEY_RE = /^(\d{3})[\s/-]+(\d{2})[\s-]*r[\s-]*(\d{2})$/i;
const RIM_KEY_RE = /^(\d{1,2}(?:[.,]\d)?)\s*j\s*[-–—]\s*(\d{2})\s*[-–—]\s*(\d)\s*x\s*(\d{3})\s*[-–—]\s*et\s*([+-]?\d{1,2})$/i;
const FILTER_VALUE_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const PAGE_RE = /^[1-9]\d*$/;
const KNOWN_QUERY_KEYS = new Set([...FILTER_ORDER, 'page', 'sort']);

const TIRE_CATEGORIES = new Set(['shiny']);
const RIM_CATEGORIES = new Set(['diski']);

function isTireCategory(categorySlug) {
  return TIRE_CATEGORIES.has(categorySlug);
}

function isRimCategory(categorySlug) {
  return RIM_CATEGORIES.has(categorySlug);
}

function categoryOf(categorySlug) {
  if (categorySlug === undefined || categorySlug === null || categorySlug === '') {
    return { tires: true, rims: true };
  }
  return { tires: isTireCategory(categorySlug), rims: isRimCategory(categorySlug) };
}

function normalizeRimWidth(raw) {
  const value = Number(raw.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return String(value);
}

function tireKey(match) {
  return `${match[1]}-${match[2]}-r${match[3]}`;
}

function rimKey(match) {
  const width = normalizeRimWidth(match[1]);
  if (width === null) return null;
  const offset = String(Number(match[5]));
  return `${width}j-${match[2]}-${match[3]}x${match[4]}-et${offset}`;
}

export function normalizeSeason(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return SEASONS.includes(normalized) ? normalized : null;
}

export function normalizeSize(value, categorySlug) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const allowed = categoryOf(categorySlug);

  if (allowed.tires) {
    const match = TIRE_KEY_RE.exec(text);
    if (match) return tireKey(match);
  }

  if (allowed.rims) {
    const match = RIM_KEY_RE.exec(text);
    if (match) return rimKey(match);
  }

  return null;
}

export function normalizeBrand(value) {
  if (typeof value !== 'string') return null;
  const slug = value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return SLUG_RE.test(slug) ? slug : null;
}

export function formatSizeKey(categorySlug, sizeKey) {
  if (typeof sizeKey !== 'string') return null;
  const text = sizeKey.trim();
  const allowed = categoryOf(categorySlug);

  if (allowed.tires) {
    const tire = TIRE_KEY_RE.exec(text);
    if (tire) return `${tire[1]}/${tire[2]} R${tire[3]}`;
  }

  if (allowed.rims) {
    const rim = RIM_KEY_RE.exec(text);
    if (rim) {
      const width = normalizeRimWidth(rim[1]);
      if (width === null) return null;
      const offset = String(Number(rim[5]));
      return `${width}J × ${rim[2]} · ${rim[3]}x${rim[4]} · ET${offset}`;
    }
  }

  return null;
}

function filterValueOf(key, value) {
  if (value === undefined || value === null || value === '') return null;

  if (key === 'season') return normalizeSeason(value);
  if (key === 'brand') return normalizeBrand(value);

  if (typeof value !== 'string') return null;
  const size = value.trim().toLowerCase();
  return FILTER_VALUE_RE.test(size) ? size : null;
}

export function buildFilterKey(filters = {}) {
  const params = new URLSearchParams();
  for (const key of FILTER_ORDER) {
    const value = filterValueOf(key, filters?.[key]);
    if (value === null) {
      if (filters?.[key] === undefined || filters?.[key] === null || filters?.[key] === '') continue;
      throw new TypeError(`Фильтр ${key} содержит недопустимое значение.`);
    }
    params.set(key, value);
  }
  return params.toString();
}

export function parseFilterKey(key) {
  if (typeof key !== 'string' || key === '') return null;

  let params;
  try {
    params = new URLSearchParams(key);
  } catch {
    return null;
  }

  const parsed = {};
  for (const [name, value] of params) {
    if (!FILTER_ORDER.includes(name)) return null;
    if (Object.hasOwn(parsed, name)) return null;
    const normalized = filterValueOf(name, value);
    if (normalized === null) return null;
    parsed[name] = normalized;
  }

  if (Object.keys(parsed).length === 0) return null;

  const ordered = {};
  for (const name of FILTER_ORDER) {
    if (Object.hasOwn(parsed, name)) ordered[name] = parsed[name];
  }
  return ordered;
}

function fail(error) {
  return { ok: false, status: 400, error };
}

function isAllowed(dictionary, value) {
  if (dictionary === undefined || dictionary === null) return true;
  if (dictionary instanceof Set) return dictionary.has(value);
  if (Array.isArray(dictionary)) return dictionary.includes(value);
  if (typeof dictionary === 'object') return Object.hasOwn(dictionary, value) && dictionary[value] !== false;
  return true;
}

function categorySlugOf(dictionaries) {
  if (typeof dictionaries.categorySlug === 'string') return dictionaries.categorySlug;
  if (dictionaries.category && typeof dictionaries.category.slug === 'string') {
    return dictionaries.category.slug;
  }
  return undefined;
}

function searchOf(input) {
  if (typeof input !== 'string' || input === '') return '';
  // Идемпотентность: принимаем как query-строку, так и полный локальный URL.
  if (!input.startsWith('/')) return input;
  const queryIndex = input.indexOf('?');
  return queryIndex === -1 ? '' : input.slice(queryIndex);
}

export function parseCatalogQuery(search, dictionaries = {}) {
  dictionaries = dictionaries ?? {};
  let params;
  try {
    params = new URLSearchParams(searchOf(search));
  } catch {
    return fail('Некорректная query-строка.');
  }

  const counts = new Map();
  for (const key of params.keys()) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  for (const [key, count] of counts) {
    if (KNOWN_QUERY_KEYS.has(key)) {
      if (count > 1) return fail(`Параметр ${key} повторён.`);
    } else if (!isTrackingParam(key)) {
      return fail(`Неизвестный параметр ${key}.`);
    }
  }

  const filters = {};

  const rawSeason = params.get('season');
  if (rawSeason !== null) {
    const season = normalizeSeason(rawSeason);
    if (season === null) return fail('Некорректный сезон.');
    if (!isAllowed(dictionaries.seasons, season)) return fail('Неизвестный сезон.');
    filters.season = season;
  }

  const rawSize = params.get('size');
  if (rawSize !== null) {
    const size = normalizeSize(rawSize, categorySlugOf(dictionaries));
    if (size === null) return fail('Некорректный размер.');
    if (!isAllowed(dictionaries.sizes, size)) return fail('Неизвестный размер.');
    filters.size = size;
  }

  const rawBrand = params.get('brand');
  if (rawBrand !== null) {
    const brand = normalizeBrand(rawBrand);
    if (brand === null) return fail('Некорректный бренд.');
    if (!isAllowed(dictionaries.brands, brand)) return fail('Неизвестный бренд.');
    filters.brand = brand;
  }

  const rawPage = params.get('page');
  let page = 1;
  if (rawPage !== null) {
    if (!PAGE_RE.test(rawPage)) return fail('Некорректный номер страницы.');
    const parsedPage = Number(rawPage);
    if (!Number.isSafeInteger(parsedPage)) return fail('Некорректный номер страницы.');
    page = parsedPage;
  }

  const rawSort = params.get('sort');
  let sort = null;
  if (rawSort !== null) {
    if (!SORT_VALUES.includes(rawSort)) return fail('Некорректная сортировка.');
    sort = rawSort;
  }

  const tracking = {};
  for (const [key, value] of params) {
    if (!isTrackingParam(key)) continue;
    const name = key.toLowerCase();
    if (!Object.hasOwn(tracking, name)) tracking[name] = [];
    tracking[name].push(value);
  }

  return {
    ok: true,
    filters,
    filterKey: buildFilterKey(filters),
    page,
    sort,
    tracking,
    pageWasExplicit: rawPage !== null,
  };
}
