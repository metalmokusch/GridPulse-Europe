import { isNormalizedCategory, isRenewableCategory, TAXONOMY_VERSION } from './categories.js';

const UNITS = new Set(['MW', 'MWh']);
const STATUSES = new Set(['actual', 'forecast', 'estimate', 'unknown', 'synthetic']);
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function validateTimestamp(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) {
    throw new TypeError(`${field} must be an ISO 8601 UTC timestamp ending in Z${nullable ? ' or null' : ''}.`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${field} is not a valid timestamp.`);
  const canonical = new Date(parsed).toISOString();
  const fractionalSeconds = value.match(/\.(\d{1,3})Z$/);
  const normalizedInput = fractionalSeconds
    ? value.replace(/\.(\d{1,3})Z$/, (_, digits) => `.${digits.padEnd(3, '0')}Z`)
    : value.replace(/Z$/, '.000Z');
  if (canonical !== normalizedInput) throw new TypeError(`${field} is not a valid calendar timestamp.`);
  return canonical;
}

export function normalizeGenerationObservation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Observation must be an object.');
  }

  const observation = {
    provider: requireString(input.provider, 'provider'),
    provider_dataset: requireString(input.provider_dataset, 'provider_dataset'),
    source_zone: requireString(input.source_zone, 'source_zone'),
    period_start_utc: validateTimestamp(input.period_start_utc, 'period_start_utc'),
    period_end_utc: validateTimestamp(input.period_end_utc, 'period_end_utc'),
    source_published_at_utc: validateTimestamp(input.source_published_at_utc ?? null, 'source_published_at_utc', { nullable: true }),
    fetched_at_utc: validateTimestamp(input.fetched_at_utc, 'fetched_at_utc'),
    source_category: requireString(input.source_category, 'source_category'),
    normalized_category: requireString(input.normalized_category, 'normalized_category'),
    taxonomy_version: requireString(input.taxonomy_version, 'taxonomy_version'),
    value: input.value,
    unit: input.unit,
    data_status: input.data_status,
    quality_flags: input.quality_flags
  };

  if (Date.parse(observation.period_end_utc) <= Date.parse(observation.period_start_utc)) {
    throw new TypeError('period_end_utc must be later than period_start_utc.');
  }
  if (!isNormalizedCategory(observation.normalized_category)) {
    throw new TypeError(`normalized_category must be a supported category or "unknown".`);
  }
  if (observation.taxonomy_version !== TAXONOMY_VERSION) {
    throw new TypeError(`taxonomy_version must be ${TAXONOMY_VERSION}.`);
  }
  if (!Number.isFinite(observation.value) || observation.value < 0) {
    throw new TypeError('value must be a finite, non-negative number.');
  }
  if (!UNITS.has(observation.unit)) throw new TypeError('unit must be MW or MWh.');
  if (!STATUSES.has(observation.data_status)) {
    throw new TypeError('data_status must be actual, forecast, estimate, unknown, or synthetic.');
  }
  if (!Array.isArray(observation.quality_flags) || observation.quality_flags.some((flag) => typeof flag !== 'string' || flag.trim() === '')) {
    throw new TypeError('quality_flags must be an array of non-empty strings.');
  }

  return { ...observation, quality_flags: [...new Set(observation.quality_flags.map((flag) => flag.trim()))] };
}

export function summarizeGenerationMix(input, { coverage_complete = false } = {}) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new TypeError('At least one normalized observation is required.');
  }
  if (typeof coverage_complete !== 'boolean') {
    throw new TypeError('coverage_complete must be a boolean.');
  }

  const observations = input.map(normalizeGenerationObservation);
  const first = observations[0];
  const sameSeries = observations.every((observation) =>
    observation.provider === first.provider &&
    observation.provider_dataset === first.provider_dataset &&
    observation.source_zone === first.source_zone &&
    observation.period_start_utc === first.period_start_utc &&
    observation.period_end_utc === first.period_end_utc &&
    observation.unit === first.unit &&
    observation.data_status === first.data_status &&
    observation.taxonomy_version === first.taxonomy_version
  );
  if (!sameSeries) {
    throw new TypeError('Mix observations must share provider, dataset, zone, period, and unit.');
  }

  const totalValue = observations.reduce((total, observation) => total + observation.value, 0);
  if (!Number.isFinite(totalValue)) throw new RangeError('Mix total exceeds the supported numeric range.');
  const unknownValue = observations
    .filter(({ normalized_category }) => normalized_category === 'unknown')
    .reduce((total, observation) => total + observation.value, 0);
  const renewableValue = observations
    .filter(({ normalized_category }) => isRenewableCategory(normalized_category))
    .reduce((total, observation) => total + observation.value, 0);
  const shareIsReliable = coverage_complete && unknownValue === 0 && totalValue > 0;

  return {
    unit: first.unit,
    total_value: totalValue,
    renewable_value: renewableValue,
    renewable_share_pct: shareIsReliable ? Number(((renewableValue / totalValue) * 100).toFixed(1)) : null,
    coverage_complete,
    share_unavailable_reason: shareIsReliable ? null : unknownValue > 0 ? 'unknown_categories' : !coverage_complete ? 'incomplete_coverage' : 'zero_total'
  };
}
