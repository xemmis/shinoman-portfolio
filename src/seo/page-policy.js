// Политика статусов, canonical, robots и sitemap. Этап 1: чистые функции
// без Express, Pug, файловой системы и БД.

import {
  CATEGORY_PATH_RE,
  PRODUCT_PATH_RE,
  SLUG_RE,
  SORT_VALUES,
  absoluteUrl,
  catalogQueryPath,
  categoryPath,
  landingPagePath,
  landingPath,
  productPath,
  skuQueryPath,
  variantPath,
} from '../routes/urls.js';
import { buildFilterKey, parseFilterKey } from '../catalog/filters.js';

export const HTTP = Object.freeze({
  OK: 200,
  MOVED: 301,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  GONE: 410,
});

export const ROBOTS = Object.freeze({
  INDEX: 'index',
  NOINDEX: 'noindex',
});

export const SITEMAP_MODES = Object.freeze(['single', 'index']);

function validSlug(value) {
  return typeof value === 'string' && SLUG_RE.test(value);
}

function isTrue(value) {
  return value === 1 || value === true;
}

function isActive(entity) {
  return entity.is_active !== 0 && entity.is_active !== false;
}

function isIndexableVariant(entity) {
  return isActive(entity)
    && isTrue(entity.is_indexable)
    && entity.discontinued_at == null;
}

function isPublishedProduct(entity) {
  return entity != null && entity.status === 'published';
}

function errorCode(status) {
  if (status === HTTP.BAD_REQUEST) return 'BAD_REQUEST';
  if (status === HTTP.NOT_FOUND) return 'NOT_FOUND';
  if (status === HTTP.GONE) return 'GONE';
  return 'ERROR';
}

function failure(status, message) {
  return {
    status,
    location: null,
    canonical: null,
    robots: ROBOTS.NOINDEX,
    sitemap: false,
    error: { code: errorCode(status), message },
    variant: null,
    offerUrl: null,
  };
}

function redirect(location) {
  return {
    status: HTTP.MOVED,
    location,
    canonical: null,
    robots: null,
    sitemap: false,
    error: null,
    variant: null,
    offerUrl: null,
  };
}

function success({ canonical, robots = ROBOTS.INDEX, sitemap = false, error = null, variant = null, offerUrl = null }) {
  return {
    status: HTTP.OK,
    location: null,
    canonical,
    robots,
    sitemap,
    error,
    variant,
    offerUrl,
  };
}

