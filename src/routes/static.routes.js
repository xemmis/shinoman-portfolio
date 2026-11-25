import { readdirSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { Router } from 'express';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const staticFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'katalog/catalog.css',
  'katalog/catalog-page.mjs',
  'katalog/catalog-model.mjs',
];

// Явный allowlist: только перечисленные каталоги и файлы. Служебные
// каталоги (.data, src, tests, migrations, node_modules, .git) сюда не попадают.
const staticDirectories = [
  'assets',
  'zapis-na-shinomontazh',
  'katalog/shiny',
  'katalog/diski',
  'katalog/images',
];

function addFile(files, relativePath) {
  const type = mimeTypes[extname(relativePath).toLowerCase()];
  if (!type) return;
  const urlPath = `/${relativePath}`;
  const file = { body: readFileSync(resolve(root, relativePath)), type };
  files.set(urlPath, file);
  if (relativePath === 'index.html') {
    files.set('/', file);
  } else if (relativePath.endsWith('/index.html')) {
    files.set(urlPath.slice(0, -'index.html'.length), file);
  }
}

function addDirectory(files, relativeDirectory) {
  for (const entry of readdirSync(resolve(root, relativeDirectory), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) addDirectory(files, relativePath);
    else if (entry.isFile()) addFile(files, relativePath);
  }
}

function contentHeaders(type) {
  const withCharset = type.startsWith('text/') || type === 'application/json';
  return withCharset ? `${type}; charset=utf-8` : type;
}

function buildFileTable() {
  const files = new Map();
  for (const relativePath of staticFiles) addFile(files, relativePath);
  for (const relativeDirectory of staticDirectories) addDirectory(files, relativeDirectory);
  return files;
}

function searchOf(request) {
  return new URL(request.originalUrl, 'http://localhost').search;
}

export function createStaticRouter({ catalog }) {
  const router = Router({ strict: true, caseSensitive: true });
  const files = buildFileTable();

  router.get(['/katalog', '/katalog/'], (request, response) => {
    response.status(308).location(`/katalog/shiny/${searchOf(request)}`).end();
  });

  router.get(['/zapis-na-shinomontazh', '/katalog/shiny', '/katalog/diski'], (request, response) => {
    const { pathname } = new URL(request.originalUrl, 'http://localhost');
    response.status(308).location(`${pathname}/${searchOf(request)}`).end();
  });

  router.get('/katalog/data.json', (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(catalog.read());
  });

  for (const [urlPath, file] of files) {
    router.get(urlPath, (request, response) => {
      response.setHeader('Content-Type', contentHeaders(file.type));
      response.end(file.body);
    });
  }

  return router;
}
