import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDashboardState, serializeDashboardState } from '../public/dashboard-state.js';

const countryCodes = ['HU', 'AT', 'DE'];
const sourceIds = ['wind_onshore', 'solar', 'hydro', 'nuclear', 'gas', 'coal'];

test('dashboard URL state defaults when parameters are absent', () => {
  assert.deepEqual(parseDashboardState('', { countryCodes, sourceIds }), {
    countries: ['HU'], hours: 24, sources: sourceIds
  });
});

test('dashboard URL state restores valid country, period, and source selections', () => {
  assert.deepEqual(parseDashboardState('?countries=at,de&hours=12&sources=solar,gas', { countryCodes, sourceIds }), {
    countries: ['AT', 'DE'], hours: 12, sources: ['solar', 'gas']
  });
});

test('invalid and duplicate parameters fall back independently to defaults', () => {
  assert.deepEqual(parseDashboardState('?countries=HU,HU,XX&hours=8&sources=solar,solar', { countryCodes, sourceIds }), {
    countries: ['HU'], hours: 24, sources: sourceIds
  });
});

test('URL serialization omits defaults and preserves unrelated query and fragment', () => {
  const path = serializeDashboardState({ countries: ['AT', 'DE'], hours: 6, sources: ['solar'] },
    'https://example.test/dashboard?theme=dark#chart', { allSources: sourceIds });
  assert.equal(path, '/dashboard?theme=dark&countries=AT%2CDE&hours=6&sources=solar#chart');
  assert.equal(serializeDashboardState({ countries: ['HU'], hours: 24, sources: sourceIds },
    'https://example.test/?theme=dark', { allSources: sourceIds }), '/?theme=dark');
});
