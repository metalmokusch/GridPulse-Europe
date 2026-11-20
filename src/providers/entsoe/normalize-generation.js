import { normalizeGenerationObservation } from '../../domain/observation.js';
import { TAXONOMY_VERSION } from '../../domain/categories.js';

const CATEGORY_MAP = Object.freeze({
  B01: 'biomass',
  B02: 'coal',
  B04: 'gas',
  B05: 'coal',
  B06: 'oil',
  B09: 'geothermal',
  B11: 'hydro',
  B12: 'hydro',
  B14: 'nuclear',
  B16: 'solar',
  B19: 'wind_onshore'
});

function elementText(xml, name) {
  return xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)<\\/${name}>`, 'i'))?.[1]?.trim() ?? null;
}

function parseUtc(value, field) {
  if (!value || !Number.isFinite(Date.parse(value))) throw new TypeError(`ENTSO-E ${field} is missing or invalid.`);
  const date = new Date(value);
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) throw new TypeError(`ENTSO-E ${field} must include a timezone.`);
  return date;
}

function resolutionMilliseconds(value) {
  const match = value?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) throw new TypeError('ENTSO-E resolution must be an ISO 8601 time duration.');
  const milliseconds = ((Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0)) * 60 + Number(match[3] ?? 0)) * 1000;
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) throw new TypeError('ENTSO-E resolution must be positive.');
  return milliseconds;
}

export function normalizeEntsoeGeneration(xml, { sourceZone, fetchedAtUtc = new Date().toISOString() } = {}) {
  if (typeof xml !== 'string' || !xml.includes('<TimeSeries')) throw new TypeError('ENTSO-E response contains no TimeSeries data.');
  if (!sourceZone || typeof sourceZone !== 'string') throw new TypeError('sourceZone is required.');

  const observations = [];
  const warnings = new Set();
  const seriesBlocks = [...xml.matchAll(/<TimeSeries\b[^>]*>([\s\S]*?)<\/TimeSeries>/gi)].map(([, value]) => value);

  for (const [seriesIndex, seriesXml] of seriesBlocks.entries()) {
    const rawCategory = elementText(seriesXml, 'psrType');
    const sourceCategory = rawCategory || 'UNSPECIFIED';
    const normalizedCategory = CATEGORY_MAP[sourceCategory] ?? 'unknown';
    if (normalizedCategory === 'unknown') warnings.add(`unmapped_source_category:${sourceCategory}`);

    const periods = [...seriesXml.matchAll(/<Period\b[^>]*>([\s\S]*?)<\/Period>/gi)].map(([, value]) => value);
    for (const [periodIndex, periodXml] of periods.entries()) {
      const start = parseUtc(elementText(periodXml, 'start'), 'Period.start');
      const resolution = resolutionMilliseconds(elementText(periodXml, 'resolution'));
      const points = [...periodXml.matchAll(/<Point\b[^>]*>([\s\S]*?)<\/Point>/gi)].map(([, value]) => value);

      for (const pointXml of points) {
        const position = Number(elementText(pointXml, 'position'));
        const quantityText = elementText(pointXml, 'quantity');
        const value = quantityText === null ? NaN : Number(quantityText);
        if (!Number.isSafeInteger(position) || position <= 0) throw new TypeError('ENTSO-E Point.position must be a positive integer.');
        if (!Number.isFinite(value) || value < 0) throw new TypeError('ENTSO-E Point.quantity must be a finite non-negative number.');

        const periodStart = new Date(start.getTime() + (position - 1) * resolution);
        const periodEnd = new Date(periodStart.getTime() + resolution);
        observations.push(normalizeGenerationObservation({
          provider: 'entsoe',
          provider_dataset: 'A75-A16',
          source_zone: sourceZone,
          period_start_utc: periodStart.toISOString(),
          period_end_utc: periodEnd.toISOString(),
          source_published_at_utc: null,
          fetched_at_utc: fetchedAtUtc,
          source_category: sourceCategory,
          normalized_category: normalizedCategory,
          taxonomy_version: TAXONOMY_VERSION,
          value,
          unit: 'MW',
          data_status: 'actual',
          quality_flags: [
            'entsoe_mkt_psr_type',
            'entsoe_actual_generation_may_include_estimates',
            `entsoe_series_${seriesIndex + 1}_period_${periodIndex + 1}`
          ]
        }));
      }
    }
  }

  if (observations.length === 0) throw new TypeError('ENTSO-E response contains no quantity points.');
  return {
    observations,
    coverage_complete: false,
    warnings: [...warnings, 'coverage_not_attested', 'missing_points_not_filled']
  };
}
