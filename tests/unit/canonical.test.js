import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  resolveEntityCanonical,
  validateCanonicalPath,
} from '../../src/seo/page-policy.js';

const origin = 'https://shop.example';
const productRoute = '/p/michelin-pilot-sport-4';

test('validateCanonicalPath accepts NULL for product and category', () => {
  assert.deepEqual(validateCanonicalPath(null, 'product'), { ok: true, path: null, error: null });
  assert.deepEqual(validateCanonicalPath(undefined, 'category'), { ok: true, path: null, error: null });
});

test('validateCanonicalPath accepts exact local paths of the expected type', () => {
  assert.deepEqual(validateCanonicalPath('/p/other-model', 'product'), {
    ok: true,
    path: '/p/other-model',
    error: null,
  });
  assert.deepEqual(validateCanonicalPath('/catalog/tyres', 'category'), {
    ok: true,
    path: '/catalog/tyres',
    error: null,
  });
});

test('validateCanonicalPath rejects network and absolute addresses', () => {
  for (const value of [
    'https://evil.example/p/x',
    'HTTP://evil.example/p/x',
    'https:/evil.example/p/x',
    '//evil.example/p/x',
    'p/other-model',
  ]) {
    const result = validateCanonicalPath(value, 'product');
    assert.equal(result.ok, false, value);
    assert.equal(result.path, null, value);
  }
});

test('validateCanonicalPath rejects query, fragment, backslash and percent encoding', () => {
  for (const value of [
    '/p/other-model?utm_source=example',
    '/p/other-model#reviews',
    '/p/other-model\\reviews',
    '/p/other%2Dmodel',
    '/p/%2e%2e',
  ]) {
    const result = validateCanonicalPath(value, 'product');
    assert.equal(result.ok, false, value);
    assert.match(result.error, /canonical_path/);
  }
});

test('validateCanonicalPath rejects trailing slash, extra segments and uppercase', () => {
  for (const value of [
    '/p/other-model/',
    '/p/other-model/reviews',
    '/p//other-model',
    '/p/../other-model',
    '/p/./other-model',
    '/p/Other-Model',
    '/p/other_model',
  ]) {
    assert.equal(validateCanonicalPath(value, 'product').ok, false, value);
  }
});

test('validateCanonicalPath rejects control characters and non-strings', () => {
  for (const value of ['/p/other\u0001model', 42, {}, [], true]) {
    const result = validateCanonicalPath(value, 'product');
    assert.equal(result.ok, false, String(value));
    assert.equal(result.path, null);
  }
  assert.equal(validateCanonicalPath('', 'product').ok, false);
});

test('validateCanonicalPath rejects a path of another route type', () => {
  assert.equal(validateCanonicalPath('/catalog/tyres', 'product').ok, false);
  assert.equal(validateCanonicalPath('/p/other-model', 'category').ok, false);
  assert.equal(validateCanonicalPath('/p/other-model/v/205-55-r16', 'product').ok, false);
});

test('validateCanonicalPath rejects unknown expectedType', () => {
  assert.throws(() => validateCanonicalPath('/p/x', 'landing'), TypeError);
  assert.throws(() => validateCanonicalPath(null, undefined), TypeError);
});

test('syntactically valid but missing canonical target is left to the repository', () => {
  // Существование цели, её статус 200, тип и отсутствие цепочки проверяет
  // репозиторий перед сохранением; чистая функция проверяет только формат.
  const result = validateCanonicalPath('/p/not-in-database', 'product');
  assert.equal(result.ok, true);
  assert.equal(result.path, '/p/not-in-database');
  assert.equal(result.error, null);
});

test('resolveEntityCanonical uses a valid canonical_path', () => {
  const result = resolveEntityCanonical({
    origin,
    type: 'product',
    entity: { canonical_path: '/p/other-model' },
    routePath: productRoute,
  });
  assert.equal(result.canonical, `${origin}/p/other-model`);
  assert.equal(result.path, '/p/other-model');
  assert.equal(result.error, null);
});

test('resolveEntityCanonical falls back to routePath when canonical_path is NULL', () => {
  const result = resolveEntityCanonical({
    origin,
    type: 'product',
    entity: { canonical_path: null },
    routePath: productRoute,
  });
  assert.equal(result.canonical, `${origin}${productRoute}`);
  assert.equal(result.path, productRoute);
  assert.equal(result.error, null);
});

test('resolveEntityCanonical reports an invalid canonical_path and keeps self canonical', () => {
  const result = resolveEntityCanonical({
    origin,
    type: 'category',
    entity: { canonical_path: 'https://evil.example/catalog/tyres' },
    routePath: '/catalog/shiny',
  });
  assert.equal(result.canonical, `${origin}/catalog/shiny`);
  assert.equal(result.path, '/catalog/shiny');
  assert.equal(result.error.code, 'INVALID_CANONICAL_PATH');
  assert.equal(result.error.value, 'https://evil.example/catalog/tyres');
});

test('resolveEntityCanonical does not follow a second canonical hop', () => {
  // Первая сущность ссылается на вторую, вторая — обратно на первую.
  // Чистая функция возвращает ровно один сохранённый путь; обнаружение
  // цепочки и обратной ссылки — задача репозитория перед сохранением.
  const entity = {
    canonical_path: '/p/second',
    canonical_target: { canonical_path: '/p/first' },
  };
  const result = resolveEntityCanonical({
    origin,
    type: 'product',
    entity,
    routePath: '/p/first',
  });
  assert.equal(result.canonical, `${origin}/p/second`);
  assert.equal(result.error, null);
});

test('resolveEntityCanonical rejects unsupported types and non-local routePath', () => {
  assert.throws(
    () => resolveEntityCanonical({ origin, type: 'landing', entity: {}, routePath: '/catalog/x' }),
    TypeError,
  );
  assert.throws(
    () => resolveEntityCanonical({ origin, type: 'product', entity: {}, routePath: 'p/x' }),
    TypeError,
  );
  assert.throws(
    () => resolveEntityCanonical({ origin, type: 'product', entity: {}, routePath: '//evil.example/p/x' }),
    TypeError,
  );
});
