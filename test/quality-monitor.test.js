import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
    values: index < 80 ? [{ source_category: 'B16', value: 300 }, ...(index < 3 ? [{ source_category: 'B06', value: 10 }] : [])] : []
  }));

  try {
    monitor.recordSuccess({ observations, source: { quality_flags: [] } });
    current = new Date('2026-11-20T18:00:00.000Z');
    monitor.recordFailure();
    const summary = monitor.summary();
    assert.equal(summary.checks, 2);
    assert.equal(summary.success_rate_pct, 50);
    assert.equal(summary.latest_success.intervals_observed, 80);
    assert.equal(summary.latest_success.intervals_missing, 16);
    assert.deepEqual(summary.latest_success.sparse_category_ids, ['B06']);
    const logged = readFileSync(filePath, 'utf8');
    assert.doesNotMatch(logged, /300|10/);
    assert.match(logged, /B06/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
