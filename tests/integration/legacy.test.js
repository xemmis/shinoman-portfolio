import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { filterCatalog, validateCatalog } from '../../katalog/catalog-model.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const demo = validateCatalog(JSON.parse(readFileSync(new URL('../../katalog/data.json', import.meta.url), 'utf8')));

test('combined tire filters and price sort use only matching variants', () => {
  const [vehicle] = demo.vehicles;
  const result = filterCatalog(demo.items, {
    type: 'tires', vehicle, filters: { kind: 'Зимние', width: '195', diameter: '15' }, sort: 'price-up',
  });
  assert.deepEqual(result.map(({ id, price, variants }) => [id, price, variants.map(({ sku }) => sku)]), [
    ['northline-frost', 21900, ['northline-frost-1']],
    ['northline-ice', 23500, ['northline-ice-2']],
  ]);
});

test('wheel fitment checks hub, bolt pattern, width, diameter and offset on the same variant', () => {
  const vehicle = demo.vehicles.find(({ id }) => id === 'kia-ceed');
  const results = filterCatalog(demo.items, { type: 'wheels', vehicle });
  assert.deepEqual(results.map(({ id, variants }) => [id, variants.length]), [
    ['rimworks-arc', 2], ['forgeline-apex', 2],
  ]);
  for (const [field, value] of Object.entries({ bore: 66.6, pcd: '5x112', width: 8, diameter: 18, offset: -45 })) {
    const candidate = structuredClone(demo.items.find(({ id }) => id === 'rimworks-arc'));
    candidate.variants = [{ ...candidate.variants[1], [field]: value }];
    assert.deepEqual(filterCatalog([candidate], { type: 'wheels', vehicle }), [], field);
  }
});

test('server reads the newest SQLite import and preserves the last valid snapshot', { timeout: 15000 }, async (context) => {
  const dir = mkdtempSync(resolve(root, '.catalog-test-'));
  const env = {
    ...process.env, PORT: '0', HOST: '127.0.0.1',
    CATALOG_DB_PATH: resolve(dir, 'catalog.sqlite'),
    BOOKING_DB_PATH: resolve(dir, 'booking.sqlite'),
  };
  const server = spawn(process.execPath, ['src/server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'] });
  context.after(async () => {
    if (server.exitCode === null) {
      const done = once(server, 'exit');
      server.kill();
      await done;
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const [line] = await once(server.stdout, 'data');
  const base = line.toString().match(/http:\/\/127\.0\.0\.1:\d+/)[0];
  const getCatalog = async () => {
    const response = await fetch(`${base}/katalog/data.json`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json();
  };

  for (const path of ['/katalog/shiny/', '/katalog/diski/', '/katalog/images/catalog-wheel.svg', '/zapis-na-shinomontazh/']) {
    assert.equal((await fetch(base + path)).status, 200, path);
  }
  const availability = await fetch(base + '/api/availability').then((response) => response.json());
  assert.equal(availability.days.length, 28);
  const firstSlot = availability.days.flatMap(({ date, slots }) => slots.map((slot) => ({ date, ...slot })))
    .find(({ status }) => status === 'available');
  const booking = {
    requestId: 'd789f895-1840-4653-9238-3786c4f39148', location: availability.location,
    date: firstSlot.date, time: firstSlot.time, name: 'Тест', phone: '+375291234567', car: 'Demo', plate: 'TEST',
  };
  const booked = await fetch(base + '/api/bookings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(booking),
  });
  assert.equal(booked.status, 201);
  assert.deepEqual(await booked.json(), { saved: true });
  const duplicate = await fetch(base + '/api/bookings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...booking, requestId: 'b3f95f45-2f1d-4f1e-9b0e-0f6a6f6f6f6f' }),
  });
  assert.equal(duplicate.status, 409);

  const initial = await getCatalog();
  assert.equal(initial.items[0].variants[0].price, 21900);
  const revised = structuredClone(demo);
  revised.items[0].variants[0].price = 24250;
  const input = resolve(dir, 'snapshot.json');
  writeFileSync(input, JSON.stringify(revised));
  const importCatalog = () => promisify(execFile)(process.execPath, ['katalog/catalog-store.mjs', input], { cwd: root, env });
  await importCatalog();
  const imported = await getCatalog();
  assert.equal(imported.items[0].variants[0].price, 24250);
  assert.ok(imported.updatedAt);
  revised.items[0].variants[0].price = -100;
  writeFileSync(input, JSON.stringify(revised));
  await assert.rejects(importCatalog(), /Каталог не обновлён/);
  assert.deepEqual(await getCatalog(), imported);
});

