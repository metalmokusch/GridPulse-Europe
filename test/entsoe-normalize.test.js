import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEntsoeGeneration } from '../src/providers/entsoe/normalize-generation.js';
import { ENTSOE_PSR_TYPES } from '../src/providers/entsoe/psr-types.js';

const FETCHED_AT = '2026-11-20T17:05:00.000Z';

function xmlFor(series) {
  return `<Publication_MarketDocument>${series.map(({ category, start = '2026-11-20T14:00Z', end = '2026-11-20T16:45Z', points }) => `
    <TimeSeries><MktPSRType><psrType>${category}</psrType></MktPSRType><Period>
      <start>${start}</start><end>${end}</end><resolution>PT15M</resolution>
      ${points.map(({ position, quantity }) => `<Point><position>${position}</position><quantity>${quantity}</quantity></Point>`).join('')}
    </Period></TimeSeries>`).join('')}</Publication_MarketDocument>`;
}

test('normalizes ENTSO-E 15-minute points with UTC source periods and explicit provenance', () => {
  const result = normalizeEntsoeGeneration(xmlFor([{
    category: 'B16',
    points: [{ position: 1, quantity: '123.4' }, { position: 11, quantity: '234.5' }]
  }]), { sourceZone: '10YHU-MAVIR----U', fetchedAtUtc: FETCHED_AT });

  assert.equal(result.observations.length, 2);
  assert.deepEqual(result.observations.map(({ period_start_utc, period_end_utc }) => [period_start_utc, period_end_utc]), [
    ['2026-11-20T14:00:00.000Z', '2026-11-20T14:15:00.000Z'],
    ['2026-11-20T16:30:00.000Z', '2026-11-20T16:45:00.000Z']
  ]);
  assert.equal(result.observations[0].normalized_category, 'solar');
  assert.equal(result.observations[0].value, 123.4);
  assert.equal(result.observations[0].unit, 'MW');
  assert.equal(result.observations[0].data_status, 'actual');
  assert.equal(result.observations[0].source_zone, '10YHU-MAVIR----U');
  assert.equal(result.observations[0].fetched_at_utc, FETCHED_AT);
  assert.equal(result.coverage_complete, false);
});

test('maps ENTSO-E other renewable and other non-renewable types, and keeps mixed waste unclassified', () => {
  const result = normalizeEntsoeGeneration(xmlFor([
    { category: 'B15', points: [{ position: 1, quantity: '8' }] },
    { category: 'B17', points: [{ position: 1, quantity: '9' }] },
    { category: 'B20', points: [{ position: 1, quantity: '10' }] },
    { category: 'B99', points: [{ position: 1, quantity: '11' }] }
  ]), { sourceZone: '10YHU-MAVIR----U', fetchedAtUtc: FETCHED_AT });

  assert.deepEqual(result.observations.map(({ source_category, normalized_category }) => [source_category, normalized_category]), [
    ['B15', 'other_renewable'], ['B17', 'unknown'], ['B20', 'other'], ['B99', 'unknown']
  ]);
  assert.deepEqual(result.observations.map(({ quality_flags }) => quality_flags.includes('entsoe_source_category_unclassified:B17')),
    [false, true, false, false]);
  assert.deepEqual(result.warnings, [
    'unclassified_source_category:B17', 'unmapped_source_category:B99',
    'coverage_not_attested', 'missing_points_not_filled'
  ]);
});

test('covers all ENTSO-E PSR codes and retains signed pumped-storage observations', () => {
  const expected = [
    ['B01', 'biomass'], ['B02', 'coal'], ['B03', 'other_fossil'], ['B04', 'gas'],
    ['B05', 'coal'], ['B06', 'oil'], ['B07', 'other_fossil'], ['B08', 'other_fossil'],
    ['B09', 'geothermal'], ['B10', 'hydro_pumped_storage'], ['B11', 'hydro'], ['B12', 'hydro'],
    ['B13', 'other_renewable'], ['B14', 'nuclear'], ['B15', 'other_renewable'], ['B16', 'solar'],
    ['B17', 'unknown'], ['B18', 'wind_offshore'], ['B19', 'wind_onshore'], ['B20', 'other']
  ];
  assert.deepEqual(Object.keys(ENTSOE_PSR_TYPES), expected.map(([category]) => category));
  const result = normalizeEntsoeGeneration(xmlFor(expected.map(([category], index) => ({
    category,
    points: [{ position: 1, quantity: category === 'B10' ? '-12' : String(index + 1) }]
  }))), { sourceZone: '10YHU-MAVIR----U', fetchedAtUtc: FETCHED_AT });

  assert.deepEqual(result.observations.map(({ source_category, normalized_category }) => [source_category, normalized_category]), expected);
  assert.equal(result.observations.find(({ source_category }) => source_category === 'B10').value, -12);
  assert.equal(result.warnings.includes('unmapped_source_category:B17'), false);
});

test('preserves sparse and repeated category series without filling missing points or merging series', () => {
  const result = normalizeEntsoeGeneration(xmlFor([
    { category: 'B06', start: '2026-11-20T14:00Z', end: '2026-11-20T14:15Z', points: [{ position: 1, quantity: '1' }] },
    { category: 'B06', start: '2026-11-20T14:30Z', end: '2026-11-20T16:45Z', points: [{ position: 1, quantity: '2' }] }
  ]), { sourceZone: '10YHU-MAVIR----U', fetchedAtUtc: FETCHED_AT });

  assert.equal(result.observations.length, 2);
  assert.deepEqual(result.observations.map(({ period_start_utc }) => period_start_utc), [
    '2026-11-20T14:00:00.000Z', '2026-11-20T14:30:00.000Z'
  ]);
  assert.notEqual(result.observations[0].quality_flags[2], result.observations[1].quality_flags[2]);
  assert.equal(result.warnings.includes('missing_points_not_filled'), true);
  assert.equal(result.coverage_complete, false);
});

test('rejects invalid response values, periods, resolutions, source zone, and empty responses', () => {
  assert.throws(() => normalizeEntsoeGeneration('<Publication_MarketDocument/>', { sourceZone: 'HU' }), /no TimeSeries/);
  assert.throws(() => normalizeEntsoeGeneration(xmlFor([{ category: 'B16', points: [{ position: 1, quantity: '-1' }] }]), { sourceZone: 'HU' }), /quantity/);
  assert.throws(() => normalizeEntsoeGeneration(xmlFor([{ category: 'B16', points: [{ position: 0, quantity: '1' }] }]), { sourceZone: 'HU' }), /position/);
  assert.throws(() => normalizeEntsoeGeneration('<TimeSeries><psrType>B16</psrType><Period><start>2026-11-20T14:00Z</start><resolution>PT0M</resolution><Point><position>1</position><quantity>1</quantity></Point></Period></TimeSeries>', { sourceZone: 'HU' }), /resolution/);
  assert.throws(() => normalizeEntsoeGeneration(xmlFor([{ category: 'B16', points: [{ position: 1, quantity: '1' }] }]), {}), /sourceZone/);
});
