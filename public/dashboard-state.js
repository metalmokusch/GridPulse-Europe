export const DEFAULT_DASHBOARD_STATE = Object.freeze({
  countries: Object.freeze(['HU']),
  hours: 24,
  sources: Object.freeze(['wind_onshore', 'solar', 'hydro', 'nuclear', 'gas', 'coal'])
});

export function parseDashboardState(search, { countryCodes, sourceIds }) {
  const params = new URLSearchParams(search);
  const validCountries = new Set(countryCodes);
  const validSources = new Set(sourceIds);
  const state = {
    countries: [...DEFAULT_DASHBOARD_STATE.countries],
    hours: DEFAULT_DASHBOARD_STATE.hours,
    sources: [...DEFAULT_DASHBOARD_STATE.sources]
  };

  if (params.has('countries')) {
    const countries = params.get('countries').split(',').map((code) => code.trim().toUpperCase());
    if (countries.length > 0 && countries.length <= 3
      && new Set(countries).size === countries.length
      && countries.every((code) => validCountries.has(code))) state.countries = countries;
  }

  const hours = Number(params.get('hours'));
  if ([6, 12, 24].includes(hours)) state.hours = hours;

  if (params.has('sources')) {
    const sources = params.get('sources').split(',').filter(Boolean);
    if (sources.length > 0 && new Set(sources).size === sources.length
      && sources.every((source) => validSources.has(source))) state.sources = sources;
  }

  return state;
}

export function serializeDashboardState(state, urlLike, { allSources }) {
  const url = new URL(urlLike);
  if (state.countries.length === 1 && state.countries[0] === 'HU') url.searchParams.delete('countries');
  else url.searchParams.set('countries', state.countries.join(','));
  if (state.hours === 24) url.searchParams.delete('hours');
  else url.searchParams.set('hours', String(state.hours));
  if (allSources.every((source) => state.sources.includes(source))) url.searchParams.delete('sources');
  else url.searchParams.set('sources', allSources.filter((source) => state.sources.includes(source)).join(','));
  return `${url.pathname}${url.search}${url.hash}`;
}
