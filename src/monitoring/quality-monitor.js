import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const WINDOW_MS = 24 * 60 * 60_000;
const MAX_RECORDS = 30 * 24 * 4;
const PUBLICATION_GRACE_MS = 60 * 60_000;
const FAILURE_CODES = new Set([
  'TOKEN_UNAVAILABLE', 'UNSUPPORTED_ZONE', 'REQUEST_TIMEOUT', 'NETWORK_ERROR',
  'RESPONSE_READ_ERROR', 'PROVIDER_REJECTED', 'INVALID_RESPONSE', 'UNSUPPORTED_RESOLUTION', 'EMPTY_RESPONSE'
]);

function safeFailureCode(value) {
  if (FAILURE_CODES.has(value) || /^HTTP_[1-5]\d\d$/.test(value ?? '')) return value;
  return 'UNCLASSIFIED';
}

function categoryCounts(mix) {
  const categories = new Map();
  for (const observation of mix.observations) {
    for (const value of observation.values) {
      const category = value.source_category ?? 'UNSPECIFIED';
      categories.set(category, (categories.get(category) ?? 0) + 1);
    }
  }
  return categories;
}

function appendRecord(filePath, record) {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  try {
    const lines = readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    if (lines.length > MAX_RECORDS) writeFileSync(filePath, `${lines.slice(-MAX_RECORDS).join('\n')}\n`, { mode: 0o600 });
  } catch {
    // The just-appended record remains useful even if optional compaction fails.
  }
}

export function createQualityMonitor({ filePath, now = () => new Date() }) {
  if (!filePath) throw new TypeError('A quality-monitor file path is required.');

  function readRecords() {
    try {
      return readFileSync(filePath, 'utf8').split('\n').filter(Boolean).slice(-MAX_RECORDS)
        .map((line) => JSON.parse(line))
        .filter((record) => record && typeof record.checked_at_utc === 'string' && Number.isFinite(Date.parse(record.checked_at_utc)));
    } catch {
      return [];
    }
  }

  function recordSuccess(mix) {
    const checkedAt = now();
    const observations = mix.observations;
    const observedCount = observations.filter(({ values }) => values.length > 0).length;
    const missingIntervals = observations.length - observedCount;
    const maturedCutoff = checkedAt.getTime() - PUBLICATION_GRACE_MS;
    const matured = observations.filter(({ period_end_utc }) => Date.parse(period_end_utc) <= maturedCutoff);
    const maturedObserved = matured.filter(({ values }) => values.length > 0).length;
    const pending = observations.filter(({ period_end_utc }) => Date.parse(period_end_utc) > maturedCutoff);
    const pendingObserved = pending.filter(({ values }) => values.length > 0).length;
    const categories = categoryCounts(mix);
    const sparseCategoryIds = [...categories.entries()]
      .filter(([, count]) => observedCount > 0 && count < observedCount / 2)
      .map(([category]) => category).sort();
    const latest = [...observations].reverse().find(({ values }) => values.length > 0);
    const record = {
      checked_at_utc: checkedAt.toISOString(),
      result: 'success',
      freshness: latest ? Math.max(0, Math.floor((checkedAt.getTime() - Date.parse(latest.period_end_utc)) / 60_000)) : null,
      intervals_expected: observations.length,
      intervals_observed: observedCount,
      intervals_missing: missingIntervals,
      intervals_matured_expected: matured.length,
      intervals_matured_observed: maturedObserved,
      intervals_missing_matured: matured.length - maturedObserved,
      intervals_pending: pending.length,
      intervals_pending_observed: pendingObserved,
      source_categories: [...categories.keys()].sort(),
      sparse_category_ids: sparseCategoryIds,
      has_sparse_categories: sparseCategoryIds.length > 0 || mix.source.quality_flags.some((flag) =>
        flag.startsWith('unmapped_source_category:') || flag.startsWith('unclassified_source_category:'))
    };
    appendRecord(filePath, record);
    return record;
  }

  function recordFailure(code) {
    const record = { checked_at_utc: now().toISOString(), result: 'failure', failure_code: safeFailureCode(code) };
    appendRecord(filePath, record);
    return record;
  }

  function summary() {
    const cutoff = now().getTime() - WINDOW_MS;
    const records = readRecords().filter(({ checked_at_utc }) => Date.parse(checked_at_utc) >= cutoff);
    const successes = records.filter(({ result }) => result === 'success');
    const failures = records.filter(({ result }) => result === 'failure');
    const failureCodeCounts = {};
    for (const record of failures) {
      const code = safeFailureCode(record.failure_code);
      failureCodeCounts[code] = (failureCodeCounts[code] ?? 0) + 1;
    }
    const latestSuccess = successes.at(-1) ?? null;
    const intervals = successes.length ? successes.reduce((sum, record) => sum + record.intervals_expected, 0) : 0;
    const observed = successes.reduce((sum, record) => sum + record.intervals_observed, 0);
    const maturedRecords = successes.filter((record) => Number.isFinite(record.intervals_matured_expected)
      && Number.isFinite(record.intervals_matured_observed));
    const maturedIntervals = maturedRecords.reduce((sum, record) => sum + record.intervals_matured_expected, 0);
    const maturedObserved = maturedRecords.reduce((sum, record) => sum + record.intervals_matured_observed, 0);
    return {
      window_start_utc: new Date(cutoff).toISOString(),
      window_end_utc: now().toISOString(),
      checks: records.length,
      successes: successes.length,
      failures: failures.length,
      failure_codes: failureCodeCounts,
      success_rate_pct: records.length ? Math.round(successes.length / records.length * 100) : null,
      mean_observed_interval_pct: intervals ? Math.round(observed / intervals * 100) : null,
      mean_matured_interval_pct: maturedIntervals ? Math.round(maturedObserved / maturedIntervals * 100) : null,
      latest_success: latestSuccess ? {
        checked_at_utc: latestSuccess.checked_at_utc,
        freshness_minutes: latestSuccess.freshness,
        intervals_observed: latestSuccess.intervals_observed,
        intervals_expected: latestSuccess.intervals_expected,
        intervals_missing: latestSuccess.intervals_missing,
        intervals_matured_expected: latestSuccess.intervals_matured_expected ?? null,
        intervals_matured_observed: latestSuccess.intervals_matured_observed ?? null,
        intervals_missing_matured: latestSuccess.intervals_missing_matured ?? null,
        intervals_pending: latestSuccess.intervals_pending ?? null,
        intervals_pending_observed: latestSuccess.intervals_pending_observed ?? null,
        source_categories: latestSuccess.source_categories,
        sparse_category_ids: latestSuccess.sparse_category_ids,
        has_sparse_categories: latestSuccess.has_sparse_categories
      } : null
    };
  }

  return { recordSuccess, recordFailure, summary };
}
