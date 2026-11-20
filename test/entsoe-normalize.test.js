import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEntsoeGeneration } from '../src/providers/entsoe/normalize-generation.js';

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

test('keeps ambiguous source categories unknown and reports their source identifiers', () => {
  const result = normalizeEntsoeGeneration(xmlFor([
    { category: 'B15', points: [{ position: 1, quantity: '8' }] },
    { category: 'B17', points: [{ position: 1, quantity: '9' }] },
    { category: 'B20', points: [{ position: 1, quantity: '10' }] },
    { category: 'B99', points: [{ position: 1, quantity: '11' }] }
  ]), { sourceZone: '10YHU-MAVIR----U', fetchedAtUtc: FETCHED_AT });

  assert.deepEqual(result.observations.map(({ source_category, normalized_category }) => [source_category, normalized_category]), [
    ['B15', 'unknown'], ['B17', 'unknown'], ['B20', 'unknown'], ['B99', 'unknown']
  ]);
  assert.deepEqual(result.warnings, [
    'unmapped_source_category:B15', 'unmapped_source_category:B17',
    'unmapped_source_category:B20', 'unmapped_source_category:B99',
    'coverage_not_attested', 'missing_points_not_filled'
  ]);
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
