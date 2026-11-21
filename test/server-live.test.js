import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Writable } from 'node:stream';

const previousMode = process.env.GRIDPULSE_DATA_SOURCE;
process.env.GRIDPULSE_DATA_SOURCE = 'entsoe';
const { handleRequest } = await import('../src/server.js?live-integration-test');
if (previousMode === undefined) delete process.env.GRIDPULSE_DATA_SOURCE;
else process.env.GRIDPULSE_DATA_SOURCE = previousMode;

async function request(path) {
  let body = '';
  const response = new Writable({ write(chunk, encoding, callback) { body += chunk.toString(); callback(); } });
  response.writeHead = (statusCode, headers) => { response.statusCode = statusCode; response.headers = headers; };
  const finished = once(response, 'finish');
  await handleRequest({ url: path, method: 'GET' }, response);
  await finished;
  return { status: response.statusCode, json: JSON.parse(body) };
}

function asEntsoeTimestamp(parameter) {
  return `${parameter.slice(0, 4)}-${parameter.slice(4, 6)}-${parameter.slice(6, 8)}T${parameter.slice(8, 10)}:${parameter.slice(10, 12)}Z`;
}

test('private live routes expose configured countries, compute renewable share, cache requests, and force refresh on demand', async () => {
  const oldFetch = globalThis.fetch;
  const oldToken = process.env.ENTSOE_API_TOKEN;
  process.env.ENTSOE_API_TOKEN = 'test-only-token';
  let fetchCount = 0;
  globalThis.fetch = async (url) => {
    fetchCount += 1;
    const params = new URL(url).searchParams;
    return {
      ok: true,
      status: 200,
      text: async () => `<Publication_MarketDocument><TimeSeries>
        <MktPSRType><psrType>B16</psrType></MktPSRType><Period>
          <start>${asEntsoeTimestamp(params.get('periodStart'))}</start>
          <end>${asEntsoeTimestamp(params.get('periodEnd'))}</end>
          <resolution>PT15M</resolution>
          <Point><position>96</position><quantity>7</quantity></Point>
        </Period></TimeSeries></Publication_MarketDocument>`
    };
  };

  try {
    const [ready, countries, summary, series] = await Promise.all([
      request('/health/ready'),
      request('/api/v1/countries'),
      request('/api/v1/dashboard/summary?countries=HU'),
      request('/api/v1/countries/HU/generation-mix')
    ]);
    assert.deepEqual(ready.json, { status: 'ready', persistence: 'none', provider: 'entsoe' });
    assert.ok(countries.json.countries.some(({ code }) => code === 'HU'));
    assert.ok(countries.json.countries.some(({ code }) => code === 'AT'));
    assert.ok(countries.json.countries.some(({ code }) => code === 'DE'));
    assert.equal(summary.status, 200);
    assert.equal(summary.json.summary[0].latest.renewable_share_pct, 100);
    assert.equal(summary.json.summary[0].latest.coverage_complete, false);
    assert.equal(summary.json.summary[0].source.freshness.status, 'fresh');
    assert.equal(series.json.observations.length, 96);
    assert.equal(series.json.observations[94].values.length, 0);
    assert.equal(series.json.observations[95].values[0].value, 7);
    assert.equal(fetchCount, 1, 'parallel initial requests should share a single provider fetch');

    await request('/api/v1/dashboard/summary?countries=HU&refresh=true');
    assert.equal(fetchCount, 2, 'manual refresh must bypass the memory cache');
    const unsupported = await request('/api/v1/dashboard/summary?countries=ZZ');
    assert.equal(unsupported.status, 400);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.ENTSOE_API_TOKEN;
    else process.env.ENTSOE_API_TOKEN = oldToken;
  }
});
