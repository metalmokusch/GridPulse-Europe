import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Writable } from 'node:stream';
import { handleRequest } from '../src/server.js';

async function request(path, method = 'GET') {
  let body = '';
  const response = new Writable({ write(chunk, encoding, callback) { body += chunk.toString(); callback(); } });
  response.writeHead = (statusCode, headers) => { response.statusCode = statusCode; response.headers = headers; };
  const finished = once(response, 'finish');
  handleRequest({ url: path, method }, response);
  await finished;
  return {
    status: response.statusCode,
    headers: response.headers,
    text: body,
    json: () => JSON.parse(body)
  };
}

test('health endpoints distinguish liveness and demo readiness', async () => {
  const live = await request('/health/live');
  const ready = await request('/health/ready');
  assert.equal(live.status, 200);
  assert.deepEqual(live.json(), { status: 'ok' });
  assert.equal(ready.json().status, 'ready');
  assert.equal(ready.json().provider, 'synthetic-demo');
});

test('countries endpoint keeps country and demo zone metadata explicit', async () => {
  const result = await request('/api/v1/countries');
  assert.equal(result.status, 200);
  assert.deepEqual(result.json().countries.map(({ code }) => code), ['HU', 'AT', 'DE']);
  assert.equal(result.json().countries[0].provider_zone_code, 'HU (demo zone)');
  assert.equal(result.json().countries[0].data_status, 'synthetic');
});

test('category endpoint exposes a versioned normalized taxonomy', async () => {
  const result = await request('/api/v1/categories');
  assert.equal(result.status, 200);
  assert.equal(result.json().taxonomy_version, '1.0.0');
  assert.equal(result.json().categories.find(({ id }) => id === 'unknown').renewable, false);
  assert.equal(result.json().categories.find(({ id }) => id === 'wind_offshore').renewable, true);
});

test('generation mix provides 24 UTC periods with explicit units and synthetic status', async () => {
  const result = await request('/api/v1/countries/HU/generation-mix');
  assert.equal(result.status, 200);
  const { observations } = result.json();
  assert.equal(observations.length, 24);
  const latest = observations.at(-1);
  assert.equal(latest.unit, 'MW');
  assert.equal(latest.data_status, 'synthetic');
  assert.equal(latest.period_end_utc.endsWith('Z'), true);
  assert.equal(latest.total_mw, latest.values.reduce((sum, item) => sum + item.value, 0));
  assert.equal(latest.renewable_share_pct, Number(((latest.values.filter((item) => item.renewable).reduce((sum, item) => sum + item.value, 0) / latest.total_mw) * 100).toFixed(1)));
});

test('summary rejects unknown countries and returns selected summaries', async () => {
  const valid = await request('/api/v1/dashboard/summary?countries=HU,AT');
  assert.equal(valid.status, 200);
  assert.deepEqual(valid.json().summary.map(({ code }) => code), ['HU', 'AT']);
  assert.equal(valid.json().summary[0].latest.period_end_utc, valid.json().summary[1].latest.period_end_utc);
  const invalid = await request('/api/v1/dashboard/summary?countries=HU,XX');
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json().error.code, 'INVALID_COUNTRIES');
});

test('read-only API, static dashboard assets, and unknown routes behave predictably', async () => {
  const method = await request('/api/v1/countries', 'POST');
  assert.equal(method.status, 405);
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.text, /Illustrative demo data/);
  const script = await request('/app.js');
  assert.match(script.headers['content-type'], /javascript/);
  const missing = await request('/api/v1/no-such-route');
  assert.equal(missing.status, 404);
  assert.equal(missing.json().error.code, 'NOT_FOUND');
});
