import { readFileSync } from 'node:fs';
import { normalizeEntsoeGeneration } from './normalize-generation.js';
import { ENTSOE_PSR_TYPES } from './psr-types.js';

const API_URL = 'https://web-api.tp.entsoe.eu/api';

function readToken() {
  const file = process.env.ENTSOE_API_TOKEN_FILE;
  const token = file ? readFileSync(file, 'utf8').trim() : process.env.ENTSOE_API_TOKEN?.trim();
  if (!token) throw new Error('ENTSO-E token is not configured.');
  return token;
}

function periodParameter(date) {
  return date.toISOString().slice(0, 16).replace(/[-:T]/g, '');
}

export async function fetchEntsoeGeneration({ countryCode, sourceZone, now = new Date() }) {
  if (countryCode !== 'HU' || sourceZone !== '10YHU-MAVIR----U') {
    throw new Error('Live ENTSO-E mode currently supports only the validated HU bidding zone.');
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

  const response = await fetch(`${API_URL}?${params}`, {
    headers: { accept: 'application/xml' },
    signal: AbortSignal.timeout(30_000)
  });
  const xml = await response.text();
  if (!response.ok) throw new Error(`ENTSO-E returned HTTP ${response.status}.`);

  let normalized;
  try {
    normalized = normalizeEntsoeGeneration(xml, { sourceZone, fetchedAtUtc: now.toISOString() });
  } catch {
    throw new Error('ENTSO-E response could not be normalized.');
  }
  if (normalized.observations.some(({ period_start_utc, period_end_utc }) => Date.parse(period_end_utc) - Date.parse(period_start_utc) !== 15 * 60_000)) {
    throw new Error('ENTSO-E returned an unvalidated resolution.');
  }

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
      renewable: false,
      value: observation.value,
      quality_flags: observation.quality_flags
    });
    byPeriod.set(key, point);
  }

  const observed = [...byPeriod.values()].sort((a, b) => a.period_end_utc.localeCompare(b.period_end_utc));
  if (!observed.length) throw new Error('ENTSO-E returned no observations for the requested period.');
  const intervalMs = 15 * 60_000;
  const observations = Array.from({ length: 96 }, (_, index) => {
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
    country: { code: countryCode, name: 'Hungary', provider_zone_code: sourceZone },
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
