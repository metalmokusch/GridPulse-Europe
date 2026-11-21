import { readFileSync } from 'node:fs';
import { normalizeEntsoeGeneration } from './normalize-generation.js';
import { parseEntsoeResponse } from './parse-response.js';
import { ENTSOE_PSR_TYPES } from './psr-types.js';
import { isRenewableCategory, getCategoryTaxonomy } from '../../domain/categories.js';

const API_URL = 'https://web-api.tp.entsoe.eu/api';

function providerError(qualityCode, message) {
  const error = new Error(message);
  error.qualityCode = qualityCode;
  return error;
}

function readToken() {
  const file = process.env.ENTSOE_API_TOKEN_FILE;
  let token;
  try {
    token = file ? readFileSync(file, 'utf8').trim() : process.env.ENTSOE_API_TOKEN?.trim();
  } catch {
    throw providerError('TOKEN_UNAVAILABLE', 'ENTSO-E token is not available.');
  }
  if (!token) throw providerError('TOKEN_UNAVAILABLE', 'ENTSO-E token is not configured.');
  return token;
}

function periodParameter(date) {
  return date.toISOString().slice(0, 16).replace(/[-:T]/g, '');
}

export async function fetchEntsoeGeneration({ countryCode, countryName, sourceZone, now = new Date() }) {
  if (!/^[A-Z]{2}$/.test(countryCode ?? '') || !sourceZone) {
    throw providerError('UNSUPPORTED_ZONE', 'A supported country and bidding zone are required.');
  }

  const periodEnd = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  const periodStart = new Date(periodEnd.getTime() - 24 * 3_600_000);
  const params = new URLSearchParams({
    securityToken: readToken(),
    documentType: 'A75',
    processType: 'A16',
    in_Domain: sourceZone,
    periodStart: periodParameter(periodStart),
    periodEnd: periodParameter(periodEnd)
  });

  let response;
  try {
    response = await fetch(`${API_URL}?${params}`, {
      headers: { accept: 'application/xml' },
      signal: AbortSignal.timeout(30_000)
    });
  } catch (error) {
    throw providerError(error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR', 'ENTSO-E request failed.');
  }
  let xml;
  try {
    xml = await response.text();
  } catch {
    throw providerError('RESPONSE_READ_ERROR', 'ENTSO-E response could not be read.');
  }
  if (!response.ok) throw providerError(`HTTP_${response.status}`, 'ENTSO-E returned an unsuccessful HTTP status.');

  if (/<Acknowledgement_MarketDocument\b/i.test(xml)) {
    throw providerError('PROVIDER_REJECTED', 'ENTSO-E rejected the request.');
  }
  const responseMetadata = parseEntsoeResponse(xml);
  if (!responseMetadata.timeseries_count || !responseMetadata.point_count) {
    throw providerError('EMPTY_RESPONSE', 'ENTSO-E returned no quantity points for the requested period.');
  }

  let normalized;
  try {
    normalized = normalizeEntsoeGeneration(xml, { sourceZone, fetchedAtUtc: now.toISOString() });
  } catch {
    throw providerError('INVALID_RESPONSE', 'ENTSO-E response could not be normalized.');
  }
  const resolutions = new Set(normalized.observations.map(({ period_start_utc, period_end_utc }) => Date.parse(period_end_utc) - Date.parse(period_start_utc)));
  if (resolutions.size !== 1 || ![15 * 60_000, 60 * 60_000].includes([...resolutions][0])) {
    throw providerError('UNSUPPORTED_RESOLUTION', 'ENTSO-E returned an unvalidated resolution.');
  }
  const intervalMs = [...resolutions][0];

  const byPeriod = new Map();
  for (const observation of normalized.observations) {
    const key = observation.period_end_utc;
    const point = byPeriod.get(key) ?? {
      period_start_utc: observation.period_start_utc,
      period_end_utc: observation.period_end_utc,
      source_published_at_utc: null,
      fetched_at_utc: observation.fetched_at_utc,
      provider: observation.provider,
      provider_dataset: observation.provider_dataset,
      source_zone: observation.source_zone,
      unit: observation.unit,
      data_status: observation.data_status,
      quality_flags: ['coverage_incomplete', 'missing_points_not_filled'],
      total_mw: 0,
      renewable_share_pct: null,
      coverage_complete: false,
      values: []
    };
    point.total_mw += observation.value;
    point.values.push({
      category: observation.normalized_category,
      source_category: observation.source_category,
      label: ENTSOE_PSR_TYPES[observation.source_category] ?? `Unknown (${observation.source_category})`,
      color: null,
      renewable: isRenewableCategory(observation.normalized_category),
      value: observation.value,
      quality_flags: observation.quality_flags
    });
    byPeriod.set(key, point);
  }

  for (const point of byPeriod.values()) {
    const renewableMw = point.values.filter(({ renewable }) => renewable).reduce((sum, item) => sum + item.value, 0);
    point.renewable_share_pct = point.total_mw > 0 ? Number((renewableMw / point.total_mw * 100).toFixed(1)) : null;
    point.quality_flags.push('renewable_share_reported_categories_only', 'unknown_categories_excluded_from_renewable_numerator');
  }
  const categoryLabels = new Map(getCategoryTaxonomy().map(({ id, label }) => [id, label]));
  for (const point of byPeriod.values()) {
    for (const item of point.values) item.label = categoryLabels.get(item.category) ?? item.label;
  }
  const observed = [...byPeriod.values()].sort((a, b) => a.period_end_utc.localeCompare(b.period_end_utc));
  if (!observed.length) throw providerError('EMPTY_RESPONSE', 'ENTSO-E returned no observations for the requested period.');
  const observations = Array.from({ length: 24 * 60 * 60_000 / intervalMs }, (_, index) => {
    const start = new Date(periodStart.getTime() + index * intervalMs);
    const end = new Date(start.getTime() + intervalMs);
    return byPeriod.get(end.toISOString()) ?? {
      period_start_utc: start.toISOString(),
      period_end_utc: end.toISOString(),
      source_published_at_utc: null,
      fetched_at_utc: now.toISOString(),
      provider: 'entsoe',
      provider_dataset: 'A75-A16',
      source_zone: sourceZone,
      unit: 'MW',
      data_status: 'actual',
      quality_flags: ['missing_observation', 'coverage_incomplete'],
      total_mw: null,
      renewable_share_pct: null,
      coverage_complete: false,
      values: []
    };
  });
  return {
    country: { code: countryCode, name: countryName ?? countryCode, provider_zone_code: sourceZone },
    generated_at_utc: now.toISOString(),
    source: {
      provider: 'entsoe',
      label: 'ENTSO-E Transparency Platform · Actual Generation per Production Type (A75/A16)',
      url: 'https://transparency.entsoe.eu/',
      data_status: 'actual',
      quality_flags: normalized.warnings
    },
    observations
  };
}
