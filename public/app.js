import { parseDashboardState, serializeDashboardState } from './dashboard-state.js';

const COLORS = {
  wind_onshore: '#48c6a6', solar: '#f2bb63', hydro: '#68a8ef',
  wind_offshore: '#37a78b', hydro_pumped_storage: '#5476a8', biomass: '#5aa46c', geothermal: '#bb8056',
  other_renewable: '#72b38a',
  nuclear: '#a991ed', gas: '#f17d77', coal: '#9ca8b5', oil: '#796b62',
  other_fossil: '#b77c69', other: '#788697', unknown: '#657386'
};
const state = { countries: [], selected: ['HU'], selectedCategories: Object.keys(COLORS), periodHours: 24, timer: null, refreshInterval: null, countryErrors: [] };
const $ = (selector) => document.querySelector(selector);

async function request(path) {
  const response = await fetch(path, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error?.message ?? `Request failed (${response.status})`);
  }
  return response.json();
}

function fmtNumber(value) { return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(value); }
function fmtTime(value) { return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(new Date(value)); }
function fmtDate(value) { return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(new Date(value)); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function flagEmoji(code) { return String.fromCodePoint(...code.toUpperCase().split('').map((char) => 127397 + char.charCodeAt(0))); }

function renderPicker() {
  $('#country-picker').innerHTML = state.countries.map((country) => {
    const checked = state.selected.includes(country.code);
    return `<label class="country-chip ${checked ? 'selected' : ''}"><input type="checkbox" value="${country.code}" ${checked ? 'checked' : ''}><span class="flag-emoji" aria-hidden="true">${flagEmoji(country.code)}</span><span>${escapeHtml(country.name)}</span><span class="chip-code">${country.code}</span></label>`;
  }).join('');
  $('#country-picker').querySelectorAll('input').forEach((input) => input.addEventListener('change', onCountryChange));
}

function restoreDashboardState() {
  const parsed = parseDashboardState(window.location.search, {
    countryCodes: state.countries.map(({ code }) => code),
    sourceIds: Object.keys(COLORS)
  });
  state.selected = parsed.countries;
  state.periodHours = parsed.hours;
  state.selectedCategories = parsed.sources;
  $('#period-select').value = String(state.periodHours);
}

function syncDashboardUrl() {
  const path = serializeDashboardState({
    countries: state.selected,
    hours: state.periodHours,
    sources: state.selectedCategories
  }, window.location.href, { allSources: Object.keys(COLORS) });
  window.history.replaceState(null, '', path);
}

function onCountryChange(event) {
  const code = event.target.value;
  const next = event.target.checked ? [...state.selected, code] : state.selected.filter((item) => item !== code);
  if (next.length > 3) {
    event.target.checked = false;
    showToast('Choose up to three countries.');
    return;
  }
  if (!next.length) {
    event.target.checked = true;
    showToast('Select at least one country.');
    return;
  }
  state.selected = next;
  renderPicker();
  syncDashboardUrl();
  loadDashboard();
}

function renderCategoryPicker() {
  if (!state.selectedCategoriesCatalog) return;
  $('#category-picker').innerHTML = state.selectedCategoriesCatalog.map((category) => {
    const checked = state.selectedCategories.includes(category.id);
    return `<label class="source-chip ${checked ? 'selected' : ''}"><input type="checkbox" value="${category.id}" ${checked ? 'checked' : ''}><i style="--swatch:${COLORS[category.id] ?? COLORS.unknown}"></i><span>${escapeHtml(category.label)}</span></label>`;
  }).join('');
  $('#category-picker').querySelectorAll('input').forEach((input) => input.addEventListener('change', onCategoryChange));
}

function onCategoryChange(event) {
  const category = event.target.value;
  const next = event.target.checked
    ? [...state.selectedCategories, category]
    : state.selectedCategories.filter((item) => item !== category);
  if (!next.length) {
    event.target.checked = true;
    showToast('Select at least one generation source.');
    return;
  }
  state.selectedCategories = next;
  renderCurrentDashboard();
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(state.timer);
  state.timer = setTimeout(() => toast.classList.remove('visible'), 2400);
}

function renderKpis(summary) {
  const total = summary.reduce((sum, item) => sum + item.latest.total_mw, 0);
  const knownShares = summary.filter((item) => item.latest.renewable_share_pct !== null && item.latest.total_mw > 0);
  const coverageComplete = summary.every((item) => item.latest.coverage_complete !== false);
  const weightedDenominator = knownShares.reduce((sum, item) => sum + item.latest.total_mw, 0);
  const weightedRenewables = weightedDenominator ? knownShares.reduce((sum, item) => sum + item.latest.total_mw * item.latest.renewable_share_pct / 100, 0) / weightedDenominator * 100 : null;
  const latest = summary.reduce((value, item) => item.latest.period_end_utc > value ? item.latest.period_end_utc : value, summary[0].latest.period_end_utc);
  const leading = [...summary].sort((a, b) => b.latest.renewable_share_pct - a.latest.renewable_share_pct)[0];
  $('#kpis').innerHTML = `
    <article class="kpi-card"><div class="kpi-top"><span>${coverageComplete ? 'COMBINED GENERATION' : 'OBSERVED GENERATION'}</span><span class="kpi-icon mint" aria-hidden="true">↗</span></div><strong>${fmtNumber(total)} <small>MW</small></strong><div class="kpi-detail">${coverageComplete ? 'Complete category coverage' : 'Reported categories only · coverage incomplete'}</div></article>
    <article class="kpi-card"><div class="kpi-top"><span>RENEWABLE SHARE</span><span class="kpi-icon blue" aria-hidden="true">◌</span></div><strong>${weightedRenewables === null ? '—' : `${weightedRenewables.toFixed(1)}<small>%</small>`}</strong><div class="kpi-detail">${coverageComplete ? 'All sources · weighted by generation' : 'Reported categories only · unknown stays unclassified'}</div></article>
    <article class="kpi-card"><div class="kpi-top"><span>RENEWABLE MIX</span><span class="kpi-icon gold" aria-hidden="true">✳</span></div><strong>${leading.latest.renewable_share_pct === null ? '—' : `${leading.latest.renewable_share_pct.toFixed(1)}<small>%</small>`}</strong><div class="kpi-detail">${coverageComplete ? `${escapeHtml(leading.name)} (${leading.code})` : `${escapeHtml(leading.name)} · reported categories only`}</div></article>
    <article class="kpi-card"><div class="kpi-top"><span>DATA PERIOD ENDS</span><span class="kpi-icon violet" aria-hidden="true">◷</span></div><strong class="time-value">${fmtTime(latest)}</strong><div class="kpi-detail">${fmtDate(latest)} · UTC</div></article>`;
}

function renderChart(series) {
  const primary = series[0];
  const latestObservation = primary.observations.at(-1);
  const intervalMs = Date.parse(latestObservation.period_end_utc) - Date.parse(latestObservation.period_start_utc);
  const pointCount = Math.max(1, Math.round(state.periodHours * 3_600_000 / intervalMs));
  const observations = primary.observations.slice(-pointCount);
  const categories = [...new Map(observations.flatMap(({ values }) => values)
    .filter(({ category }) => state.selectedCategories.includes(category))
    .map((item) => [`${item.category}:${item.label}`, item])).values()];
  const width = 760; const height = 252; const left = 56; const right = 16; const top = 14; const bottom = 34;
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const visibleValues = observations.map((observation) => observation.values
    .filter(({ category }) => state.selectedCategories.includes(category)));
  const max = Math.max(0, ...visibleValues.map((values) => values.reduce((sum, item) => sum + Math.max(0, item.value), 0))) * 1.15 || 1;
  const min = Math.min(0, ...visibleValues.map((values) => values.reduce((sum, item) => sum + Math.min(0, item.value), 0))) * 1.15;
  const valueRange = max - min || 1;
  const yForValue = (value) => top + (max - value) / valueRange * plotHeight;
  const step = plotWidth / observations.length; const barWidth = Math.max(4, step * 0.62);
  const grid = [0, 0.25, 0.5, 0.75, 1];
  const visibleSourceNames = categories.map(({ label }) => label).join(', ');
  let svg = `<svg class="mix-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="mix-chart-title" aria-describedby="mix-chart-desc"><title id="mix-chart-title">Electricity generation profile for ${escapeHtml(primary.country.name)}</title><desc id="mix-chart-desc">Stacked ${Math.round(intervalMs / 60_000)}-minute megawatt observations for the last ${state.periodHours} hours, showing ${escapeHtml(visibleSourceNames)}.</desc>`;
  grid.forEach((fraction) => {
    const value = max - valueRange * fraction;
    const y = yForValue(value);
    svg += `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="grid-line"/><text x="${left - 9}" y="${y + 4}" text-anchor="end" class="axis-label">${fmtNumber(value / 1000)}k</text>`;
  });
  observations.forEach((observation, index) => {
    let positiveStack = 0;
    let negativeStack = 0;
    observation.values.filter(({ category }) => state.selectedCategories.includes(category)).forEach((item) => {
      const start = item.value >= 0 ? positiveStack : negativeStack;
      const end = start + item.value;
      const x = left + index * step + (step - barWidth) / 2;
      const y1 = yForValue(start);
      const y2 = yForValue(end);
      const opacity = item.value !== 0 ? 0.9 : 0;
      svg += `<rect x="${x.toFixed(1)}" y="${Math.min(y1, y2).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.abs(y2 - y1).toFixed(1)}" rx="2" fill="${COLORS[item.category] ?? COLORS.unknown}" opacity="${opacity}"><title>${fmtTime(observation.period_end_utc)} · ${escapeHtml(item.label)}: ${fmtNumber(item.value)} MW</title></rect>`;
      if (item.value >= 0) positiveStack = end;
      else negativeStack = end;
    });
    if (index % 4 === 0 || index === observations.length - 1) {
      const x = left + index * step + step / 2;
      svg += `<text x="${x.toFixed(1)}" y="${height - 9}" text-anchor="middle" class="axis-label">${new Date(observation.period_end_utc).toISOString().slice(11, 16)}</text>`;
    }
  });
  svg += '</svg>';
  $('#chart-wrap').innerHTML = svg;
  $('#chart-caption').textContent = `${primary.country.name} · last ${state.periodHours} hours · selected sources · MW`;
  $('#legend').innerHTML = categories.map((category) => `<span><i style="--swatch:${COLORS[category.category] ?? COLORS.unknown}"></i>${escapeHtml(category.label)}</span>`).join('');
}

function renderComparison(summary) {
  const max = Math.max(1, ...summary.map((item) => item.latest.total_mw));
  $('#comparison-list').innerHTML = summary.map((item) => {
    const share = item.latest.renewable_share_pct;
    const shareLabel = share === null ? 'Renewable share unavailable' : `${share.toFixed(1)}% renewable${item.latest.coverage_complete === false ? ' · reported only' : ''}`;
    const progressWidth = share === null ? 0 : Math.max(0, Math.min(100, share));
    return `<article class="comparison-item"><div class="comparison-top"><div class="comparison-country"><span class="flag-emoji" aria-hidden="true">${flagEmoji(item.code)}</span><strong>${escapeHtml(item.name)}</strong><span class="chip-code">${item.code}</span></div><span class="comparison-time">${fmtTime(item.latest.period_end_utc)}</span></div><div class="comparison-metrics"><strong>${fmtNumber(item.latest.total_mw)} <small>MW</small></strong><span>${shareLabel}</span></div><div class="progress-track" role="img" aria-label="${shareLabel}"><span style="width:${progressWidth}%"></span></div><div class="comparison-foot"><span>${item.latest.coverage_complete === false ? 'Reported categories' : 'Generation'}</span><span>${(item.latest.total_mw / max * 100).toFixed(0)}% of selected peak</span></div></article>`;
  }).join('');
}

function renderTable(summary) {
  const categories = [...new Map(state.latestSeries[0].observations.flatMap(({ values }) => values)
    .filter(({ category }) => state.selectedCategories.includes(category))
    .map((item) => [`${item.category}:${item.label}`, item])).values()];
  $('#table-head').innerHTML = `<tr><th scope="col">SOURCE</th>${summary.map((item) => `<th scope="col">${escapeHtml(item.name)} <span>${item.code}</span></th>`).join('')}</tr>`;
  const rows = categories.map((category) => `<tr><th scope="row"><span class="source-name"><i style="--swatch:${COLORS[category.category] ?? COLORS.unknown}"></i>${escapeHtml(category.label)}</span></th>${summary.map((item) => {
    const value = item.latest.values.find((entry) => entry.category === category.category && entry.label === category.label)?.value;
    return `<td>${value === undefined ? '—' : `${fmtNumber(value)} <span>MW</span>`}</td>`;
  }).join('')}</tr>`).join('');
  const selectedTotals = summary.map((item) => categories.reduce((sum, category) => sum + (item.latest.values.find((entry) => entry.category === category.category && entry.label === category.label)?.value ?? 0), 0));
  $('#table-body').innerHTML = rows + `<tr class="total-row"><th scope="row">${summary[0].latest.coverage_complete === false ? 'Selected reported total' : 'Selected sources total'}</th>${selectedTotals.map((value) => `<td>${fmtNumber(value)} <span>MW</span></td>`).join('')}</tr>`;
  $('#table-caption').textContent = `Selected sources · latest sample period · ${fmtDate(summary[0].latest.period_end_utc)}`;
  $('#source-meta').textContent = `Source: ${summary[0].source.label} · sample ${fmtDate(summary[0].latest.period_start_utc)}–${fmtDate(summary[0].latest.period_end_utc)} · fetched ${fmtDate(summary[0].latest.fetched_at_utc)}`;
  const source = summary[0].source;
  const live = summary[0].source.provider === 'entsoe';
  $('#table-status').textContent = live ? 'MW · ENTSO-E' : 'MW · SYNTHETIC';
  $('#table-footer-status').textContent = live ? 'Reported values · coverage incomplete' : 'Demo fixture · not for analytical use';
  $('#demo-notice').hidden = live;
  $('#live-notice').hidden = !live;
  const freshnessLabels = { fresh: 'Fresh', delayed: 'Delayed', stale: 'Stale', no_data: 'No data', unknown: 'Unknown age' };
  const freshnessLabel = freshnessLabels[source.freshness?.status] ?? 'Unknown age';
  $('#demo-pill').innerHTML = live ? `<span></span>ENTSO-E · ${freshnessLabel.toUpperCase()}` : '<span></span>DEMO DATA';
  $('#app-mode').textContent = live ? 'LIVE · PRIVATE' : 'DEMO · SYNTHETIC';
  $('#system-title').textContent = live ? `ENTSO-E · ${freshnessLabel}` : 'Demo environment';
  $('#system-subtitle').textContent = live ? `${summary.map(({ code }) => code).join(', ')} · latest period age` : 'No provider connected';
  $('#chart-footnote').textContent = live ? 'Reported observations · gaps remain blank' : 'Synthetic hourly samples';
}

function renderError(message) {
  $('#dashboard-content').setAttribute('aria-busy', 'false');
  $('.content-grid').hidden = true;
  $('#table-panel').hidden = true;
  $('#kpis').innerHTML = `<div class="error-state"><strong>Dashboard data could not be loaded</strong><span>${escapeHtml(message)}</span><button type="button" id="retry">Try again</button></div>`;
  $('#retry').addEventListener('click', loadDashboard);
}

async function loadDashboard({ force = false } = {}) {
  $('#dashboard-content').setAttribute('aria-busy', 'true');
  try {
    const results = await Promise.allSettled(state.selected.map((code) =>
      request(`/api/v1/countries/${code}/generation-mix${force ? '?refresh=true' : ''}`)));
    const series = [];
    const summary = [];
    state.countryErrors = [];
    results.forEach((result, index) => {
      const code = state.selected[index];
      const country = state.countries.find((item) => item.code === code);
      if (result.status === 'rejected') {
        state.countryErrors.push(`${country?.name ?? code}: ${result.reason?.message ?? 'data unavailable'}`);
        return;
      }
      const mix = result.value;
      const latest = [...mix.observations].reverse().find(({ values }) => values.length > 0);
      if (!latest) {
        state.countryErrors.push(`${country?.name ?? code}: no generation points were reported`);
        return;
      }
      series.push(mix);
      summary.push({ ...mix.country, latest, source: mix.source });
    });
    if (!series.length) throw new Error(state.countryErrors.join('; ') || 'No selected country returned generation data.');
    state.latestSummary = summary;
    state.latestSeries = series;
    state.selectedCategoriesCatalog = [...new Map(series.flatMap(({ observations }) => observations.flatMap(({ values }) => values))
      .map(({ category, label }) => [category, { id: category, label: category === 'unknown' ? 'Unclassified sources' : label }])).values()];
    renderCurrentDashboard();
    if (state.latestSummary[0]?.source.provider === 'entsoe' && !state.refreshInterval) {
      state.refreshInterval = setInterval(() => loadDashboard({ force: true }), 15 * 60_000);
    }
  } catch (error) {
    renderError(error.message);
  }
}

function renderQualityMonitor(monitoring) {
  const panel = $('#quality-monitor');
  panel.hidden = false;
  const latest = monitoring.latest_success;
  $('#quality-summary').textContent = monitoring.checks
    ? `${monitoring.successes}/${monitoring.checks} refresh checks succeeded · ${monitoring.success_rate_pct}% success`
    : 'No refresh checks recorded yet.';
  $('#quality-updated').textContent = latest ? `Last check ${fmtDate(latest.checked_at_utc)}` : '';
  $('#quality-stats').innerHTML = latest ? `
    <article><strong>${latest.freshness_minutes ?? '—'} min</strong><span>Latest period age</span></article>
    <article><strong>${latest.intervals_observed}/${latest.intervals_expected}</strong><span>Reported intervals · last fetch</span></article>
    <article><strong>${latest.intervals_matured_observed ?? '—'}/${latest.intervals_matured_expected ?? '—'}</strong><span>Reported intervals older than 1 h</span></article>
    <article><strong>${monitoring.mean_matured_interval_pct ?? '—'}%</strong><span>Mean mature interval coverage</span></article>
    <article><strong>${escapeHtml(latest.source_categories.join(', ') || '—')}</strong><span>Source category codes</span></article>` : '';
  $('#quality-pending').textContent = latest
    ? latest.intervals_pending === null
      ? 'Publication-window breakdown is not available for this older check.'
      : latest.intervals_pending
        ? `${latest.intervals_pending} recent intervals are still within the H+1 publication window; ${latest.intervals_pending_observed} already have data. ${latest.intervals_missing_matured} intervals older than that window are missing.`
        : 'No intervals remain within the H+1 publication window.'
    : '';
  $('#quality-sparse').textContent = latest?.sparse_category_ids?.length
    ? `Sparse categories in last fetch: ${latest.sparse_category_ids.join(', ')}`
    : latest ? 'No sparse category series detected in the last fetch.' : '';
  const failureCodes = Object.entries(monitoring.failure_codes ?? {}).sort(([a], [b]) => a.localeCompare(b));
  $('#quality-failures').textContent = failureCodes.length
    ? `Failed check classifications: ${failureCodes.map(([code, count]) => `${code} (${count})`).join(', ')}`
    : '';
}

async function loadQualityMonitor() {
  try {
    const result = await request('/api/v1/monitoring/quality');
    renderQualityMonitor(result.monitoring);
  } catch {
    $('#quality-monitor').hidden = true;
  }
}

function renderCurrentDashboard() {
  if (!state.latestSummary || !state.latestSeries) return;
  const partialNotice = $('#country-load-errors');
  partialNotice.hidden = state.countryErrors.length === 0;
  partialNotice.textContent = state.countryErrors.length
    ? `Some selected countries could not be loaded: ${state.countryErrors.join(' · ')}. Showing available countries.`
    : '';
  renderKpis(state.latestSummary);
  renderChart(state.latestSeries);
  renderComparison(state.latestSummary);
  renderTable(state.latestSummary);
  renderCategoryPicker();
  syncDashboardUrl();
  $('.content-grid').hidden = false;
  $('#table-panel').hidden = false;
  $('#dashboard-content').setAttribute('aria-busy', 'false');
}

async function init() {
  try {
    const result = await request('/api/v1/countries');
    state.countries = result.countries;
    restoreDashboardState();
    renderPicker();
    await loadDashboard();
    await loadQualityMonitor();
    if (!state.monitoringInterval) state.monitoringInterval = setInterval(loadQualityMonitor, 5 * 60_000);
  } catch (error) {
    renderError(error.message);
  }
}

$('#refresh').addEventListener('click', () => { loadDashboard({ force: true }); showToast('Requesting updated data.'); });
$('#period-select').addEventListener('change', (event) => {
  state.periodHours = Number(event.target.value);
  renderCurrentDashboard();
});
init();
