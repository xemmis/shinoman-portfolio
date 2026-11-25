import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openBookingDb } from '../../src/booking/booking-db.js';

test('booking database keeps the legacy schema and pragmas', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'shinoman-db-'));
  const bookingDb = openBookingDb(join(directory, 'bookings.sqlite'));
  context.after(() => {
    bookingDb.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const columns = bookingDb.database.prepare('PRAGMA table_info(bookings)').all()
    .map(({ name, type, notnull, pk }) => [name, type, notnull, pk]);
  assert.deepEqual(columns, [
    ['request_id', 'TEXT', 1, 1],
    ['location', 'TEXT', 1, 0],
    ['date', 'TEXT', 1, 0],
    ['time', 'TEXT', 1, 0],
    ['name', 'TEXT', 1, 0],
    ['phone', 'TEXT', 1, 0],
    ['car', 'TEXT', 1, 0],
    ['plate', 'TEXT', 1, 0],
    ['created_at', 'TEXT', 1, 0],
  ]);

  const uniqueIndexes = bookingDb.database.prepare("PRAGMA index_list('bookings')").all()
    .filter(({ unique }) => unique === 1);
  assert.equal(uniqueIndexes.length, 2, 'PK и UNIQUE(location, date, time)');
  assert.equal(bookingDb.database.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.equal(bookingDb.database.prepare('PRAGMA busy_timeout').get().timeout, 5000);
});
