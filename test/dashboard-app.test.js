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

async function renderApp({ provider, freshness }) {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new MockElement());
    return elements.get(selector);
  };
  globalThis.document = { querySelector: element };
  globalThis.window = {
    location: { href: 'http://localhost/', search: '', pathname: '/' },
    history: { replaceState() {} }
  };
  globalThis.setInterval = () => 1;
  const observation = {
    period_start_utc: '2026-11-20T16:30:00.000Z',
    period_end_utc: '2026-11-20T16:45:00.000Z',
    fetched_at_utc: '2026-11-20T17:00:00.000Z',
    total_mw: 20,
    renewable_share_pct: provider === 'entsoe' ? null : 25,
    coverage_complete: provider !== 'entsoe',
    values: [{ category: 'solar', label: 'Solar', value: 5, renewable: true }]
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
    }
  };
  globalThis.fetch = async (path) => ({ ok: true, json: async () => payloads[path] });
  await import(`../public/app.js?ui-${provider}-${freshness}`);
  for (let attempt = 0; attempt < 50 && element('#dashboard-content').getAttribute('aria-busy') !== 'false'; attempt += 1) {
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
