const FRESHNESS_STATUSES = new Set(['fresh', 'delayed', 'stale', 'no_data', 'unknown']);

function parseUtcTimestamp(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new TypeError(`${field} must be an ISO 8601 UTC timestamp ending in Z.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(`${field} is not a valid timestamp.`);
  const canonical = new Date(timestamp).toISOString();
  const fractionalSeconds = value.match(/\.(\d{1,3})Z$/);
  const normalizedInput = fractionalSeconds
    ? value.replace(/\.(\d{1,3})Z$/, (_, digits) => `.${digits.padEnd(3, '0')}Z`)
    : value.replace(/Z$/, '.000Z');
  if (canonical !== normalizedInput) throw new TypeError(`${field} is not a valid calendar timestamp.`);
  return timestamp;
}

export function classifyFreshness(dataAsOfUtc, {
  now = new Date(),
  freshForMs,
  staleAfterMs
} = {}) {
  if (!Number.isFinite(freshForMs) || freshForMs < 0) {
    throw new TypeError('freshForMs must be a finite, non-negative number.');
  }
  if (!Number.isFinite(staleAfterMs) || staleAfterMs < freshForMs) {
    throw new TypeError('staleAfterMs must be finite and at least freshForMs.');
  }

  if (dataAsOfUtc === null || dataAsOfUtc === undefined) {
    return { status: 'no_data', age_ms: null, data_as_of_utc: null };
  }

  const dataTimestamp = parseUtcTimestamp(dataAsOfUtc, 'dataAsOfUtc');
  const nowTimestamp = now instanceof Date
    ? now.getTime()
    : parseUtcTimestamp(now, 'now');
  if (!Number.isFinite(nowTimestamp)) throw new TypeError('now must be a valid date.');

  const ageMs = nowTimestamp - dataTimestamp;
  if (ageMs < 0) return { status: 'unknown', reason: 'future_timestamp', age_ms: ageMs, data_as_of_utc: dataAsOfUtc };

  let status;
  if (ageMs <= freshForMs) status = 'fresh';
  else if (ageMs <= staleAfterMs) status = 'delayed';
  else status = 'stale';

  return { status, age_ms: ageMs, data_as_of_utc: dataAsOfUtc };
}

export function isFreshnessStatus(value) {
  return FRESHNESS_STATUSES.has(value);
}
