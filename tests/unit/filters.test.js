import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SEASONS,
  buildFilterKey,
  formatSizeKey,
  normalizeBrand,
  normalizeSeason,
  normalizeSize,
  parseCatalogQuery,
  parseFilterKey,
} from '../../src/catalog/filters.js';
import { catalogQueryPath } from '../../src/routes/urls.js';

test('SEASONS is the frozen dictionary from the specification', () => {
  assert.deepEqual(SEASONS, ['winter', 'summer', 'all-season']);
  assert.equal(Object.isFrozen(SEASONS), true);
});

test('normalizeSeason accepts the three seasons case-insensitively', () => {
  assert.equal(normalizeSeason('winter'), 'winter');
  assert.equal(normalizeSeason(' Winter '), 'winter');
  assert.equal(normalizeSeason('ALL SEASON'), 'all-season');
  assert.equal(normalizeSeason('all_season'), 'all-season');
  assert.equal(normalizeSeason('summer'), 'summer');
  for (const value of ['autumn', '', '  ', null, 1, 'allseason']) {
    assert.equal(normalizeSeason(value), null, String(value));
  }
});

test('normalizeSize normalizes tire sizes to width-profile-r diameter', () => {
  assert.equal(normalizeSize('205/55 R16'), '205-55-r16');
  assert.equal(normalizeSize('205/55R16'), '205-55-r16');
  assert.equal(normalizeSize('205-55-r16'), '205-55-r16');
  assert.equal(normalizeSize(' 205 / 55 r 16 '), '205-55-r16');
  assert.equal(normalizeSize('195/65 R15', 'shiny'), '195-65-r15');
  assert.equal(normalizeSize('205/55 R16', 'diski'), null);
  for (const value of ['205/55', '205/55 R', 'R16', '', null, 205]) {
    assert.equal(normalizeSize(value), null, String(value));
  }
});

test('normalizeSize normalizes rim sizes to width-j-diameter-pcd-et', () => {
  assert.equal(normalizeSize('8j-18-5x112-et45'), '8j-18-5x112-et45');
  assert.equal(normalizeSize('8.0J-18-5X112-ET45'), '8j-18-5x112-et45');
  assert.equal(normalizeSize('8.5J-18-5x112-ET45'), '8.5j-18-5x112-et45');
  assert.equal(normalizeSize('8j-18-5x112-et45', 'diski'), '8j-18-5x112-et45');
  assert.equal(normalizeSize('8j-18-5x112-et45', 'shiny'), null);
  for (const value of ['8j-18-5x112', '8-18-5x112-et45', '8j-18-5x112-et', '', null]) {
    assert.equal(normalizeSize(value), null, String(value));
  }
});

test('normalizeBrand produces a lowercase latin slug', () => {
  assert.equal(normalizeBrand('Michelin'), 'michelin');
  assert.equal(normalizeBrand('  MICHELIN  '), 'michelin');
  assert.equal(normalizeBrand('Nokian Tyres'), 'nokian-tyres');
  assert.equal(normalizeBrand('Toyo-Tires'), 'toyo-tires');
  assert.equal(normalizeBrand('Hankook & Co'), 'hankook-co');
  for (const value of ['', '   ', 'Мишлен', null, 42]) {
    assert.equal(normalizeBrand(value), null, String(value));
  }
});

test('formatSizeKey renders human-readable sizes per category', () => {
  assert.equal(formatSizeKey('shiny', '205-55-r16'), '205/55 R16');
  assert.equal(formatSizeKey('diski', '8j-18-5x112-et45'), '8J × 18 · 5x112 · ET45');
  assert.equal(formatSizeKey('diski', '8.5j-18-5x112-et45'), '8.5J × 18 · 5x112 · ET45');
  assert.equal(formatSizeKey('shiny', '8j-18-5x112-et45'), null);
  assert.equal(formatSizeKey('diski', '205-55-r16'), null);
  assert.equal(formatSizeKey('shiny', 'invalid'), null);
});

test('buildFilterKey is order-independent and ignores page, sort and tracking', () => {
  const expected = 'season=winter&size=205-55-r16&brand=michelin';
  assert.equal(buildFilterKey({ season: 'winter', size: '205-55-r16', brand: 'michelin' }), expected);
  assert.equal(buildFilterKey({ brand: 'michelin', size: '205-55-r16', season: 'winter' }), expected);
  assert.equal(buildFilterKey({ season: 'Winter', brand: 'Michelin', size: '205-55-r16' }), expected);
  assert.equal(
    buildFilterKey({ season: 'winter', page: 2, sort: 'price', utm_source: 'x' }),
    'season=winter',
  );
  assert.equal(buildFilterKey(), '');
  assert.equal(buildFilterKey({}), '');
  assert.throws(() => buildFilterKey({ size: '205/55 R16' }), TypeError);
});

test('parseFilterKey round-trips the filter key in canonical order', () => {
  assert.deepEqual(
    parseFilterKey('brand=michelin&size=205-55-r16&season=winter'),
    { season: 'winter', size: '205-55-r16', brand: 'michelin' },
  );
  assert.deepEqual(parseFilterKey('season=Winter'), { season: 'winter' });
  assert.deepEqual(parseFilterKey('size=8.5j-18-5x112-et45'), { size: '8.5j-18-5x112-et45' });
  for (const key of [
    '',
    'page=2',
    'sort=price',
    'season=winter&season=summer',
    'season=autumn',
    'unknown=1',
    'season=',
  ]) {
    assert.equal(parseFilterKey(key), null, key);
  }
});

