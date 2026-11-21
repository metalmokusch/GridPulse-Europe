import test from 'node:test';
import assert from 'node:assert/strict';

class MockElement {
  constructor() {
    this.value = '';
    this.innerHTML = '';
    this.textContent = '';
    this.hidden = false;
    this.attributes = {};
    this.listeners = {};
    this.classList = { add() {}, remove() {} };
  }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  querySelectorAll() { return []; }
}

async function renderApp({ provider, freshness, includePumping = false }) {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new MockElement());
    return elements.get(selector);
  };
  globalThis.document = { querySelector: element };
  globalThis.window = {
    location: { href: `http://localhost/${includePumping ? '?sources=solar,hydro_pumped_storage' : ''}`, search: includePumping ? '?sources=solar,hydro_pumped_storage' : '', pathname: '/' },
    history: { replaceState() {} }
  };
  globalThis.setInterval = () => 1;
  element('#quality-monitor').hidden = true;
  const observation = {
    period_start_utc: '2026-11-20T16:30:00.000Z',
    period_end_utc: '2026-11-20T16:45:00.000Z',
    fetched_at_utc: '2026-11-20T17:00:00.000Z',
    total_mw: 20,
    renewable_share_pct: provider === 'entsoe' ? null : 25,
    coverage_complete: provider !== 'entsoe',
    values: [
      { category: 'solar', label: 'Solar', value: 5, renewable: true },
      ...(includePumping ? [{ category: 'hydro_pumped_storage', label: 'Pumped hydro storage (net)', value: -12, renewable: false }] : [])
    ]
  };
  const summaryItem = {
    code: 'HU',
    name: 'Hungary',
    provider_zone_code: provider === 'entsoe' ? '10YHU-MAVIR----U' : 'HU (demo zone)',
    latest: observation,
    source: {
      provider,
      label: provider === 'entsoe' ? 'ENTSO-E Transparency Platform' : 'Illustrative synthetic fixture',
      freshness: provider === 'entsoe' ? { status: freshness } : undefined
    }
  };
  const payloads = {
    '/api/v1/countries': { countries: [{ code: 'HU', name: 'Hungary', provider_zone_code: summaryItem.provider_zone_code }] },
    '/api/v1/dashboard/summary?countries=HU': { summary: [summaryItem] },
    '/api/v1/countries/HU/generation-mix': {
      country: { code: 'HU', name: 'Hungary', provider_zone_code: summaryItem.provider_zone_code },
      source: summaryItem.source,
      observations: [{ ...observation, values: observation.values.map((value) => ({ ...value, color: '#f2bb63' })) }]
    },
    '/api/v1/monitoring/quality': includePumping ? { monitoring: {
      checks: 4,
      successes: 3,
      failures: 1,
      success_rate_pct: 75,
      mean_matured_interval_pct: 100,
      failure_codes: { HTTP_503: 1 },
      latest_success: {
        checked_at_utc: '2026-11-20T17:00:00.000Z',
        freshness_minutes: 30,
        intervals_observed: 94,
        intervals_expected: 96,
        intervals_matured_observed: 92,
        intervals_matured_expected: 92,
        intervals_missing_matured: 0,
        intervals_pending: 4,
        intervals_pending_observed: 2,
        source_categories: ['B10', 'B16'],
        sparse_category_ids: []
      }
    } } : undefined
  };
  globalThis.fetch = async (path) => ({ ok: true, json: async () => payloads[path] });
  await import(`../public/app.js?ui-${provider}-${freshness}`);
  for (let attempt = 0; attempt < 50 && (element('#dashboard-content').getAttribute('aria-busy') !== 'false'
    || (includePumping && element('#quality-monitor').hidden)); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(element('#dashboard-content').getAttribute('aria-busy'), 'false');
  return elements;
}

test('dashboard renders demo and live source/freshness states without runtime reference errors', async () => {
  const demo = await renderApp({ provider: 'synthetic-demo', freshness: 'unknown' });
  assert.match(demo.get('#demo-pill').innerHTML, /DEMO DATA/);
  assert.equal(demo.get('#demo-notice').hidden, false);
  assert.equal(demo.get('#live-notice').hidden, true);
  assert.match(demo.get('#source-meta').textContent, /Illustrative synthetic fixture/);

  const live = await renderApp({ provider: 'entsoe', freshness: 'delayed' });
  assert.match(live.get('#demo-pill').innerHTML, /ENTSO-E · DELAYED/);
  assert.equal(live.get('#demo-notice').hidden, true);
  assert.equal(live.get('#live-notice').hidden, false);
  assert.match(live.get('#system-title').textContent, /ENTSO-E · Delayed/);
  assert.match(live.get('#kpis').innerHTML, /coverage incomplete/);
  assert.match(live.get('#source-meta').textContent, /fetched/);
});

test('dashboard renders negative pumped-storage values in the signed chart and source table', async () => {
  const live = await renderApp({ provider: 'entsoe', freshness: 'fresh', includePumping: true });
  assert.match(live.get('#chart-wrap').innerHTML, /Pumped hydro storage \(net\): -12 MW/);
  assert.match(live.get('#legend').innerHTML, /Pumped hydro storage \(net\)/);
  assert.match(live.get('#table-body').innerHTML, /-12 <span>MW<\/span>/);
  assert.match(live.get('#quality-stats').innerHTML, /94\/96/);
  assert.match(live.get('#quality-stats').innerHTML, /92\/92/);
  assert.match(live.get('#quality-pending').textContent, /4 recent intervals.*2 already have data.*0 intervals older/);
  assert.match(live.get('#quality-failures').textContent, /HTTP_503 \(1\)/);
});
