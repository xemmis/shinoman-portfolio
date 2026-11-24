import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateCatalog } from './catalog-model.mjs';

const defaultPath = fileURLToPath(new URL('../.data/catalog.sqlite', import.meta.url));
const seed = new URL('./data.json', import.meta.url);

export function openCatalog(path = process.env.CATALOG_DB_PATH || defaultPath) {
  const databasePath = resolve(path);
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS catalog_snapshot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL CHECK (json_valid(payload))
    ) STRICT;
  `);
  const select = database.prepare('SELECT payload FROM catalog_snapshot WHERE id = 1');
  const upsert = database.prepare(`
    INSERT INTO catalog_snapshot (id, payload) VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload
  `);
  const fallback = readFileSync(seed, 'utf8');

  return {
    read: () => select.get()?.payload ?? fallback,
    publish(data) {
      validateCatalog(data);
      // shortcut: publish a complete snapshot for the demo, move filtering into SQL when the real feed size is known.
      upsert.run(JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
    },
    close: () => database.close(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const input = process.argv[2];
  if (!input) {
    console.error('Запуск: node katalog/catalog-store.mjs путь-к-каталогу.json');
    process.exitCode = 1;
  } else {
    let catalog;
    try {
      const data = validateCatalog(JSON.parse(readFileSync(resolve(input), 'utf8')));
      catalog = openCatalog();
      catalog.publish(data);
      console.log(`Каталог обновлён. Моделей: ${data.items.length}, автомобилей: ${data.vehicles.length}.`);
    } catch (error) {
      console.error(`Каталог не обновлён. ${error.message}`);
      process.exitCode = 1;
    } finally {
      catalog?.close();
    }
  }
}
