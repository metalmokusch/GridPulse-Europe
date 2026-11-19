export const TAXONOMY_VERSION = '1.0.0';

export const CATEGORY_TAXONOMY = Object.freeze([
  { id: 'solar', label: 'Solar', renewable: true },
  { id: 'wind_onshore', label: 'Onshore wind', renewable: true },
  { id: 'wind_offshore', label: 'Offshore wind', renewable: true },
  { id: 'hydro', label: 'Hydro', renewable: true },
  { id: 'biomass', label: 'Biomass', renewable: true },
  { id: 'geothermal', label: 'Geothermal', renewable: true },
  { id: 'nuclear', label: 'Nuclear', renewable: false },
  { id: 'coal', label: 'Coal', renewable: false },
  { id: 'gas', label: 'Gas', renewable: false },
  { id: 'oil', label: 'Oil', renewable: false },
  { id: 'other_fossil', label: 'Other fossil', renewable: false },
  { id: 'other', label: 'Other', renewable: false },
  { id: 'unknown', label: 'Unknown source', renewable: false }
]);

export const NORMALIZED_CATEGORIES = Object.freeze(CATEGORY_TAXONOMY.map(({ id }) => id));

export const RENEWABLE_CATEGORIES = Object.freeze([
  'solar',
  'wind_onshore',
  'wind_offshore',
  'hydro',
  'biomass',
  'geothermal'
]);

export function isRenewableCategory(value) {
  return RENEWABLE_CATEGORIES.includes(value);
}

export function isNormalizedCategory(value) {
  return NORMALIZED_CATEGORIES.includes(value);
}

export function getCategoryTaxonomy() {
  return CATEGORY_TAXONOMY.map((category) => ({ ...category }));
}
