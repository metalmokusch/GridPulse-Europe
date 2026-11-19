import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_TAXONOMY, isRenewableCategory, TAXONOMY_VERSION } from '../src/domain/categories.js';
import { normalizeGenerationObservation, summarizeGenerationMix } from '../src/domain/observation.js';

const baseObservation = {
  provider: 'test-provider',
  provider_dataset: 'generation-test-v1',
  source_zone: 'TEST-BZN',
  period_start_utc: '2026-11-19T10:00:00Z',
  period_end_utc: '2026-11-19T11:00:00Z',
  source_published_at_utc: null,
  fetched_at_utc: '2026-11-19T11:10:00Z',
  source_category: 'SOLAR',
  normalized_category: 'solar',
  taxonomy_version: TAXONOMY_VERSION,
  value: 25,
  unit: 'MW',
  data_status: 'actual',
  quality_flags: []
};

function observation(overrides = {}) {
  return normalizeGenerationObservation({ ...baseObservation, ...overrides });
}

test('taxonomy is versioned and renewable categories are explicit', () => {
  assert.equal(TAXONOMY_VERSION, '1.0.0');
  assert.deepEqual(CATEGORY_TAXONOMY.map(({ id }) => id), [
    'solar', 'wind_onshore', 'wind_offshore', 'hydro', 'biomass', 'geothermal',
    'nuclear', 'coal', 'gas', 'oil', 'other_fossil', 'other', 'unknown'
  ]);
  assert.equal(isRenewableCategory('nuclear'), false);
  assert.equal(isRenewableCategory('wind_offshore'), true);
});

test('observation normalization preserves source fields and canonicalizes UTC timestamps', () => {
  const result = observation({
    period_start_utc: '2026-11-19T10:00:00Z',
    period_end_utc: '2026-11-19T11:00:00.1Z',
    quality_flags: [' preliminary ', 'preliminary']
  });
  assert.equal(result.period_end_utc, '2026-11-19T11:00:00.100Z');
  assert.equal(result.source_category, 'SOLAR');
  assert.deepEqual(result.quality_flags, ['preliminary']);
});

test('unknown source categories stay unknown rather than being guessed', () => {
  const result = observation({ source_category: 'NEW_PROVIDER_FUEL_CODE', normalized_category: 'unknown', value: 7 });
  assert.equal(result.source_category, 'NEW_PROVIDER_FUEL_CODE');
  assert.equal(result.normalized_category, 'unknown');
});

test('observations reject invalid UTC timestamps, intervals, units, statuses, and values', () => {
  assert.throws(() => observation({ period_start_utc: '2026-11-19T10:00:00+01:00' }), /UTC timestamp/);
  assert.throws(() => observation({ period_start_utc: '2026-02-30T10:00:00Z' }), /calendar timestamp/);
  assert.throws(() => observation({ period_end_utc: '2026-11-19T10:00:00Z' }), /later than/);
  assert.throws(() => observation({ unit: 'kW' }), /unit must/);
  assert.throws(() => observation({ data_status: 'estimated-ish' }), /data_status must/);
  assert.throws(() => observation({ value: -0.1 }), /non-negative/);
  assert.throws(() => observation({ value: Number.NaN }), /finite/);
  assert.throws(() => observation({ normalized_category: 'made_up' }), /normalized_category/);
  assert.throws(() => observation({ taxonomy_version: '0.9.0' }), /taxonomy_version/);
});

test('mix summary computes renewable share only for complete, known coverage', () => {
  const rows = [
    observation({ source_category: 'SOLAR', normalized_category: 'solar', value: 25 }),
    observation({ source_category: 'WIND', normalized_category: 'wind_onshore', value: 15 }),
    observation({ source_category: 'GAS', normalized_category: 'gas', value: 60 })
  ];
  const result = summarizeGenerationMix(rows, { coverage_complete: true });
  assert.equal(result.total_value, 100);
  assert.equal(result.renewable_value, 40);
  assert.equal(result.renewable_share_pct, 40);
  assert.equal(result.share_unavailable_reason, null);

  const incomplete = summarizeGenerationMix(rows);
  assert.equal(incomplete.renewable_share_pct, null);
  assert.equal(incomplete.share_unavailable_reason, 'incomplete_coverage');
});

test('mix summary with unknown categories or a zero denominator never invents a percentage', () => {
  const unknown = summarizeGenerationMix([
    observation({ normalized_category: 'solar', value: 20 }),
    observation({ source_category: 'FUEL_X', normalized_category: 'unknown', value: 80 })
  ], { coverage_complete: true });
  assert.equal(unknown.renewable_share_pct, null);
  assert.equal(unknown.share_unavailable_reason, 'unknown_categories');

  const zero = summarizeGenerationMix([
    observation({ normalized_category: 'solar', value: 0 }),
    observation({ normalized_category: 'gas', value: 0 })
  ], { coverage_complete: true });
  assert.equal(zero.renewable_share_pct, null);
  assert.equal(zero.share_unavailable_reason, 'zero_total');
});

test('mix summary rejects rows from different zones, periods, units, or data statuses', () => {
  assert.throws(() => summarizeGenerationMix([observation(), observation({ source_zone: 'OTHER-BZN' })]), /share provider/);
  assert.throws(() => summarizeGenerationMix([observation(), observation({ period_end_utc: '2026-11-19T12:00:00Z' })]), /share provider/);
  assert.throws(() => summarizeGenerationMix([observation(), observation({ unit: 'MWh' })]), /share provider/);
  assert.throws(() => summarizeGenerationMix([observation(), observation({ data_status: 'forecast' })]), /share provider/);
  assert.throws(() => summarizeGenerationMix([observation(), observation({ taxonomy_version: '0.9.0' })]), /taxonomy_version/);
});
