import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchEntsoeGeneration } from '../src/providers/entsoe/client.js';

async function withClientEnvironment({ fetchImpl, token = 'test-only-token' }, callback) {
  const oldTokenFile = process.env.ENTSOE_API_TOKEN_FILE;
  const oldToken = process.env.ENTSOE_API_TOKEN;
  const oldFetch = globalThis.fetch;
  delete process.env.ENTSOE_API_TOKEN_FILE;
  if (token === null) delete process.env.ENTSOE_API_TOKEN;
  else process.env.ENTSOE_API_TOKEN = token;
  globalThis.fetch = fetchImpl;
  try {
    return await callback();
  } finally {
    globalThis.fetch = oldFetch;
    if (oldTokenFile === undefined) delete process.env.ENTSOE_API_TOKEN_FILE;
    else process.env.ENTSOE_API_TOKEN_FILE = oldTokenFile;
    if (oldToken === undefined) delete process.env.ENTSOE_API_TOKEN;
    else process.env.ENTSOE_API_TOKEN = oldToken;
  }
}

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

test('live client classifies HTTP failures without retaining provider response text', async () => {
  await withClientEnvironment({
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => 'private provider response details' })
  }, async () => {
    await assert.rejects(
      fetchEntsoeGeneration({ countryCode: 'HU', sourceZone: '10YHU-MAVIR----U', now: new Date('2026-11-21T17:20:00.000Z') }),
      (error) => error.qualityCode === 'HTTP_503' && !error.message.includes('private provider response details')
    );
  });
});

test('live client assigns safe codes to provider transport, response, rejection, and token failures', async () => {
  const base = { countryCode: 'HU', sourceZone: '10YHU-MAVIR----U', now: new Date('2026-11-21T17:20:00.000Z') };
  const cases = [
    ['network', async () => { throw new TypeError('private response includes test-only-token'); }, 'NETWORK_ERROR'],
    ['timeout', async () => { const error = new Error('private timeout detail'); error.name = 'TimeoutError'; throw error; }, 'REQUEST_TIMEOUT'],
    ['response read', async () => ({ ok: true, text: async () => { throw new Error('private response detail'); } }), 'RESPONSE_READ_ERROR'],
    ['empty response', async () => ({ ok: true, text: async () => '<Publication_MarketDocument/>' }), 'EMPTY_RESPONSE'],
    ['provider rejection', async () => ({ ok: true, text: async () => '<Acknowledgement_MarketDocument><Reason><code>999</code><text>private provider details</text></Reason></Acknowledgement_MarketDocument>' }), 'PROVIDER_REJECTED'],
    ['invalid data', async () => ({ ok: true, text: async () => '<Publication_MarketDocument><TimeSeries><MktPSRType><psrType>B16</psrType></MktPSRType><Period><start>bad</start><resolution>PT15M</resolution><Point><position>1</position><quantity>1</quantity></Point></Period></TimeSeries></Publication_MarketDocument>' }), 'INVALID_RESPONSE']
  ];

  for (const [label, fetchImpl, expectedCode] of cases) {
    await withClientEnvironment({ fetchImpl }, async () => {
      await assert.rejects(fetchEntsoeGeneration(base), (error) =>
        error.qualityCode === expectedCode && !error.message.includes('private') && !error.message.includes('test-only-token'), label);
    });
  }

  await withClientEnvironment({ fetchImpl: async () => { throw new Error('must not send without token'); }, token: null }, async () => {
    await assert.rejects(fetchEntsoeGeneration(base), (error) => error.qualityCode === 'TOKEN_UNAVAILABLE');
  });
});
