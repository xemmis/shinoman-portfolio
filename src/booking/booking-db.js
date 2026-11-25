import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const schema = `
  PRAGMA busy_timeout = 5000;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS bookings (
    request_id TEXT PRIMARY KEY NOT NULL,
    location TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    car TEXT NOT NULL,
    plate TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(location, date, time)
  ) STRICT;
`;

export function openBookingDb(path) {
  const databasePath = resolve(path);
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });

  const database = new DatabaseSync(databasePath);
  database.exec(schema);

  return {
    database,
    reserved: database.prepare('SELECT date, time FROM bookings WHERE location = ? AND date BETWEEN ? AND ?'),
    save: database.prepare(`
      INSERT INTO bookings (request_id, location, date, time, name, phone, car, plate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `),
    findRequest: database.prepare('SELECT location, date, time, name, phone, car, plate FROM bookings WHERE request_id = ?'),
    close: () => database.close(),
  };
}