test('parseCatalogQuery returns normalized defaults and separates tracking', () => {
  const parsed = parseCatalogQuery('');
  assert.deepEqual(parsed, {
    ok: true,
    filters: {},
    filterKey: '',
    page: 1,
    sort: null,
    tracking: {},
    pageWasExplicit: false,
  });
});

test('parseCatalogQuery normalizes reordered filters to the same key', () => {
  const parsed = parseCatalogQuery('?brand=Michelin&size=205%2F55+R16&season=Winter');
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.filters, { season: 'winter', size: '205-55-r16', brand: 'michelin' });
  assert.equal(parsed.filterKey, 'season=winter&size=205-55-r16&brand=michelin');
  assert.equal(parsed.page, 1);
  assert.equal(parsed.sort, null);
  assert.equal(parsed.pageWasExplicit, false);
});

test('parseCatalogQuery rejects duplicate filter, page and sort keys', () => {
  for (const search of [
    '?season=winter&season=summer',
    '?season=winter&season=winter',
    '?size=205-55-r16&size=205-55-r16',
    '?brand=michelin&brand=nokian',
    '?page=2&page=2',
    '?sort=price&sort=price',
  ]) {
    const parsed = parseCatalogQuery(search);
    assert.equal(parsed.ok, false, search);
    assert.equal(parsed.status, 400, search);
  }
});

test('parseCatalogQuery rejects unknown keys except tracking', () => {
  for (const search of ['?foo=1', '?Season=winter', '?utm=1', '?gclid_extra=1', '?=x']) {
    const parsed = parseCatalogQuery(search);
    assert.equal(parsed.ok, false, search);
    assert.equal(parsed.status, 400, search);
  }

  const parsed = parseCatalogQuery('?utm_source=a&utm_source=b&UTM_Medium=c&gclid=d&_ga=e');
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.tracking, {
    utm_source: ['a', 'b'],
    utm_medium: ['c'],
    gclid: ['d'],
    _ga: ['e'],
  });
  assert.equal(parsed.filterKey, '');
});

test('parseCatalogQuery validates page format', () => {
  const parsed = parseCatalogQuery('?page=2');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.page, 2);
  assert.equal(parsed.pageWasExplicit, true);

  for (const page of ['0', '01', '-1', '1.0', 'abc', ' 2', '', '99999999999999999999']) {
    const result = parseCatalogQuery(`?page=${page}`);
    assert.equal(result.ok, false, page);
    assert.equal(result.status, 400, page);
  }
});

test('parseCatalogQuery accepts only the frozen sort values', () => {
  for (const sort of ['price', 'price-down']) {
    const parsed = parseCatalogQuery(`?sort=${sort}`);
    assert.equal(parsed.ok, true, sort);
    assert.equal(parsed.sort, sort, sort);
  }
  for (const sort of ['price-up', 'PRICE', 'new', '']) {
    const parsed = parseCatalogQuery(`?sort=${sort}`);
    assert.equal(parsed.ok, false, sort);
    assert.equal(parsed.status, 400, sort);
  }
});

test('parseCatalogQuery rejects empty or malformed filter values', () => {
  for (const search of [
    '?season=',
    '?season=autumn',
    '?size=',
    '?size=205%2F55',
    '?brand=',
    '?brand=%D0%9C%D0%B8%D1%88%D0%BB%D0%B5%D0%BD',
  ]) {
    const parsed = parseCatalogQuery(search);
    assert.equal(parsed.ok, false, search);
    assert.equal(parsed.status, 400, search);
  }
});

test('parseCatalogQuery enforces dictionaries when provided', () => {
  assert.equal(parseCatalogQuery('?season=winter', { seasons: ['winter'] }).ok, true);
  assert.equal(parseCatalogQuery('?season=summer', { seasons: ['winter'] }).ok, false);
  assert.equal(parseCatalogQuery('?season=winter', { seasons: new Set(['winter']) }).ok, true);

  assert.equal(parseCatalogQuery('?brand=Michelin', { brands: { michelin: true } }).ok, true);
  assert.equal(parseCatalogQuery('?brand=michelin', { brands: { michelin: false } }).ok, false);
  assert.equal(parseCatalogQuery('?brand=nokian', { brands: { michelin: true } }).ok, false);

  assert.equal(parseCatalogQuery('?size=205-55-r16', { sizes: ['205-55-r16'] }).ok, true);
  assert.equal(parseCatalogQuery('?size=195-65-r15', { sizes: ['205-55-r16'] }).ok, false);
});

test('parseCatalogQuery applies the category size dictionary', () => {
  assert.equal(parseCatalogQuery('?size=205%2F55%20R16', { categorySlug: 'shiny' }).ok, true);
  assert.equal(parseCatalogQuery('?size=205%2F55%20R16', { categorySlug: 'diski' }).ok, false);
  assert.equal(parseCatalogQuery('?size=8J-18-5X112-ET45', { categorySlug: 'diski' }).ok, true);
  assert.equal(parseCatalogQuery('?size=8J-18-5X112-ET45', { categorySlug: 'shiny' }).ok, false);
});

test('parseCatalogQuery is idempotent on the normalized URL', () => {
  const first = parseCatalogQuery('?sort=price&page=2&size=205%2F55%20R16&season=Winter&utm_source=x');
  assert.equal(first.ok, true);

  const normalized = catalogQueryPath('shiny', {
    filters: first.filters,
    page: first.page,
    sort: first.sort,
  });
  const second = parseCatalogQuery(normalized);

  assert.equal(second.ok, true);
  assert.deepEqual(second.filters, first.filters);
  assert.equal(second.filterKey, first.filterKey);
  assert.equal(second.page, first.page);
  assert.equal(second.sort, first.sort);
  assert.equal(second.pageWasExplicit, true);
  assert.deepEqual(second.tracking, {});
});
