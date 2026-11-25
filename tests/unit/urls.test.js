import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATEGORY_PATH_RE,
  FILTER_ORDER,
  PRODUCT_PATH_RE,
  SLUG_RE,
  SORT_VALUES,
  TRACKING_PARAMS,
  VARIANT_PATH_RE,
  absoluteUrl,
  catalogQueryPath,
  categoryPath,
  isTrackingParam,
  landingPagePath,
  landingPath,
  parseCatalogPath,
  parseProductPath,
  productPath,
  skuQueryPath,
  variantPath,
} from '../../src/routes/urls.js';

test('SLUG_RE accepts only lowercase latin slugs with single hyphens', () => {
  for (const slug of ['a', 'michelin', 'michelin-pilot-sport-4', '205-55-r16', '8j-18-5x112-et45']) {
    assert.equal(SLUG_RE.test(slug), true, slug);
  }
  for (const slug of ['', 'Michelin', '-michelin', 'michelin-', 'michelin--pilot', 'michelin pilot', 'michelin_pilot', 'мишлен', 'a/b']) {
    assert.equal(SLUG_RE.test(slug), false, slug);
  }
});

test('path patterns match only exact single-segment routes', () => {
  assert.equal(CATEGORY_PATH_RE.test('/catalog/shiny'), true);
  assert.equal(CATEGORY_PATH_RE.test('/catalog/shiny/'), false);
  assert.equal(CATEGORY_PATH_RE.test('/catalog/shiny/f/zimnie'), false);
  assert.equal(CATEGORY_PATH_RE.test('/catalog/Shiny'), false);

  assert.equal(PRODUCT_PATH_RE.test('/p/michelin-pilot-sport-4'), true);
  assert.equal(PRODUCT_PATH_RE.test('/p/michelin-pilot-sport-4/'), false);
  assert.equal(PRODUCT_PATH_RE.test('/p/michelin-pilot-sport-4/v/205-55-r16-91v'), false);

  assert.equal(VARIANT_PATH_RE.test('/p/michelin-pilot-sport-4/v/205-55-r16-91v'), true);
  assert.equal(VARIANT_PATH_RE.test('/p/michelin-pilot-sport-4/v/205-55-r16-91v/'), false);
  assert.equal(VARIANT_PATH_RE.test('/p/michelin-pilot-sport-4/v/205-55-r16-91v/extra'), false);
});

test('path builders produce exact frozen strings', () => {
  assert.equal(categoryPath('shiny'), '/catalog/shiny');
  assert.equal(productPath('michelin-pilot-sport-4'), '/p/michelin-pilot-sport-4');
  assert.equal(
    variantPath('michelin-pilot-sport-4', '205-55-r16-91v'),
    '/p/michelin-pilot-sport-4/v/205-55-r16-91v',
  );
  assert.equal(
    landingPath('shiny', 'zimnie-205-55-r16'),
    '/catalog/shiny/f/zimnie-205-55-r16',
  );
  assert.equal(landingPagePath('shiny', 'zimnie-205-55-r16', 1), '/catalog/shiny/f/zimnie-205-55-r16');
  assert.equal(
    landingPagePath('shiny', 'zimnie-205-55-r16', 3),
    '/catalog/shiny/f/zimnie-205-55-r16?page=3',
  );
});

test('path builders reject invalid slugs and pages', () => {
  assert.throws(() => categoryPath('Shiny'), TypeError);
  assert.throws(() => productPath('michelin pilot'), TypeError);
  assert.throws(() => variantPath('michelin', '205/55'), TypeError);
  assert.throws(() => landingPath('shiny', 'Zimnie'), TypeError);
  assert.throws(() => landingPagePath('shiny', 'zimnie', 0), RangeError);
  assert.throws(() => landingPagePath('shiny', 'zimnie', 1.5), RangeError);
});

test('skuQueryPath percent-encodes the sku', () => {
  assert.equal(
    skuQueryPath('michelin-pilot-sport-4', 'ps4-2055516-91v'),
    '/p/michelin-pilot-sport-4?sku=ps4-2055516-91v',
  );
  assert.equal(
    skuQueryPath('michelin-pilot-sport-4', 'ps4 205/55+91v'),
    '/p/michelin-pilot-sport-4?sku=ps4%20205%2F55%2B91v',
  );
  assert.equal(
    skuQueryPath('michelin-pilot-sport-4', 'a&b=c#d'),
    '/p/michelin-pilot-sport-4?sku=a%26b%3Dc%23d',
  );
  assert.throws(() => skuQueryPath('michelin', ''), TypeError);
  assert.throws(() => skuQueryPath('michelin', '   '), TypeError);
  assert.throws(() => skuQueryPath('michelin', 42), TypeError);
});

