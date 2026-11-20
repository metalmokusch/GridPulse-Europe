import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchEntsoeGeneration } from '../src/providers/entsoe/client.js';

test('live client uses the local token, requests a 24-hour window, caches no values, and preserves missing slots', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gridpulse-entsoe-'));
  const tokenFile = join(directory, 'token');
  await writeFile(tokenFile, 'test-secret-token', { mode: 0o600 });
  const oldTokenFile = process.env.ENTSOE_API_TOKEN_FILE;
  const oldToken = process.env.ENTSOE_API_TOKEN;
  const oldFetch = globalThis.fetch;
  process.env.ENTSOE_API_TOKEN_FILE = tokenFile;
  delete process.env.ENTSOE_API_TOKEN;
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = new URL(url);
    return {
      ok: true,
      status: 200,
      text: async () => `<Publication_MarketDocument>
        <TimeSeries><MktPSRType><psrType>B16</psrType></MktPSRType><Period>
          <start>2026-11-20T17:00Z</start><end>2026-11-21T17:00Z</end><resolution>PT15M</resolution>
          <Point><position>1</position><quantity>42</quantity></Point>
          <Point><position>96</position><quantity>84</quantity></Point>
        </Period></TimeSeries>
      </Publication_MarketDocument>`
    };
  };

  try {
    const result = await fetchEntsoeGeneration({ countryCode: 'HU', sourceZone: '10YHU-MAVIR----U', now: new Date('2026-11-21T17:20:00.000Z') });
    assert.equal(requestUrl.searchParams.get('securityToken'), 'test-secret-token');
    assert.equal(requestUrl.searchParams.get('periodStart'), '202611201700');
    assert.equal(requestUrl.searchParams.get('periodEnd'), '202611211700');
    assert.equal(result.observations.length, 96);
    assert.deepEqual(result.observations[0].values.map(({ value }) => value), [42]);
    assert.deepEqual(result.observations[1].values, []);
    assert.equal(result.observations[1].total_mw, null);
    assert.deepEqual(result.observations.at(-1).values.map(({ value }) => value), [84]);
    assert.equal(result.observations[0].coverage_complete, false);
    assert.equal(result.source.provider, 'entsoe');
    assert.equal(JSON.stringify(result).includes('test-secret-token'), false);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldTokenFile === undefined) delete process.env.ENTSOE_API_TOKEN_FILE;
    else process.env.ENTSOE_API_TOKEN_FILE = oldTokenFile;
    if (oldToken === undefined) delete process.env.ENTSOE_API_TOKEN;
    else process.env.ENTSOE_API_TOKEN = oldToken;
    await rm(directory, { recursive: true, force: true });
  }
});

test('live client refuses unvalidated zones before making a request', async () => {
  await assert.rejects(fetchEntsoeGeneration({ countryCode: 'AT', sourceZone: '10YAT-APG------L' }), /only the validated HU/);
});
