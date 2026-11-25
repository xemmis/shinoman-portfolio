import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCatalogQuery } from '../../src/catalog/filters.js';
import {
  HTTP,
  ROBOTS,
  getRobotsPolicy,
  getSitemapPath,
  getSitemapUrl,
  getOfferUrl,
  getVariantCanonical,
  isInSitemap,
  isIndexable,
  resolveCatalogRequest,
  resolveProductRequest,
  resolveVariantRequest,
} from '../../src/seo/page-policy.js';

const origin = 'https://shop.example';

function product(overrides = {}) {
  return {
    id: 1,
    slug: 'michelin-pilot-sport-4',
    status: 'published',
    canonical_path: null,
    ...overrides,
  };
}

function variant(overrides = {}) {
  return {
    id: 10,
    product_id: 1,
    sku: 'ps4-2055516-91v',
    size_key: '205-55-r16',
    seo_slug: '205-55-r16-91v',
    is_active: 1,
    is_indexable: 1,
    discontinued_at: null,
    ...overrides,
  };
}

function category(overrides = {}) {
  return {
    id: 1,
    slug: 'shiny',
    canonical_path: null,
    ...overrides,
  };
}

function landing(overrides = {}) {
  return {
    id: 5,
    category_id: 1,
    slug: 'zimnie-205-55-r16',
    filter_key: 'season=winter&size=205-55-r16',
    is_published: 1,
    ...overrides,
  };
}

function q(search, dictionaries = {}) {
  const parsed = parseCatalogQuery(search, dictionaries);
  assert.equal(parsed.ok, true, `query must be valid: ${search}`);
  return parsed;
}

const productUrl = `${origin}/p/michelin-pilot-sport-4`;
const variantUrl = `${productUrl}/v/205-55-r16-91v`;
const queryUrl = `${productUrl}?sku=ps4-2055516-91v`;
const categoryUrl = `${origin}/catalog/shiny`;
const landingUrl = `${categoryUrl}/f/zimnie-205-55-r16`;

// --- Товар: модель и ?sku -------------------------------------------------

test('product matrix: missing, draft or archived model is 404 without Location', () => {
  for (const value of [null, product({ status: 'draft' }), product({ status: 'archived' })]) {
    const result = resolveProductRequest({ origin, product: value });
    assert.equal(result.status, HTTP.NOT_FOUND, String(value?.status));
    assert.equal(result.location, null);
    assert.equal(result.canonical, null);
    assert.equal(result.sitemap, false);
  }
});

test('product matrix: published model without sku is indexable and in sitemap', () => {
  const result = resolveProductRequest({ origin, product: product() });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, productUrl);
  assert.equal(result.robots, ROBOTS.INDEX);
  assert.equal(result.sitemap, true);
  assert.equal(result.error, null);
});

test('product matrix: valid canonical_path overrides the model route', () => {
  const model = product({ canonical_path: '/p/other-model' });
  const result = resolveProductRequest({ origin, product: model });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, `${origin}/p/other-model`);
  assert.equal(result.sitemap, false);
  assert.equal(isInSitemap('product', model), result.sitemap);
  assert.equal(result.error, null);
});

