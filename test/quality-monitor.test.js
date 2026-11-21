import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQualityMonitor } from '../src/monitoring/quality-monitor.js';

test('quality monitor stores metadata only and summarizes availability and sparse categories', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gridpulse-quality-'));
  const filePath = join(directory, 'quality.jsonl');
  let current = new Date('2026-11-20T17:00:00.000Z');
  const monitor = createQualityMonitor({ filePath, now: () => current });
  const observations = Array.from({ length: 96 }, (_, index) => ({
    period_end_utc: new Date(current.getTime() - (95 - index) * 15 * 60_000).toISOString(),
    values: index < 80 ? [
      { source_category: 'B16', value: 300 },
      ...(index < 60 ? [{ source_category: 'B17', value: 10 }] : []),
      ...(index < 3 ? [{ source_category: 'B06', value: 10 }] : [])
    ] : []
  }));

  try {
    monitor.recordSuccess({ observations, source: { quality_flags: ['unclassified_source_category:B17'] } });
    current = new Date('2026-11-20T18:00:00.000Z');
    monitor.recordFailure('HTTP_503');
    monitor.recordFailure('PROVIDER_REJECTED');
    monitor.recordFailure('raw token value');
    const summary = monitor.summary();
    assert.equal(summary.checks, 4);
    assert.equal(summary.success_rate_pct, 25);
    assert.deepEqual(summary.failure_codes, { HTTP_503: 1, PROVIDER_REJECTED: 1, UNCLASSIFIED: 1 });
    assert.equal(summary.latest_success.intervals_observed, 80);
    assert.equal(summary.latest_success.intervals_missing, 16);
    assert.equal(summary.latest_success.intervals_matured_expected, 92);
    assert.equal(summary.latest_success.intervals_matured_observed, 80);
    assert.equal(summary.latest_success.intervals_missing_matured, 12);
    assert.equal(summary.latest_success.intervals_pending, 4);
    assert.equal(summary.mean_matured_interval_pct, 87);
    assert.deepEqual(summary.latest_success.sparse_category_ids, ['B06']);
    assert.equal(summary.latest_success.has_sparse_categories, true);
    const logged = readFileSync(filePath, 'utf8');
    assert.doesNotMatch(logged, /300|10/);
    assert.doesNotMatch(logged, /raw token value/);
    assert.match(logged, /B06/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('quality monitor separates recent publication-window gaps from mature missing intervals', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gridpulse-quality-grace-'));
  const filePath = join(directory, 'quality.jsonl');
  const current = new Date('2026-11-20T17:00:00.000Z');
  const monitor = createQualityMonitor({ filePath, now: () => current });
  const observations = Array.from({ length: 96 }, (_, index) => ({
    period_end_utc: new Date(current.getTime() - (95 - index) * 15 * 60_000).toISOString(),
    values: index < 94 ? [{ source_category: 'B16', value: 300 }] : []
  }));

  try {
    monitor.recordSuccess({ observations, source: { quality_flags: [] } });
    const latest = monitor.summary().latest_success;
    assert.equal(latest.intervals_observed, 94);
    assert.equal(latest.intervals_expected, 96);
    assert.equal(latest.intervals_pending, 4);
    assert.equal(latest.intervals_pending_observed, 2);
    assert.equal(latest.intervals_matured_expected, 92);
    assert.equal(latest.intervals_matured_observed, 92);
    assert.equal(latest.intervals_missing_matured, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('quality monitor does not infer publication metrics for legacy records', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gridpulse-quality-legacy-'));
  const filePath = join(directory, 'quality.jsonl');
  const current = new Date('2026-11-20T18:00:00.000Z');
  writeFileSync(filePath, [
    JSON.stringify({ checked_at_utc: '2026-11-20T17:00:00.000Z', result: 'success', intervals_expected: 96, intervals_observed: 94, intervals_missing: 2, freshness: 30, source_categories: ['B16'], sparse_category_ids: [] }),
    JSON.stringify({ checked_at_utc: '2026-11-20T18:00:00.000Z', result: 'failure' })
  ].join('\n') + '\n');

  try {
    const summary = createQualityMonitor({ filePath, now: () => current }).summary();
    assert.equal(summary.mean_observed_interval_pct, 98);
    assert.equal(summary.mean_matured_interval_pct, null);
    assert.equal(summary.latest_success.intervals_matured_expected, null);
    assert.deepEqual(summary.failure_codes, { UNCLASSIFIED: 1 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
