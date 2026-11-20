import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCountries, getGenerationMix, getSummary } from './data/demo-data.js';
import { getCategoryTaxonomy, TAXONOMY_VERSION } from './domain/categories.js';
import { classifyFreshness } from './domain/freshness.js';
import { fetchEntsoeGeneration } from './providers/entsoe/client.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const MIME_TYPES = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const LIVE_MODE = process.env.GRIDPULSE_DATA_SOURCE === 'entsoe';
const COUNTRY_CODES = new Set((LIVE_MODE ? ['HU'] : getCountries().map(({ code }) => code)));
let liveCache;
let liveCacheExpiresAt = 0;
let liveFetch;

function liveSourceWithFreshness(mix) {
  const latest = [...mix.observations].reverse().find(({ values }) => values.length > 0);
  const freshness = classifyFreshness(latest?.period_end_utc ?? null, {
    freshForMs: 90 * 60_000,
    staleAfterMs: 3 * 60 * 60_000
  });
  return { ...mix, source: { ...mix.source, freshness } };
}

async function getLiveMix({ force = false } = {}) {
  if (!force && liveCache && Date.now() < liveCacheExpiresAt) return liveCache;
  if (liveFetch) return liveFetch;
  liveFetch = fetchEntsoeGeneration({ countryCode: 'HU', sourceZone: '10YHU-MAVIR----U' });
  try {
    liveCache = await liveFetch;
    liveCacheExpiresAt = Date.now() + 5 * 60_000;
    return liveCache;
  } finally {
    liveFetch = undefined;
  }
}

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

export async function handleRequest(request, response) {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method !== 'GET') return json(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'This demo API is read-only.' } });

    if (url.pathname === '/health/live') return json(response, 200, { status: 'ok' });
    if (url.pathname === '/health/ready') return json(response, 200, { status: 'ready', persistence: LIVE_MODE ? 'none' : 'fixture', provider: LIVE_MODE ? 'entsoe' : 'synthetic-demo' });
    if (url.pathname === '/api/v1/countries') return json(response, 200, { countries: LIVE_MODE
      ? [{ code: 'HU', name: 'Hungary', provider_zone_code: '10YHU-MAVIR----U', data_status: 'actual' }]
      : getCountries() });
    if (url.pathname === '/api/v1/categories') return json(response, 200, { taxonomy_version: TAXONOMY_VERSION, categories: getCategoryTaxonomy() });

    if (url.pathname === '/api/v1/dashboard/summary') {
      const requested = (url.searchParams.get('countries') ?? 'HU').split(',').map((code) => code.trim().toUpperCase()).filter(Boolean);
      const unique = [...new Set(requested)];
      if (!unique.length || unique.length > 3 || unique.some((code) => !COUNTRY_CODES.has(code))) {
        return json(response, 400, { error: { code: 'INVALID_COUNTRIES', message: 'Select one to three supported countries.' } });
      }
      if (LIVE_MODE) {
        try {
          const force = url.searchParams.get('refresh') === 'true';
          const mix = liveSourceWithFreshness(await getLiveMix({ force }));
          const latest = [...mix.observations].reverse().find(({ values }) => values.length > 0);
          return json(response, 200, { generated_at_utc: mix.generated_at_utc, data_status: 'actual', summary: [{
            ...mix.country,
            latest,
            source: mix.source
          }] });
        } catch {
          return json(response, 502, { error: { code: 'PROVIDER_UNAVAILABLE', message: 'Live ENTSO-E data is temporarily unavailable.' } });
        }
      }
      return json(response, 200, { generated_at_utc: new Date().toISOString(), data_status: 'synthetic', summary: getSummary(unique) });
    }

    const match = url.pathname.match(/^\/api\/v1\/countries\/([A-Z]{2})\/generation-mix(?:\/(latest))?$/);
    if (match) {
      const [, code, latest] = match;
      if (LIVE_MODE && code !== 'HU') return json(response, 404, { error: { code: 'COUNTRY_NOT_FOUND', message: 'Live ENTSO-E mode currently supports Hungary only.' } });
      let series;
      if (LIVE_MODE) {
        try {
          const force = url.searchParams.get('refresh') === 'true';
          series = liveSourceWithFreshness(await getLiveMix({ force }));
        } catch {
          return json(response, 502, { error: { code: 'PROVIDER_UNAVAILABLE', message: 'Live ENTSO-E data is temporarily unavailable.' } });
        }
      } else {
        series = getGenerationMix(code);
      }
      if (!series) return json(response, 404, { error: { code: 'COUNTRY_NOT_FOUND', message: 'No demo fixture is available for this country.' } });
      if (latest && LIVE_MODE) {
        const lastObserved = [...series.observations].reverse().find(({ values }) => values.length > 0);
        return json(response, 200, { ...series, observations: lastObserved ? [lastObserved] : [] });
      }
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
  const bindAddress = process.env.GRIDPULSE_BIND_ADDRESS ?? '127.0.0.1';
  server.listen(port, bindAddress, () => console.log(`GridPulse Europe listening on http://${bindAddress}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
