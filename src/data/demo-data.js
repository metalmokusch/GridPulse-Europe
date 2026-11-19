import { CATEGORY_TAXONOMY, TAXONOMY_VERSION } from '../domain/categories.js';
import { normalizeGenerationObservation, summarizeGenerationMix } from '../domain/observation.js';

const CATEGORY_DEFINITIONS = [
  { id: 'wind_onshore', label: 'Onshore wind', color: '#48c6a6', renewable: true },
  { id: 'solar', label: 'Solar', color: '#f2bb63', renewable: true },
  { id: 'hydro', label: 'Hydro', color: '#68a8ef', renewable: true },
  { id: 'nuclear', label: 'Nuclear', color: '#a991ed', renewable: false },
  { id: 'gas', label: 'Gas', color: '#f17d77', renewable: false },
  { id: 'coal', label: 'Coal', color: '#9ca8b5', renewable: false }
];

const COUNTRIES = [
  { code: 'HU', name: 'Hungary', zone: 'HU (demo zone)', phase: 0.4, base: 6900, wind: 780, solar: 1100, hydro: 90, nuclear: 1900 },
  { code: 'AT', name: 'Austria', zone: 'AT (demo zone)', phase: 1.8, base: 8200, wind: 1050, solar: 950, hydro: 2650, nuclear: 0 },
  { code: 'DE', name: 'Germany', zone: 'DE (demo zone)', phase: 2.9, base: 58500, wind: 12800, solar: 10400, hydro: 1500, nuclear: 0 }
];

function observationAt(country, hourOffset, now) {
  const end = new Date(now);
  end.setUTCMinutes(0, 0, 0);
  end.setUTCHours(end.getUTCHours() + hourOffset);
  const hour = end.getUTCHours();
  const daylight = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const windFactor = 0.68 + 0.28 * Math.sin((hour + country.phase) * 0.71);
  const values = {
    wind_onshore: Math.round(country.wind * Math.max(0.24, windFactor)),
    solar: Math.round(country.solar * daylight),
    hydro: Math.round(country.hydro * (0.91 + 0.08 * Math.cos(hour * 0.42))),
    nuclear: country.nuclear,
    gas: 0,
    coal: 0
  };
  const variation = Math.round(country.base * (0.91 + 0.07 * Math.sin((hour + country.phase) * 0.44)));
  const residual = Math.max(0, variation - Object.values(values).reduce((sum, value) => sum + value, 0));
  values.gas = Math.round(residual * 0.61);
  values.coal = residual - values.gas;
  const fullTaxonomyValues = Object.fromEntries(CATEGORY_TAXONOMY.map(({ id }) => [id, values[id] ?? 0]));
  const periodEnd = end.toISOString();
  const periodStart = new Date(end.getTime() - 60 * 60 * 1000).toISOString();
  const fetchedAt = new Date(now).toISOString();
  const normalizedObservations = CATEGORY_TAXONOMY.map(({ id }) => normalizeGenerationObservation({
    provider: 'synthetic-demo',
    provider_dataset: 'illustrative-generation-mix-v1',
    source_zone: country.zone,
    period_start_utc: periodStart,
    period_end_utc: periodEnd,
    source_published_at_utc: null,
    fetched_at_utc: fetchedAt,
    source_category: id,
    normalized_category: id,
    taxonomy_version: TAXONOMY_VERSION,
    value: fullTaxonomyValues[id],
    unit: 'MW',
    data_status: 'synthetic',
    quality_flags: ['synthetic_fixture', 'not_observed_data']
  }));
  const mix = summarizeGenerationMix(normalizedObservations, { coverage_complete: true });

  return {
    period_start_utc: periodStart,
    period_end_utc: periodEnd,
    source_published_at_utc: null,
    fetched_at_utc: fetchedAt,
    provider: 'synthetic-demo',
    provider_dataset: 'illustrative-generation-mix-v1',
    source_zone: country.zone,
    unit: 'MW',
    data_status: 'synthetic',
    quality_flags: ['synthetic_fixture', 'not_observed_data'],
    total_mw: mix.total_value,
    renewable_share_pct: mix.renewable_share_pct,
    taxonomy_version: TAXONOMY_VERSION,
    values: CATEGORY_DEFINITIONS.map(({ id, ...category }) => {
      const observation = normalizedObservations.find((entry) => entry.normalized_category === id);
      return { category: id, ...category, value: observation.value };
    })
  };
}

export function getCountries() {
  return COUNTRIES.map(({ code, name, zone }) => ({ code, name, provider_zone_code: zone, data_status: 'synthetic' }));
}

export function getGenerationMix(code, { now = new Date(), points = 24 } = {}) {
  const country = COUNTRIES.find((entry) => entry.code === code);
  if (!country) return null;
  return {
    country: { code: country.code, name: country.name, provider_zone_code: country.zone },
    generated_at_utc: new Date(now).toISOString(),
    source: { provider: 'synthetic-demo', label: 'Illustrative synthetic fixture', data_status: 'synthetic' },
    observations: Array.from({ length: points }, (_, index) => observationAt(country, index - points + 1, now))
  };
}

export function getSummary(codes, { now = new Date() } = {}) {
  return codes.map((code) => {
    const series = getGenerationMix(code, { now, points: 1 });
    return series ? { ...series.country, latest: series.observations[0], source: series.source } : null;
  }).filter(Boolean);
}
