import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEntsoeResponse } from '../src/providers/entsoe/parse-response.js';

test('ENTSO-E parser extracts response metadata without exposing point values', () => {
  const xml = `<Publication_MarketDocument>
    <type>A75</type>
    <TimeSeries>
      <MktPSRType><psrType>B16</psrType></MktPSRType>
      <Period>
        <start>2026-11-20T13:00Z</start>
        <end>2026-11-20T16:00Z</end>
        <resolution>PT15M</resolution>
        <Point><position>1</position><quantity>123.45</quantity></Point>
        <Point><position>2</position><quantity>234.56</quantity></Point>
      </Period>
    </TimeSeries>
  </Publication_MarketDocument>`;

  assert.deepEqual(parseEntsoeResponse(xml), {
    document_type: 'A75',
    response_code: null,
    response_text: null,
    timeseries_count: 1,
    point_count: 2,
    categories: ['B16'],
    resolutions: ['PT15M'],
    resolution_minutes: [15],
    reported_periods: [{ start_utc: '2026-11-20T13:00Z', end_utc: '2026-11-20T16:00Z' }],
    category_coverage: [{ category: 'B16', timeseries_count: 1, period_count: 1, point_count: 2, periods: [{ start_utc: '2026-11-20T13:00Z', end_utc: '2026-11-20T16:00Z', resolution: 'PT15M', point_count: 2 }] }],
    series: [{
      category: 'B16',
      periods: [{
        start_utc: '2026-11-20T13:00Z',
        end_utc: '2026-11-20T16:00Z',
        resolution: 'PT15M',
        point_count: 2,
        first_position: 1,
        last_position: 2
      }]
    }]
  });
});

test('ENTSO-E parser reports acknowledgement errors and does not treat them as series', () => {
  const xml = '<Acknowledgement_MarketDocument><type>A01</type><Reason><code>999</code><text>Invalid period</text></Reason></Acknowledgement_MarketDocument>';
  const report = parseEntsoeResponse(xml);
  assert.equal(report.response_code, '999');
  assert.equal(report.response_text, 'Invalid period');
  assert.equal(report.timeseries_count, 0);
});

test('ENTSO-E parser reports resolution seconds without reading point values', () => {
  const report = parseEntsoeResponse('<Document><TimeSeries><Period><resolution>PT30S</resolution><Point><position>1</position><quantity>999</quantity></Point></Period></TimeSeries></Document>');
  assert.deepEqual(report.resolution_minutes, [0.5]);
  assert.equal(report.point_count, 1);
  assert.equal(Object.hasOwn(report, 'values'), false);
});

test('ENTSO-E parser associates periods and point positions with each category series', () => {
  const xml = `<Document><TimeSeries>
    <MktPSRType><psrType>B11</psrType></MktPSRType>
    <Period><start>2026-11-20T14:00Z</start><end>2026-11-20T14:15Z</end><resolution>PT15M</resolution>
      <Point><position>1</position><quantity>999</quantity></Point>
    </Period>
  </TimeSeries></Document>`;
  const report = parseEntsoeResponse(xml);
  assert.deepEqual(report.series, [{
    category: 'B11',
    periods: [{ start_utc: '2026-11-20T14:00Z', end_utc: '2026-11-20T14:15Z', resolution: 'PT15M', point_count: 1, first_position: 1, last_position: 1 }]
  }]);
  assert.equal(JSON.stringify(report).includes('999'), false);
});

test('ENTSO-E parser summarizes duplicate series under one category without merging point values', () => {
  const xml = `<Document>
    <TimeSeries><MktPSRType><psrType>B06</psrType></MktPSRType><Period><start>a</start><end>b</end><resolution>PT15M</resolution><Point><position>1</position><quantity>123</quantity></Point></Period></TimeSeries>
    <TimeSeries><MktPSRType><psrType>B06</psrType></MktPSRType><Period><start>c</start><end>d</end><resolution>PT15M</resolution><Point><position>1</position><quantity>456</quantity></Point></Period></TimeSeries>
  </Document>`;
  const report = parseEntsoeResponse(xml);
  assert.deepEqual(report.category_coverage, [{
    category: 'B06', timeseries_count: 2, period_count: 2, point_count: 2,
    periods: [
      { start_utc: 'a', end_utc: 'b', resolution: 'PT15M', point_count: 1 },
      { start_utc: 'c', end_utc: 'd', resolution: 'PT15M', point_count: 1 }
    ]
  }]);
  assert.equal(JSON.stringify(report).includes('123'), false);
  assert.equal(JSON.stringify(report).includes('456'), false);
});
