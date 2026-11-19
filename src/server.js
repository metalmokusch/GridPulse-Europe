import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, getCountries, getGenerationMix, getSummary } from './data/demo-data.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const MIME_TYPES = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const COUNTRY_CODES = new Set(getCountries().map(({ code }) => code));

function json(response, statusCode, value) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(value));
}

function serveStatic(pathname, response) {
  const requestPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = normalize(join(PUBLIC, requestPath));
  if (!filePath.startsWith(`${PUBLIC}/`)) return false;
  try {
    if (!statSync(filePath).isFile()) return false;
    response.writeHead(200, { 'content-type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff' });
    createReadStream(filePath).pipe(response);
    return true;
  } catch {
    return false;
  }
}

export function handleRequest(request, response) {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method !== 'GET') return json(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'This demo API is read-only.' } });

    if (url.pathname === '/health/live') return json(response, 200, { status: 'ok' });
    if (url.pathname === '/health/ready') return json(response, 200, { status: 'ready', persistence: 'fixture', provider: 'synthetic-demo' });
    if (url.pathname === '/api/v1/countries') return json(response, 200, { countries: getCountries() });
    if (url.pathname === '/api/v1/categories') return json(response, 200, { categories: CATEGORIES.map(({ id, ...category }) => ({ id, ...category })) });

    if (url.pathname === '/api/v1/dashboard/summary') {
      const requested = (url.searchParams.get('countries') ?? 'HU').split(',').map((code) => code.trim().toUpperCase()).filter(Boolean);
      const unique = [...new Set(requested)];
      if (!unique.length || unique.length > 3 || unique.some((code) => !COUNTRY_CODES.has(code))) {
        return json(response, 400, { error: { code: 'INVALID_COUNTRIES', message: 'Select between one and three supported demo countries.' } });
      }
      return json(response, 200, { generated_at_utc: new Date().toISOString(), data_status: 'synthetic', summary: getSummary(unique) });
    }

    const match = url.pathname.match(/^\/api\/v1\/countries\/([A-Z]{2})\/generation-mix(?:\/(latest))?$/);
    if (match) {
      const [, code, latest] = match;
      const series = getGenerationMix(code);
      if (!series) return json(response, 404, { error: { code: 'COUNTRY_NOT_FOUND', message: 'No demo fixture is available for this country.' } });
      return json(response, 200, latest ? { ...series, observations: series.observations.slice(-1) } : series);
    }

    if (url.pathname.startsWith('/api/')) return json(response, 404, { error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } });
    if (serveStatic(url.pathname, response)) return;
    json(response, 404, { error: { code: 'NOT_FOUND', message: 'Page not found.' } });
}

export function createAppServer() {
  return createServer(handleRequest);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createAppServer();
  const port = Number(process.env.PORT ?? 8787);
  server.listen(port, '0.0.0.0', () => console.log(`GridPulse Europe demo listening on http://localhost:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
