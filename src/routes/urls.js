// Контракт публичных URL каталога. Этап 1: модуль только строит и разбирает
// адреса, не зависит от Express, Pug, файловой системы и БД.

export const SLUG_SOURCE = '[a-z0-9]+(?:-[a-z0-9]+)*';

export const SLUG_RE = new RegExp(`^${SLUG_SOURCE}$`);
export const CATEGORY_PATH_RE = new RegExp(`^/catalog/(${SLUG_SOURCE})$`);
export const PRODUCT_PATH_RE = new RegExp(`^/p/(${SLUG_SOURCE})$`);
export const VARIANT_PATH_RE = new RegExp(`^/p/(${SLUG_SOURCE})/v/(${SLUG_SOURCE})$`);

const LANDING_PATH_RE = new RegExp(`^/catalog/(${SLUG_SOURCE})/f/(${SLUG_SOURCE})$`);
const FILTER_VALUE_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export const FILTER_ORDER = Object.freeze(['season', 'size', 'brand']);
export const SORT_VALUES = Object.freeze(['price', 'price-down']);

// `utm_*` — префикс без учёта регистра, остальные значения сравниваются целиком.
export const TRACKING_PARAMS = Object.freeze([
  'utm_*',
  'gclid',
  'yclid',
  'fbclid',
  'msclkid',
  '_ga',
  '_gl',
  'mc_cid',
  'mc_eid',
]);

const TRACKING_NAMES = new Set(TRACKING_PARAMS.filter((name) => name !== 'utm_*'));

export function isTrackingParam(key) {
  if (typeof key !== 'string') return false;
  const normalized = key.toLowerCase();
  return normalized.startsWith('utm_') || TRACKING_NAMES.has(normalized);
}

function assertSlug(value, name) {
  if (typeof value !== 'string' || !SLUG_RE.test(value)) {
    throw new TypeError(`${name} должен быть slug из строчных латинских букв и цифр.`);
  }
}

function assertPage(page) {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RangeError('page должен быть целым числом не меньше 1.');
  }
}

function pageOf(page) {
  if (page === undefined || page === null) return 1;
  assertPage(page);
  return page;
}

export function categoryPath(slug) {
  assertSlug(slug, 'categorySlug');
  return `/catalog/${slug}`;
}

export function productPath(slug) {
  assertSlug(slug, 'productSlug');
  return `/p/${slug}`;
}

export function variantPath(productSlug, variantSlug) {
  assertSlug(productSlug, 'productSlug');
  assertSlug(variantSlug, 'variantSlug');
  return `/p/${productSlug}/v/${variantSlug}`;
}

export function skuQueryPath(productSlug, sku) {
  assertSlug(productSlug, 'productSlug');
  if (typeof sku !== 'string' || sku.trim() === '') {
    throw new TypeError('sku должен быть непустой строкой.');
  }
  return `/p/${productSlug}?sku=${encodeURIComponent(sku)}`;
}

export function landingPath(categorySlug, landingSlug) {
  assertSlug(categorySlug, 'categorySlug');
  assertSlug(landingSlug, 'landingSlug');
  return `/catalog/${categorySlug}/f/${landingSlug}`;
}

export function landingPagePath(categorySlug, landingSlug, page = 1) {
  const base = landingPath(categorySlug, landingSlug);
  const normalizedPage = pageOf(page);
  return normalizedPage === 1 ? base : `${base}?page=${normalizedPage}`;
}

export function catalogQueryPath(categorySlug, { filters = {}, page = 1, sort = null } = {}) {
  assertSlug(categorySlug, 'categorySlug');

  const params = new URLSearchParams();
  for (const key of FILTER_ORDER) {
    const value = filters?.[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string') {
      throw new TypeError(`Фильтр ${key} должен быть строкой.`);
    }
    const normalized = value.trim().toLowerCase();
    if (!FILTER_VALUE_RE.test(normalized)) {
      throw new TypeError(`Фильтр ${key} содержит недопустимое значение.`);
    }
    params.set(key, normalized);
  }

  const normalizedPage = pageOf(page);
  if (normalizedPage > 1) params.set('page', String(normalizedPage));

  if (sort !== undefined && sort !== null) {
    if (!SORT_VALUES.includes(sort)) {
      throw new RangeError(`sort должен быть одним из: ${SORT_VALUES.join(', ')}.`);
    }
    params.set('sort', sort);
  }

  const query = params.toString();
  return query ? `/catalog/${categorySlug}?${query}` : `/catalog/${categorySlug}`;
}

export function absoluteUrl(origin, path) {
  if (typeof origin !== 'string' || origin === '') {
    throw new TypeError('origin должен быть непустой строкой.');
  }

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new TypeError('origin должен быть абсолютным URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError('origin должен использовать http или https.');
  }
  if (parsed.origin !== origin) {
    throw new TypeError('origin должен содержать только схему, хост и порт без слеша.');
  }

  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new TypeError('path должен быть локальным путём, начинающимся с одного слеша.');
  }
  if (/[\u0000-\u001f\u007f\\]/.test(path)) {
    throw new TypeError('path содержит недопустимые символы.');
  }

  return `${origin}${path}`;
}

export function parseProductPath(pathname) {
  if (typeof pathname !== 'string') return null;

  const variantMatch = VARIANT_PATH_RE.exec(pathname);
  if (variantMatch) {
    return { productSlug: variantMatch[1], variantSlug: variantMatch[2] };
  }

  const productMatch = PRODUCT_PATH_RE.exec(pathname);
  if (productMatch) {
    return { productSlug: productMatch[1], variantSlug: null };
  }

  return null;
}

export function parseCatalogPath(pathname) {
  if (typeof pathname !== 'string') return null;

  const landingMatch = LANDING_PATH_RE.exec(pathname);
  if (landingMatch) {
    return { categorySlug: landingMatch[1], landingSlug: landingMatch[2] };
  }

  const categoryMatch = CATEGORY_PATH_RE.exec(pathname);
  if (categoryMatch) {
    return { categorySlug: categoryMatch[1], landingSlug: null };
  }

  return null;
}