test('catalogQueryPath keeps season, size, brand order regardless of input order', () => {
  const filters = { brand: 'michelin', size: '205-55-r16', season: 'winter' };
  assert.equal(
    catalogQueryPath('shiny', { filters }),
    '/catalog/shiny?season=winter&size=205-55-r16&brand=michelin',
  );
  assert.deepEqual(FILTER_ORDER, ['season', 'size', 'brand']);
});

test('catalogQueryPath omits page=1 and includes sort only when provided', () => {
  assert.equal(catalogQueryPath('shiny'), '/catalog/shiny');
  assert.equal(catalogQueryPath('shiny', { page: 1 }), '/catalog/shiny');
  assert.equal(catalogQueryPath('shiny', { page: 2 }), '/catalog/shiny?page=2');
  assert.equal(
    catalogQueryPath('shiny', { filters: { season: 'winter' }, page: 2, sort: 'price' }),
    '/catalog/shiny?season=winter&page=2&sort=price',
  );
  assert.deepEqual(SORT_VALUES, ['price', 'price-down']);
  assert.throws(() => catalogQueryPath('shiny', { sort: 'price-up' }), RangeError);
  assert.throws(() => catalogQueryPath('shiny', { page: 0 }), RangeError);
  assert.throws(() => catalogQueryPath('shiny', { filters: { size: '205/55 R16' } }), TypeError);
});

test('absoluteUrl joins origin and local path without rewriting it', () => {
  assert.equal(
    absoluteUrl('https://shop.example', '/p/michelin?sku=ps4'),
    'https://shop.example/p/michelin?sku=ps4',
  );
  assert.equal(
    absoluteUrl('http://127.0.0.1:3000', '/catalog/shiny?page=2'),
    'http://127.0.0.1:3000/catalog/shiny?page=2',
  );
  assert.throws(() => absoluteUrl('https://shop.example/', '/p/x'), TypeError);
  assert.throws(() => absoluteUrl('https://shop.example/base', '/p/x'), TypeError);
  assert.throws(() => absoluteUrl('https://shop.example?x=1', '/p/x'), TypeError);
  assert.throws(() => absoluteUrl('ftp://shop.example', '/p/x'), TypeError);
  assert.throws(() => absoluteUrl('shop.example', '/p/x'), TypeError);
  assert.throws(() => absoluteUrl('https://shop.example', 'p/x'), TypeError);
  assert.throws(() => absoluteUrl('https://shop.example', '//evil.example/p/x'), TypeError);
  assert.throws(() => absoluteUrl('https://shop.example', '/p/x\\y'), TypeError);
});

test('parseProductPath distinguishes model and variant routes and rejects extras', () => {
  assert.deepEqual(
    parseProductPath('/p/michelin-pilot-sport-4'),
    { productSlug: 'michelin-pilot-sport-4', variantSlug: null },
  );
  assert.deepEqual(
    parseProductPath('/p/michelin-pilot-sport-4/v/205-55-r16-91v'),
    { productSlug: 'michelin-pilot-sport-4', variantSlug: '205-55-r16-91v' },
  );
  for (const pathname of [
    '/catalog/shiny',
    '/p/Michelin',
    '/p/michelin/',
    '/p/michelin/v/',
    '/p/michelin/v/205/extra',
    '/p',
    '',
  ]) {
    assert.equal(parseProductPath(pathname), null, pathname);
  }
  assert.equal(parseProductPath(null), null);
});

test('parseCatalogPath distinguishes category and landing routes and rejects extras', () => {
  assert.deepEqual(parseCatalogPath('/catalog/shiny'), { categorySlug: 'shiny', landingSlug: null });
  assert.deepEqual(
    parseCatalogPath('/catalog/shiny/f/zimnie-205-55-r16'),
    { categorySlug: 'shiny', landingSlug: 'zimnie-205-55-r16' },
  );
  for (const pathname of [
    '/p/michelin',
    '/catalog',
    '/catalog/Shiny',
    '/catalog/shiny/',
    '/catalog/shiny/f/',
    '/catalog/shiny/f/zimnie/',
    '/catalog/shiny/f/zimnie/extra',
  ]) {
    assert.equal(parseCatalogPath(pathname), null, pathname);
  }
  assert.equal(parseCatalogPath(null), null);
});

test('isTrackingParam is case-insensitive for utm_* and known click ids', () => {
  for (const key of [
    'utm_source',
    'UTM_Medium',
    'gclid',
    'GCLID',
    'yclid',
    'fbclid',
    'msclkid',
    '_ga',
    '_gl',
    'mc_cid',
    'mc_eid',
  ]) {
    assert.equal(isTrackingParam(key), true, key);
  }
  for (const key of ['season', 'utm', 'utmsource', 'utm-source', 'gclid_extra', 'page', 'SORT', '', null]) {
    assert.equal(isTrackingParam(key), false, String(key));
  }
  assert.equal(TRACKING_PARAMS.includes('utm_*'), true);
});
