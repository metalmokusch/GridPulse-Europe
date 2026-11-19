import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFreshness, isFreshnessStatus } from '../src/domain/freshness.js';

const now = '2026-11-19T12:00:00Z';
const thresholds = { now, freshForMs: 10 * 60 * 1000, staleAfterMs: 60 * 60 * 1000 };

test('freshness classifier applies caller-supplied fresh, delayed, and stale thresholds', () => {
  assert.equal(classifyFreshness('2026-11-19T11:55:00Z', thresholds).status, 'fresh');
  assert.equal(classifyFreshness('2026-11-19T11:45:00Z', thresholds).status, 'delayed');
  assert.equal(classifyFreshness('2026-11-19T10:59:59Z', thresholds).status, 'stale');
  assert.equal(classifyFreshness('2026-11-19T11:50:00Z', thresholds).age_ms, 10 * 60 * 1000);
});

test('missing and future data stay explicit rather than appearing fresh', () => {
  assert.deepEqual(classifyFreshness(null, thresholds), { status: 'no_data', age_ms: null, data_as_of_utc: null });
  const future = classifyFreshness('2026-11-19T12:01:00Z', thresholds);
  assert.equal(future.status, 'unknown');
  assert.equal(future.reason, 'future_timestamp');
  assert.equal(isFreshnessStatus(future.status), true);
});

test('freshness thresholds and timestamps are validated', () => {
  assert.throws(() => classifyFreshness(now, { now, freshForMs: -1, staleAfterMs: 0 }), /freshForMs/);
  assert.throws(() => classifyFreshness(now, { now, freshForMs: 10, staleAfterMs: 9 }), /staleAfterMs/);
  assert.throws(() => classifyFreshness('2026-11-19T12:00:00+01:00', thresholds), /UTC timestamp/);
  assert.throws(() => classifyFreshness('2026-02-30T12:00:00Z', thresholds), /calendar timestamp/);
  assert.throws(() => classifyFreshness('not-a-date', thresholds), /UTC timestamp/);
});