test('product matrix: invalid canonical_path falls back to the route and reports an error', () => {
  const result = resolveProductRequest({
    origin,
    product: product({ canonical_path: 'https://evil.example/p/other-model' }),
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, productUrl);
  assert.equal(result.error.code, 'INVALID_CANONICAL_PATH');
  assert.match(result.error.message, /canonical_path/);
});

test('product matrix: empty or repeated sku is 400', () => {
  for (const requestedSku of ['', '   ', ['a', 'b'], ['a', 'a'], []]) {
    const result = resolveProductRequest({
      origin,
      product: product(),
      requestedSku,
      variantBySku: variant(),
    });
    assert.equal(result.status, HTTP.BAD_REQUEST, JSON.stringify(requestedSku));
    assert.equal(result.location, null);
  }
});

test('product matrix: single-element sku array is accepted as one value', () => {
  const result = resolveProductRequest({
    origin,
    product: product(),
    requestedSku: ['ps4-2055516-91v'],
    variantBySku: variant(),
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, variantUrl);
});

test('product matrix: unknown or foreign sku is 404 without Location', () => {
  for (const variantBySku of [null, variant({ product_id: 2 })]) {
    const result = resolveProductRequest({
      origin,
      product: product(),
      requestedSku: 'ps4-2055516-91v',
      variantBySku,
    });
    assert.equal(result.status, HTTP.NOT_FOUND);
    assert.equal(result.location, null);
  }
});

test('product matrix: discontinued sku is 410 without Location', () => {
  const result = resolveProductRequest({
    origin,
    product: product(),
    requestedSku: 'ps4-2055516-91v',
    variantBySku: variant({ is_active: 0, is_indexable: 0, discontinued_at: '2026-01-01T00:00:00Z' }),
  });
  assert.equal(result.status, HTTP.GONE);
  assert.equal(result.location, null);
  assert.equal(result.canonical, null);
});

test('product matrix: temporarily inactive sku is 404', () => {
  const result = resolveProductRequest({
    origin,
    product: product(),
    requestedSku: 'ps4-2055516-91v',
    variantBySku: variant({ is_active: 0, is_indexable: 0 }),
  });
  assert.equal(result.status, HTTP.NOT_FOUND);
  assert.equal(result.location, null);
});

test('product matrix: active published sku canonicalizes to its /v/ URL', () => {
  const result = resolveProductRequest({
    origin,
    product: product(),
    requestedSku: 'ps4-2055516-91v',
    variantBySku: variant(),
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, variantUrl);
  assert.equal(result.offerUrl, variantUrl);
  assert.equal(result.robots, ROBOTS.INDEX);
  assert.equal(result.sitemap, false, 'query URL itself is not listed in sitemap');
});

test('product matrix: non-indexable sku with publication history canonicalizes to itself', () => {
  const result = resolveProductRequest({
    origin,
    product: product(),
    requestedSku: 'ps4-2055516-91v',
    variantBySku: variant({ is_indexable: 0, seo_slug: null }),
    historyVariant: { variant_id: 10, seo_slug: '205-55-r16-91v' },
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, queryUrl);
  assert.equal(result.offerUrl, queryUrl);
  assert.equal(result.sitemap, false);
});

test('product matrix: non-indexable sku without history canonicalizes to the model', () => {
  const result = resolveProductRequest({
    origin,
    product: product(),
    requestedSku: 'ps4-2055516-91v',
    variantBySku: variant({ is_indexable: 0, seo_slug: null }),
    historyVariant: null,
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, productUrl);
  assert.equal(result.offerUrl, queryUrl);
  assert.equal(result.sitemap, false);
});

test('product matrix: query canonical percent-encodes the sku', () => {
  const result = resolveProductRequest({
    origin,
    product: product(),
    requestedSku: 'ps4/55 91v',
    variantBySku: variant({ sku: 'ps4/55 91v', is_indexable: 0, seo_slug: null }),
    historyVariant: { variant_id: 10, seo_slug: null },
  });
  assert.equal(result.canonical, `${productUrl}?sku=ps4%2F55%2091v`);
});

test('product matrix: indexable flag without seo_slug falls back safely', () => {
  const result = resolveProductRequest({
    origin,
    product: product(),
    requestedSku: 'ps4-2055516-91v',
    variantBySku: variant({ seo_slug: null }),
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, productUrl);
  assert.equal(result.offerUrl, queryUrl);
});

// --- Вариант /v/ ---------------------------------------------------------

test('variant matrix: missing or draft model is 404', () => {
  for (const value of [null, product({ status: 'draft' })]) {
    const result = resolveVariantRequest({
      origin,
      product: value,
      requestedVariantSlug: '205-55-r16-91v',
      currentVariant: variant(),
    });
    assert.equal(result.status, HTTP.NOT_FOUND);
    assert.equal(result.location, null);
  }
});

test('variant matrix: invalid requested slug or no current/history is 404', () => {
  for (const requestedVariantSlug of ['205/55', 'UPPER', '']) {
    const result = resolveVariantRequest({
      origin,
      product: product(),
      requestedVariantSlug,
      currentVariant: null,
      historyVariant: null,
    });
    assert.equal(result.status, HTTP.NOT_FOUND, requestedVariantSlug);
  }

  const result = resolveVariantRequest({
    origin,
    product: product(),
    requestedVariantSlug: '205-55-r16-91v',
  });
  assert.equal(result.status, HTTP.NOT_FOUND);
  assert.equal(result.location, null);
});

test('variant matrix: current discontinued variant is 410 without Location', () => {
  const result = resolveVariantRequest({
    origin,
    product: product(),
    requestedVariantSlug: '205-55-r16-91v',
    currentVariant: variant({ is_active: 0, is_indexable: 0, discontinued_at: '2026-01-01' }),
  });
  assert.equal(result.status, HTTP.GONE);
  assert.equal(result.location, null);
});

test('variant matrix: current inactive variant is 404', () => {
  const result = resolveVariantRequest({
    origin,
    product: product(),
    requestedVariantSlug: '205-55-r16-91v',
    currentVariant: variant({ is_active: 0, is_indexable: 0 }),
  });
  assert.equal(result.status, HTTP.NOT_FOUND);
  assert.equal(result.location, null);
});

test('variant matrix: current indexable variant is 200 self canonical and in sitemap', () => {
  const result = resolveVariantRequest({
    origin,
    product: product(),
    requestedVariantSlug: '205-55-r16-91v',
    currentVariant: variant(),
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, variantUrl);
  assert.equal(result.offerUrl, variantUrl);
  assert.equal(result.robots, ROBOTS.INDEX);
  assert.equal(result.sitemap, true);
});

test('variant matrix: current non-indexable variant redirects to the query URL', () => {
  const result = resolveVariantRequest({
    origin,
    product: product(),
    requestedVariantSlug: '205-55-r16-91v',
    currentVariant: variant({ is_indexable: 0 }),
  });
  assert.equal(result.status, HTTP.MOVED);
  assert.equal(result.location, queryUrl);
  assert.equal(result.canonical, null);
});

test('variant matrix: history of a discontinued variant is 410 without Location', () => {
  const result = resolveVariantRequest({
    origin,
    product: product(),
    requestedVariantSlug: 'old-slug',
    historyVariant: variant({ is_active: 0, is_indexable: 0, discontinued_at: '2026-01-01' }),
  });
  assert.equal(result.status, HTTP.GONE);
  assert.equal(result.location, null);
});

test('variant matrix: history of an inactive variant is 404', () => {
  const result = resolveVariantRequest({
    origin,
    product: product(),
    requestedVariantSlug: 'old-slug',
    historyVariant: variant({ is_active: 0, is_indexable: 0 }),
  });
  assert.equal(result.status, HTTP.NOT_FOUND);
  assert.equal(result.location, null);
});

test('variant matrix: old published slug redirects directly to the current /v/ URL', () => {
  const result = resolveVariantRequest({
    origin,
    product: product(),
    requestedVariantSlug: 'first-slug',
    historyVariant: variant({ seo_slug: 'third-slug' }),
  });
  assert.equal(result.status, HTTP.MOVED);
  assert.equal(result.location, `${productUrl}/v/third-slug`);
});

test('variant matrix: double slug change never chains through the previous slug', () => {
  for (const requestedVariantSlug of ['first-slug', 'second-slug']) {
    const result = resolveVariantRequest({
      origin,
      product: product(),
      requestedVariantSlug,
      historyVariant: variant({ seo_slug: 'third-slug' }),
    });
    assert.equal(result.status, HTTP.MOVED, requestedVariantSlug);
    assert.equal(result.location, `${productUrl}/v/third-slug`, requestedVariantSlug);
  }
});

test('variant matrix: history of a non-indexable active variant redirects to query URL', () => {
  const result = resolveVariantRequest({
    origin,
    product: product(),
    requestedVariantSlug: 'old-slug',
    historyVariant: variant({ is_indexable: 0, seo_slug: null }),
  });
  assert.equal(result.status, HTTP.MOVED);
  assert.equal(result.location, queryUrl);
});

test('variant matrix: history pointing at the requested slug is treated as current', () => {
  const result = resolveVariantRequest({
    origin,
    product: product(),
    requestedVariantSlug: '205-55-r16-91v',
    historyVariant: variant(),
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, variantUrl);
  assert.equal(result.sitemap, true);
});

test('variant matrix: foreign history variant is 404', () => {
  const result = resolveVariantRequest({
    origin,
    product: product(),
    requestedVariantSlug: 'old-slug',
    historyVariant: variant({ product_id: 2 }),
  });
  assert.equal(result.status, HTTP.NOT_FOUND);
  assert.equal(result.location, null);
});

test('variant canonical and offer helpers follow the three sku states', () => {
  const active = variant();
  assert.equal(getVariantCanonical({ origin, product: product(), variant: active }), variantUrl);
  assert.equal(getOfferUrl({ origin, product: product(), variant: active }), variantUrl);

  const retired = variant({ is_indexable: 0, seo_slug: null });
  assert.equal(
    getVariantCanonical({ origin, product: product(), variant: retired, hadSeoPublication: true }),
    queryUrl,
  );
  assert.equal(
    getOfferUrl({ origin, product: product(), variant: retired, hadSeoPublication: true }),
    queryUrl,
  );
  assert.equal(
    getVariantCanonical({ origin, product: product(), variant: retired, hadSeoPublication: false }),
    productUrl,
  );
  assert.equal(
    getOfferUrl({ origin, product: product(), variant: retired, hadSeoPublication: false }),
    queryUrl,
  );
});

// --- Каталог -------------------------------------------------------------

test('catalog matrix: base listing page 1 is indexable and in sitemap', () => {
  const result = resolveCatalogRequest({
    origin,
    category: category(),
    query: q(''),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, categoryUrl);
  assert.equal(result.robots, ROBOTS.INDEX);
  assert.equal(result.sitemap, true);
});

test('catalog matrix: category canonical_path overrides the route', () => {
  const listing = category({ canonical_path: '/catalog/tyres' });
  const result = resolveCatalogRequest({
    origin,
    category: listing,
    query: q(''),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.canonical, `${origin}/catalog/tyres`);
  assert.equal(result.sitemap, false);
  assert.equal(isInSitemap('category', listing), result.sitemap);
  assert.equal(isInSitemap('catalog', listing), result.sitemap);
  assert.equal(result.error, null);
});

test('catalog matrix: invalid category canonical_path falls back and reports an error', () => {
  const result = resolveCatalogRequest({
    origin,
    category: category({ canonical_path: 'https://evil.example/catalog/tyres' }),
    query: q(''),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.canonical, categoryUrl);
  assert.equal(result.error.code, 'INVALID_CANONICAL_PATH');
});

test('catalog matrix: page 2 of a base listing is indexable, self canonical and out of sitemap', () => {
  const listing = category();
  const query = q('?page=2');
  const result = resolveCatalogRequest({
    origin,
    category: listing,
    query,
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, `${categoryUrl}?page=2`);
  assert.equal(result.robots, ROBOTS.INDEX);
  assert.equal(result.sitemap, false);
  assert.equal(isInSitemap('category', listing, query), result.sitemap);
  assert.equal(isInSitemap('catalog', listing, query), result.sitemap);
});

test('catalog matrix: only tracking keeps the clean base canonical and indexability', () => {
  const result = resolveCatalogRequest({
    origin,
    category: category(),
    query: q('?utm_source=example&gclid=123'),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, categoryUrl);
  assert.equal(result.robots, ROBOTS.INDEX);
  assert.equal(result.sitemap, true);
});

test('catalog matrix: explicit page=1 redirects to the normalized URL in one hop', () => {
  const result = resolveCatalogRequest({
    origin,
    category: category(),
    query: q('?page=1&utm_source=example'),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.status, HTTP.MOVED);
  assert.equal(result.location, categoryUrl);
  assert.equal(result.canonical, null);
});

test('catalog matrix: explicit page=1 with filters redirects to the clean filter URL', () => {
  const result = resolveCatalogRequest({
    origin,
    category: category(),
    query: q('?season=winter&size=205-55-r16&page=1'),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.status, HTTP.MOVED);
  assert.equal(result.location, `${categoryUrl}?season=winter&size=205-55-r16`);
});

test('catalog matrix: filters without a landing are 200 noindex with a normalized canonical', () => {
  const result = resolveCatalogRequest({
    origin,
    category: category(),
    query: q('?brand=Michelin&size=205%2F55%20R16&season=Winter&utm_source=x'),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(
    result.canonical,
    `${categoryUrl}?season=winter&size=205-55-r16&brand=michelin`,
  );
  assert.equal(result.robots, ROBOTS.NOINDEX);
  assert.equal(result.sitemap, false);
});

test('catalog matrix: valid sort is noindex and canonical drops sort but keeps page', () => {
  const result = resolveCatalogRequest({
    origin,
    category: category(),
    query: q('?season=winter&size=205-55-r16&sort=price&page=2'),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, `${categoryUrl}?season=winter&size=205-55-r16&page=2`);
  assert.equal(result.robots, ROBOTS.NOINDEX);
  assert.equal(result.sitemap, false);
});

test('catalog matrix: sort without filters canonicalizes to the clean listing', () => {
  const pageOne = resolveCatalogRequest({
    origin,
    category: category(),
    query: q('?sort=price'),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(pageOne.canonical, categoryUrl);
  assert.equal(pageOne.robots, ROBOTS.NOINDEX);

  const pageTwo = resolveCatalogRequest({
    origin,
    category: category(),
    query: q('?page=2&sort=price'),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(pageTwo.canonical, `${categoryUrl}?page=2`);
  assert.equal(pageTwo.robots, ROBOTS.NOINDEX);
});

test('catalog matrix: exact filter match redirects to the published landing', () => {
  const result = resolveCatalogRequest({
    origin,
    category: category(),
    landing: landing(),
    query: q('?size=205-55-r16&season=winter'),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.status, HTTP.MOVED);
  assert.equal(result.location, landingUrl);
});

test('catalog matrix: landing redirect preserves page when page > 1', () => {
  const result = resolveCatalogRequest({
    origin,
    category: category(),
    landing: landing(),
    query: q('?season=winter&size=205-55-r16&page=2'),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.status, HTTP.MOVED);
  assert.equal(result.location, `${landingUrl}?page=2`);
});

test('catalog matrix: page=1 plus landing redirects straight to the landing (no chain)', () => {
  const result = resolveCatalogRequest({
    origin,
    category: category(),
    landing: landing(),
    query: q('?season=winter&size=205-55-r16&page=1'),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.status, HTTP.MOVED);
  assert.equal(result.location, landingUrl);
  assert.equal(result.location.includes('page='), false);
});

test('catalog matrix: sort prevents the landing redirect and uses the landing canonical', () => {
  const result = resolveCatalogRequest({
    origin,
    category: category(),
    landing: landing(),
    query: q('?season=winter&size=205-55-r16&sort=price'),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, landingUrl);
  assert.equal(result.robots, ROBOTS.NOINDEX);
});

test('catalog matrix: an extra filter is not a landing match', () => {
  const result = resolveCatalogRequest({
    origin,
    category: category(),
    landing: landing(),
    query: q('?season=winter&size=205-55-r16&brand=michelin'),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(
    result.canonical,
    `${categoryUrl}?season=winter&size=205-55-r16&brand=michelin`,
  );
  assert.equal(result.robots, ROBOTS.NOINDEX);
});

test('catalog matrix: unpublished or foreign landing is ignored for query URLs', () => {
  for (const value of [landing({ is_published: 0 }), landing({ category_id: 2 })]) {
    const result = resolveCatalogRequest({
      origin,
      category: category(),
      landing: value,
      query: q('?season=winter&size=205-55-r16'),
      resultCount: 10,
      totalPages: 5,
    });
    assert.equal(result.status, HTTP.OK);
    assert.equal(result.canonical, `${categoryUrl}?season=winter&size=205-55-r16`);
    assert.equal(result.robots, ROBOTS.NOINDEX);
  }
});

test('catalog matrix: zero results and pages beyond the result set are 404', () => {
  const noResults = resolveCatalogRequest({
    origin,
    category: category(),
    query: q('?season=winter&size=205-55-r16'),
    resultCount: 0,
    totalPages: 0,
  });
  assert.equal(noResults.status, HTTP.NOT_FOUND);
  assert.equal(noResults.location, null);

  const beyond = resolveCatalogRequest({
    origin,
    category: category(),
    query: q('?page=6'),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(beyond.status, HTTP.NOT_FOUND);
  assert.equal(beyond.location, null);
});

test('catalog matrix: landing page 1 is indexable and in sitemap', () => {
  const result = resolveCatalogRequest({
    origin,
    category: category(),
    landing: landing(),
    landingRoute: true,
    query: q(''),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, landingUrl);
  assert.equal(result.robots, ROBOTS.INDEX);
  assert.equal(result.sitemap, true);
});

test('catalog matrix: direct route rejects a landing from another category', () => {
  const result = resolveCatalogRequest({
    origin,
    category: category(),
    landing: landing({ category_id: 2 }),
    landingRoute: true,
    query: q(''),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.status, HTTP.NOT_FOUND);
  assert.equal(result.canonical, null);
  assert.equal(result.sitemap, false);
});

test('catalog matrix: landing page 2 stays indexable with self canonical but leaves sitemap', () => {
  const result = resolveCatalogRequest({
    origin,
    category: category(),
    landing: landing(),
    landingRoute: true,
    query: q('?page=2'),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, `${landingUrl}?page=2`);
  assert.equal(result.robots, ROBOTS.INDEX);
  assert.equal(result.sitemap, false);
});

test('catalog matrix: explicit landing page=1 keeps 200 and clean canonical but leaves sitemap', () => {
  const query = q('?page=1');
  const page = landing();
  const result = resolveCatalogRequest({
    origin,
    category: category(),
    landing: page,
    landingRoute: true,
    query,
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, landingUrl);
  assert.equal(result.robots, ROBOTS.INDEX);
  assert.equal(result.sitemap, false);
  assert.equal(isInSitemap('landing', page, query), result.sitemap);
});

test('catalog matrix: landing with tracking keeps 200 and clean canonical', () => {
  const result = resolveCatalogRequest({
    origin,
    category: category(),
    landing: landing(),
    landingRoute: true,
    query: q('?utm_source=example'),
    resultCount: 10,
    totalPages: 5,
  });
  assert.equal(result.status, HTTP.OK);
  assert.equal(result.canonical, landingUrl);
  assert.equal(result.sitemap, true);
});

test('catalog matrix: landing with filters or sort is 400', () => {
  for (const search of ['?season=winter', '?sort=price', '?page=2&sort=price']) {
    const result = resolveCatalogRequest({
      origin,
      category: category(),
      landing: landing(),
      landingRoute: true,
      query: q(search),
      resultCount: 10,
      totalPages: 5,
    });
    assert.equal(result.status, HTTP.BAD_REQUEST, search);
  }
});

test('catalog matrix: missing or unpublished landing is 404', () => {
  for (const value of [null, landing({ is_published: 0 })]) {
    const result = resolveCatalogRequest({
      origin,
      category: category(),
      landing: value,
      landingRoute: true,
      query: q(''),
      resultCount: 10,
      totalPages: 5,
    });
    assert.equal(result.status, HTTP.NOT_FOUND, String(value));
    assert.equal(result.location, null);
  }
});

test('catalog matrix: landing with zero results or page beyond the set is 404', () => {
  const noResults = resolveCatalogRequest({
    origin,
    category: category(),
    landing: landing(),
    landingRoute: true,
    query: q(''),
    resultCount: 0,
    totalPages: 0,
  });
  assert.equal(noResults.status, HTTP.NOT_FOUND);

  const beyond = resolveCatalogRequest({
    origin,
    category: category(),
    landing: landing(),
    landingRoute: true,
    query: q('?page=3'),
    resultCount: 10,
    totalPages: 2,
  });
  assert.equal(beyond.status, HTTP.NOT_FOUND);
});

test('catalog matrix: unknown category and invalid query are rejected', () => {
  for (const value of [null, category({ slug: 'Shiny' })]) {
    const result = resolveCatalogRequest({ origin, category: value, query: q('') });
    assert.equal(result.status, HTTP.NOT_FOUND);
  }

  const result = resolveCatalogRequest({
    origin,
    category: category(),
    query: { ok: false, status: 400 },
  });
  assert.equal(result.status, HTTP.BAD_REQUEST);
});

// --- Sitemap, robots и предикаты -----------------------------------------

test('sitemap paths and URLs follow the mode', () => {
  assert.equal(getSitemapPath('single'), '/sitemap.xml');
  assert.equal(getSitemapPath('index'), '/sitemap-index.xml');
  assert.throws(() => getSitemapPath('auto'), RangeError);
  assert.equal(getSitemapUrl(origin, 'single'), `${origin}/sitemap.xml`);
  assert.equal(getSitemapUrl(origin, 'index'), `${origin}/sitemap-index.xml`);
});

test('robots policy lists fragments, cart, order, checkout and optional API', () => {
  assert.deepEqual(getRobotsPolicy(), {
    userAgent: '*',
    disallow: ['/fragments/', '/cart', '/order', '/checkout'],
    sitemapPath: '/sitemap.xml',
  });
  assert.deepEqual(getRobotsPolicy({ apiEnabled: true, mode: 'index' }), {
    userAgent: '*',
    disallow: ['/fragments/', '/cart', '/order', '/checkout', '/api/'],
    sitemapPath: '/sitemap-index.xml',
  });
});

test('isIndexable covers products, variants, categories and landings', () => {
  assert.equal(isIndexable('product', product()), true);
  assert.equal(isIndexable('product', product({ status: 'draft' })), false);
  assert.equal(isIndexable('product', null), false);

  assert.equal(isIndexable('variant', variant()), true);
  assert.equal(isIndexable('variant', variant({ is_indexable: 0 })), false);
  assert.equal(isIndexable('variant', variant({ is_active: 0 })), false);
  assert.equal(isIndexable('variant', variant({ discontinued_at: '2026-01-01' })), false);

  assert.equal(isIndexable('category', category()), true);
  assert.equal(isIndexable('landing', landing()), true);
  assert.equal(isIndexable('landing', landing({ is_published: 0 })), false);
  assert.equal(isIndexable('unknown', {}), false);
});

test('isInSitemap excludes later landing pages and filtered or sorted listings', () => {
  assert.equal(isInSitemap('product', product()), true);
  assert.equal(isInSitemap('variant', variant()), true);
  assert.equal(isInSitemap('variant', variant({ is_indexable: 0 })), false);
  assert.equal(isInSitemap('category', category()), true);
  assert.equal(isInSitemap('category', category({ canonical_path: '/catalog/shiny' })), true);
  assert.equal(isInSitemap('product', product({ canonical_path: '/p/michelin-pilot-sport-4' })), true);
  assert.equal(isInSitemap('landing', landing()), true);
  assert.equal(isInSitemap('landing', landing(), { page: 2 }), false);

  assert.equal(isInSitemap('catalog', category(), { page: 1 }), true);
  assert.equal(isInSitemap('catalog', category(), { page: 2 }), false);
  assert.equal(isInSitemap('catalog', category(), { page: 1, filters: { season: 'winter' } }), false);
  assert.equal(isInSitemap('catalog', category(), { page: 1, sort: 'price' }), false);
});