export function validateCanonicalPath(value, expectedType) {
  if (expectedType !== 'product' && expectedType !== 'category') {
    throw new TypeError('expectedType должен быть product или category.');
  }

  if (value === null || value === undefined) {
    return { ok: true, path: null, error: null };
  }

  if (typeof value !== 'string') {
    return { ok: false, path: null, error: 'canonical_path должен быть строкой или NULL.' };
  }
  if (value === '') {
    return { ok: false, path: null, error: 'canonical_path не может быть пустым.' };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return { ok: false, path: null, error: 'canonical_path не может быть абсолютным адресом.' };
  }
  if (value.startsWith('//')) {
    return { ok: false, path: null, error: 'canonical_path не может быть сетевым адресом.' };
  }
  if (!value.startsWith('/')) {
    return { ok: false, path: null, error: 'canonical_path должен начинаться с /.' };
  }
  if (value.endsWith('/')) {
    return { ok: false, path: null, error: 'canonical_path не может заканчиваться слешем.' };
  }
  if (/[?#\\%]/.test(value)) {
    return { ok: false, path: null, error: 'canonical_path не может содержать query, hash, обратный слеш или процентное кодирование.' };
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return { ok: false, path: null, error: 'canonical_path содержит управляющие символы.' };
  }
  if (/[A-Z]/.test(value)) {
    return { ok: false, path: null, error: 'canonical_path должен быть в нижнем регистре.' };
  }

  const pattern = expectedType === 'product' ? PRODUCT_PATH_RE : CATEGORY_PATH_RE;
  if (!pattern.test(value)) {
    return {
      ok: false,
      path: null,
      error: expectedType === 'product'
        ? 'canonical_path продукта должен иметь вид /p/<slug>.'
        : 'canonical_path категории должен иметь вид /catalog/<slug>.',
    };
  }

  return { ok: true, path: value, error: null };
}

export function resolveEntityCanonical({ origin, type, entity, routePath } = {}) {
  if (type !== 'product' && type !== 'category') {
    throw new TypeError('type должен быть product или category.');
  }
  if (typeof routePath !== 'string' || !routePath.startsWith('/')) {
    throw new TypeError('routePath должен быть локальным путём.');
  }

  const raw = entity?.canonical_path ?? null;
  const checked = validateCanonicalPath(raw, type);

  if (!checked.ok) {
    return {
      canonical: absoluteUrl(origin, routePath),
      path: routePath,
      error: {
        code: 'INVALID_CANONICAL_PATH',
        message: checked.error,
        value: raw,
      },
    };
  }

  const path = checked.path ?? routePath;
  return { canonical: absoluteUrl(origin, path), path, error: null };
}

export function getVariantCanonical({ origin, product, variant, hadSeoPublication = false } = {}) {
  if (!product || !variant || !validSlug(product.slug)) return null;

  if (isIndexableVariant(variant) && validSlug(variant.seo_slug)) {
    return absoluteUrl(origin, variantPath(product.slug, variant.seo_slug));
  }

  if (hadSeoPublication) {
    if (typeof variant.sku !== 'string' || variant.sku.trim() === '') return null;
    return absoluteUrl(origin, skuQueryPath(product.slug, variant.sku));
  }

  return resolveEntityCanonical({
    origin,
    type: 'product',
    entity: product,
    routePath: productPath(product.slug),
  }).canonical;
}

export function getOfferUrl({ origin, product, variant, hadSeoPublication = false } = {}) {
  if (!product || !variant || !validSlug(product.slug)) return null;

  if (isIndexableVariant(variant) && validSlug(variant.seo_slug)) {
    return absoluteUrl(origin, variantPath(product.slug, variant.seo_slug));
  }

  if (typeof variant.sku !== 'string' || variant.sku.trim() === '') return null;
  return absoluteUrl(origin, skuQueryPath(product.slug, variant.sku));
}

function productCanonical(origin, product) {
  return resolveEntityCanonical({
    origin,
    type: 'product',
    entity: product,
    routePath: productPath(product.slug),
  });
}

export function resolveProductRequest({
  origin,
  product,
  requestedSku = null,
  variantBySku = null,
  historyVariant = null,
} = {}) {
  if (!isPublishedProduct(product) || !validSlug(product.slug)) {
    return failure(HTTP.NOT_FOUND, 'Модель не найдена.');
  }

  let sku = requestedSku;
  if (Array.isArray(sku)) {
    if (sku.length !== 1) return failure(HTTP.BAD_REQUEST, 'Параметр sku повторён.');
    sku = sku[0];
  }

  if (sku === undefined || sku === null) {
    const canonical = productCanonical(origin, product);
    return success({
      canonical: canonical.canonical,
      robots: ROBOTS.INDEX,
      sitemap: isInSitemap('product', product),
      error: canonical.error,
    });
  }

  if (typeof sku !== 'string' || sku.trim() === '') {
    return failure(HTTP.BAD_REQUEST, 'Параметр sku не может быть пустым.');
  }

  const variant = variantBySku;
  if (!variant) return failure(HTTP.NOT_FOUND, 'Вариант не найден.');

  if (
    variant.product_id != null
    && product.id != null
    && variant.product_id !== product.id
  ) {
    return failure(HTTP.NOT_FOUND, 'Вариант принадлежит другой модели.');
  }

  if (variant.discontinued_at != null) {
    return failure(HTTP.GONE, 'Вариант окончательно снят с продажи.');
  }

  if (!isActive(variant)) {
    return failure(HTTP.NOT_FOUND, 'Вариант временно недоступен.');
  }

  if (isIndexableVariant(variant) && validSlug(variant.seo_slug)) {
    const canonical = absoluteUrl(origin, variantPath(product.slug, variant.seo_slug));
    return success({
      canonical,
      robots: ROBOTS.INDEX,
      sitemap: false,
      variant,
      offerUrl: canonical,
    });
  }

  const queryUrl = absoluteUrl(origin, skuQueryPath(product.slug, sku));
  const hadSeoPublication = Boolean(historyVariant);
  const modelCanonical = hadSeoPublication ? null : productCanonical(origin, product);

  return success({
    canonical: hadSeoPublication ? queryUrl : modelCanonical.canonical,
    robots: ROBOTS.INDEX,
    sitemap: false,
    error: hadSeoPublication ? null : modelCanonical.error,
    variant,
    offerUrl: queryUrl,
  });
}

export function resolveVariantRequest({
  origin,
  product,
  requestedVariantSlug,
  currentVariant = null,
  historyVariant = null,
} = {}) {
  if (!isPublishedProduct(product) || !validSlug(product.slug)) {
    return failure(HTTP.NOT_FOUND, 'Модель не найдена.');
  }
  if (!validSlug(requestedVariantSlug)) {
    return failure(HTTP.NOT_FOUND, 'Вариант не найден.');
  }

  const variant = currentVariant;

  if (variant) {
    if (variant.product_id != null && product.id != null && variant.product_id !== product.id) {
      return failure(HTTP.NOT_FOUND, 'Вариант принадлежит другой модели.');
    }
    if (variant.discontinued_at != null) {
      return failure(HTTP.GONE, 'Вариант окончательно снят с продажи.');
    }
    if (!isActive(variant)) {
      return failure(HTTP.NOT_FOUND, 'Вариант временно недоступен.');
    }

    if (isIndexableVariant(variant) && validSlug(variant.seo_slug)) {
      const canonical = absoluteUrl(origin, variantPath(product.slug, variant.seo_slug));
      return success({
        canonical,
        robots: ROBOTS.INDEX,
        sitemap: true,
        variant,
        offerUrl: canonical,
      });
    }

    if (typeof variant.sku !== 'string' || variant.sku.trim() === '') {
      return failure(HTTP.NOT_FOUND, 'Вариант не найден.');
    }
    return redirect(absoluteUrl(origin, skuQueryPath(product.slug, variant.sku)));
  }

  const historical = historyVariant;
  if (!historical) {
    return failure(HTTP.NOT_FOUND, 'Вариант не найден.');
  }

  if (historical.product_id != null && product.id != null && historical.product_id !== product.id) {
    return failure(HTTP.NOT_FOUND, 'Вариант принадлежит другой модели.');
  }
  if (historical.discontinued_at != null) {
    return failure(HTTP.GONE, 'Вариант окончательно снят с продажи.');
  }
  if (!isActive(historical)) {
    return failure(HTTP.NOT_FOUND, 'Вариант временно недоступен.');
  }

  if (isIndexableVariant(historical) && validSlug(historical.seo_slug)) {
    if (historical.seo_slug === requestedVariantSlug) {
      const canonical = absoluteUrl(origin, variantPath(product.slug, historical.seo_slug));
      return success({
        canonical,
        robots: ROBOTS.INDEX,
        sitemap: true,
        variant: historical,
        offerUrl: canonical,
      });
    }
    return redirect(absoluteUrl(origin, variantPath(product.slug, historical.seo_slug)));
  }

  if (typeof historical.sku !== 'string' || historical.sku.trim() === '') {
    return failure(HTTP.NOT_FOUND, 'Вариант не найден.');
  }
  return redirect(absoluteUrl(origin, skuQueryPath(product.slug, historical.sku)));
}

function landingFilterKey(landing) {
  const parsed = parseFilterKey(landing?.filter_key);
  return parsed ? buildFilterKey(parsed) : null;
}

function belongsToCategory(landing, category) {
  return landing.category_id == null || category.id == null || landing.category_id === category.id;
}

function matchLanding(landing, query, category) {
  if (!landing || !isTrue(landing.is_published) || !validSlug(landing.slug)) return null;
  if (!belongsToCategory(landing, category)) return null;
  return landingFilterKey(landing) === query.filterKey ? landing : null;
}

function pageBeyond(page, totalPages) {
  return Number.isInteger(totalPages) && page > totalPages;
}

export function resolveCatalogRequest({
  origin,
  category,
  landing,
  landingRoute,
  query,
  resultCount = null,
  totalPages = null,
} = {}) {
  if (!category || !validSlug(category.slug)) {
    return failure(HTTP.NOT_FOUND, 'Категория не найдена.');
  }
  if (!query || query.ok !== true) {
    return failure(HTTP.BAD_REQUEST, 'Некорректные параметры каталога.');
  }

  const categorySlug = category.slug;
  const page = query.page ?? 1;
  if (!Number.isSafeInteger(page) || page < 1) {
    return failure(HTTP.BAD_REQUEST, 'Некорректный номер страницы.');
  }
  const filters = query.filters ?? {};
  const filtersPresent = Object.keys(filters).length > 0;
  const sort = query.sort ?? null;
  if (sort !== null && !SORT_VALUES.includes(sort)) {
    return failure(HTTP.BAD_REQUEST, 'Некорректная сортировка.');
  }
  const isLandingRoute = typeof landingRoute === 'boolean'
    ? landingRoute
    : landing !== undefined && landing !== null && !filtersPresent;

  if (isLandingRoute) {
    if (!landing || !validSlug(landing.slug) || !belongsToCategory(landing, category)) {
      return failure(HTTP.NOT_FOUND, 'Посадочная не найдена.');
    }
    if (!isTrue(landing.is_published)) {
      return failure(HTTP.NOT_FOUND, 'Посадочная не опубликована.');
    }
    if (filtersPresent || sort !== null) {
      return failure(HTTP.BAD_REQUEST, 'Посадочная не принимает фильтры и сортировку.');
    }
    if (resultCount === 0) {
      return failure(HTTP.NOT_FOUND, 'По запросу нет результатов.');
    }
    if (pageBeyond(page, totalPages)) {
      return failure(HTTP.NOT_FOUND, 'Страница за пределами выдачи.');
    }

    return success({
      canonical: absoluteUrl(origin, landingPagePath(categorySlug, landing.slug, page)),
      robots: ROBOTS.INDEX,
      sitemap: isInSitemap('landing', landing, query),
    });
  }

  const matchedLanding = filtersPresent ? matchLanding(landing, query, category) : null;

  if (resultCount === 0) {
    return failure(HTTP.NOT_FOUND, 'По запросу нет результатов.');
  }
  if (pageBeyond(page, totalPages)) {
    return failure(HTTP.NOT_FOUND, 'Страница за пределами выдачи.');
  }

  if (query.pageWasExplicit === true && page === 1) {
    const target = matchedLanding && sort === null
      ? landingPath(categorySlug, matchedLanding.slug)
      : catalogQueryPath(categorySlug, { filters, page: 1, sort });
    return redirect(absoluteUrl(origin, target));
  }

  if (matchedLanding && sort === null) {
    return redirect(absoluteUrl(origin, landingPagePath(categorySlug, matchedLanding.slug, page)));
  }

  if (sort !== null) {
    const canonicalPath = matchedLanding
      ? landingPagePath(categorySlug, matchedLanding.slug, page)
      : catalogQueryPath(categorySlug, { filters, page });
    return success({
      canonical: absoluteUrl(origin, canonicalPath),
      robots: ROBOTS.NOINDEX,
      sitemap: false,
    });
  }

  if (filtersPresent) {
    return success({
      canonical: absoluteUrl(origin, catalogQueryPath(categorySlug, { filters, page })),
      robots: ROBOTS.NOINDEX,
      sitemap: false,
    });
  }

  if (page > 1) {
    return success({
      canonical: absoluteUrl(origin, catalogQueryPath(categorySlug, { filters: {}, page })),
      robots: ROBOTS.INDEX,
      sitemap: false,
    });
  }

  const canonical = resolveEntityCanonical({
    origin,
    type: 'category',
    entity: category,
    routePath: categoryPath(categorySlug),
  });

  return success({
    canonical: canonical.canonical,
    robots: ROBOTS.INDEX,
    sitemap: isInSitemap('category', category, query),
    error: canonical.error,
  });
}

export function getSitemapPath(mode) {
  if (mode === 'single') return '/sitemap.xml';
  if (mode === 'index') return '/sitemap-index.xml';
  throw new RangeError(`mode должен быть одним из: ${SITEMAP_MODES.join(', ')}.`);
}

export function getSitemapUrl(origin, mode) {
  return absoluteUrl(origin, getSitemapPath(mode));
}

export function getRobotsPolicy({ apiEnabled = false, mode = 'single' } = {}) {
  const disallow = ['/fragments/', '/cart', '/order', '/checkout'];
  if (apiEnabled) disallow.push('/api/');
  return {
    userAgent: '*',
    disallow,
    sitemapPath: getSitemapPath(mode),
  };
}

export function isIndexable(type, entity) {
  if (!entity) return false;

  if (type === 'product') return entity.status === 'published';
  if (type === 'variant') return isIndexableVariant(entity);
  if (type === 'category') return true;
  if (type === 'landing') return isTrue(entity.is_published);

  return false;
}

export function isInSitemap(type, entity, context = {}) {
  const entityType = type === 'catalog' ? 'category' : type;
  if (!isIndexable(entityType, entity)) return false;

  if (entityType === 'category' || entityType === 'landing') {
    if ((context.page ?? 1) !== 1 || context.pageWasExplicit === true) return false;
  }

  if (entityType === 'category') {
    if (Object.keys(context.filters ?? {}).length > 0 || (context.sort ?? null) !== null) return false;
  }

  if (entityType === 'product' || entityType === 'category') {
    const { path } = validateCanonicalPath(entity.canonical_path, entityType);
    if (path === null) return true;
    if (!validSlug(entity.slug)) return false;
    const routePath = entityType === 'product' ? productPath(entity.slug) : categoryPath(entity.slug);
    return path === routePath;
  }

  return true;
}
