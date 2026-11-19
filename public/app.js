const COLORS = {
  wind_onshore: '#48c6a6', solar: '#f2bb63', hydro: '#68a8ef',
  nuclear: '#a991ed', gas: '#f17d77', coal: '#9ca8b5'
};
const state = { countries: [], selected: ['HU'], selectedCategories: Object.keys(COLORS), periodHours: 24, timer: null };
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

function renderPicker() {
  $('#country-picker').innerHTML = state.countries.map((country) => {
    const checked = state.selected.includes(country.code);
    return `<label class="country-chip ${checked ? 'selected' : ''}"><input type="checkbox" value="${country.code}" ${checked ? 'checked' : ''}><span class="flag flag-${country.code.toLowerCase()}" aria-hidden="true"></span><span>${escapeHtml(country.name)}</span><span class="chip-code">${country.code}</span></label>`;
  }).join('');
  $('#country-picker').querySelectorAll('input').forEach((input) => input.addEventListener('change', onCountryChange));
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
  loadDashboard();
}

function renderCategoryPicker() {
  if (!state.selectedCategoriesCatalog) return;
  $('#category-picker').innerHTML = state.selectedCategoriesCatalog.map((category) => {
    const checked = state.selectedCategories.includes(category.id);
    return `<label class="source-chip ${checked ? 'selected' : ''}"><input type="checkbox" value="${category.id}" ${checked ? 'checked' : ''}><i style="--swatch:${COLORS[category.id]}"></i><span>${escapeHtml(category.label)}</span></label>`;
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
  const weightedRenewables = total ? summary.reduce((sum, item) => sum + item.latest.total_mw * item.latest.renewable_share_pct / 100, 0) / total * 100 : 0;
  const latest = summary.reduce((value, item) => item.latest.period_end_utc > value ? item.latest.period_end_utc : value, summary[0].latest.period_end_utc);
  const leading = [...summary].sort((a, b) => b.latest.renewable_share_pct - a.latest.renewable_share_pct)[0];
  $('#kpis').innerHTML = `
    <article class="kpi-card"><div class="kpi-top"><span>COMBINED GENERATION</span><span class="kpi-icon mint" aria-hidden="true">↗</span></div><strong>${fmtNumber(total)} <small>MW</small></strong><div class="kpi-detail">Across ${summary.length} selected ${summary.length === 1 ? 'demo zone' : 'demo zones'}</div></article>
    <article class="kpi-card"><div class="kpi-top"><span>RENEWABLE SHARE</span><span class="kpi-icon blue" aria-hidden="true">◌</span></div><strong>${weightedRenewables.toFixed(1)}<small>%</small></strong><div class="kpi-detail">All sources · weighted by generation <span class="info" title="Solar, wind, hydro, biomass, and geothermal divided by total generation. Nuclear is excluded.">i</span></div></article>
    <article class="kpi-card"><div class="kpi-top"><span>HIGHEST RENEWABLE MIX</span><span class="kpi-icon gold" aria-hidden="true">✳</span></div><strong>${leading.latest.renewable_share_pct.toFixed(1)}<small>%</small></strong><div class="kpi-detail">${escapeHtml(leading.name)} <span class="kpi-inline-code">${leading.code}</span></div></article>
    <article class="kpi-card"><div class="kpi-top"><span>DATA PERIOD ENDS</span><span class="kpi-icon violet" aria-hidden="true">◷</span></div><strong class="time-value">${fmtTime(latest)}</strong><div class="kpi-detail">${fmtDate(latest)} · UTC</div></article>`;
}

function renderChart(series) {
  const primary = series[0];
  const observations = primary.observations.slice(-state.periodHours);
  const categories = observations.at(-1).values.filter(({ category }) => state.selectedCategories.includes(category));
  const width = 760; const height = 252; const left = 56; const right = 16; const top = 14; const bottom = 34;
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const max = Math.max(1, ...observations.map((observation) => observation.values
    .filter(({ category }) => state.selectedCategories.includes(category))
    .reduce((sum, item) => sum + item.value, 0))) * 1.15;
  const step = plotWidth / observations.length; const barWidth = Math.max(4, step * 0.62);
  const grid = [0, 0.25, 0.5, 0.75, 1];
  const visibleSourceNames = categories.map(({ label }) => label).join(', ');
  let svg = `<svg class="mix-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="mix-chart-title" aria-describedby="mix-chart-desc"><title id="mix-chart-title">Synthetic electricity generation profile for ${escapeHtml(primary.country.name)}</title><desc id="mix-chart-desc">Stacked hourly megawatt chart for the last ${state.periodHours} hours, showing ${escapeHtml(visibleSourceNames)}. The table below provides exact latest values for all selected countries.</desc>`;
  grid.forEach((fraction) => {
    const y = top + plotHeight * (1 - fraction);
    svg += `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="grid-line"/><text x="${left - 9}" y="${y + 4}" text-anchor="end" class="axis-label">${fmtNumber(max * fraction / 1000)}k</text>`;
  });
  observations.forEach((observation, index) => {
    let stacked = 0;
    observation.values.filter(({ category }) => state.selectedCategories.includes(category)).forEach((item) => {
      const barHeight = item.value / max * plotHeight;
      const x = left + index * step + (step - barWidth) / 2;
      const y = top + plotHeight - (stacked + item.value) / max * plotHeight;
      const opacity = item.value > 0 ? 0.9 : 0;
      svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(0, barHeight).toFixed(1)}" rx="2" fill="${COLORS[item.category]}" opacity="${opacity}"><title>${fmtTime(observation.period_end_utc)} · ${escapeHtml(item.label)}: ${fmtNumber(item.value)} MW</title></rect>`;
      stacked += item.value;
    });
    if (index % 4 === 0 || index === observations.length - 1) {
      const x = left + index * step + step / 2;
      svg += `<text x="${x.toFixed(1)}" y="${height - 9}" text-anchor="middle" class="axis-label">${new Date(observation.period_end_utc).toISOString().slice(11, 16)}</text>`;
    }
  });
  svg += '</svg>';
  $('#chart-wrap').innerHTML = svg;
  $('#chart-caption').textContent = `${primary.country.name} · last ${state.periodHours} hours · selected sources · MW`;
  $('#legend').innerHTML = categories.map((category) => `<span><i style="--swatch:${COLORS[category.category]}"></i>${escapeHtml(category.label)}</span>`).join('');
}

function renderComparison(summary) {
  const max = Math.max(...summary.map((item) => item.latest.total_mw));
  $('#comparison-list').innerHTML = summary.map((item) => {
    const share = item.latest.renewable_share_pct;
    return `<article class="comparison-item"><div class="comparison-top"><div class="comparison-country"><span class="flag flag-${item.code.toLowerCase()}" aria-hidden="true"></span><strong>${escapeHtml(item.name)}</strong><span class="chip-code">${item.code}</span></div><span class="comparison-time">${fmtTime(item.latest.period_end_utc)}</span></div><div class="comparison-metrics"><strong>${fmtNumber(item.latest.total_mw)} <small>MW</small></strong><span>${share.toFixed(1)}% renewable</span></div><div class="progress-track" role="img" aria-label="${share.toFixed(1)} percent renewable"><span style="width:${Math.max(0, Math.min(100, share))}%"></span></div><div class="comparison-foot"><span>Generation</span><span>${(item.latest.total_mw / max * 100).toFixed(0)}% of selected peak</span></div></article>`;
  }).join('');
}

function renderTable(summary) {
  const categories = summary[0].latest.values.filter(({ category }) => state.selectedCategories.includes(category));
  $('#table-head').innerHTML = `<tr><th scope="col">SOURCE</th>${summary.map((item) => `<th scope="col">${escapeHtml(item.name)} <span>${item.code}</span></th>`).join('')}</tr>`;
  const rows = categories.map((category) => `<tr><th scope="row"><span class="source-name"><i style="--swatch:${COLORS[category.category]}"></i>${escapeHtml(category.label)}</span></th>${summary.map((item) => {
    const value = item.latest.values.find((entry) => entry.category === category.category)?.value ?? 0;
    return `<td>${fmtNumber(value)} <span>MW</span></td>`;
  }).join('')}</tr>`).join('');
  const selectedTotals = summary.map((item) => categories.reduce((sum, category) => sum + (item.latest.values.find((entry) => entry.category === category.category)?.value ?? 0), 0));
  $('#table-body').innerHTML = rows + `<tr class="total-row"><th scope="row">Selected sources total</th>${selectedTotals.map((value) => `<td>${fmtNumber(value)} <span>MW</span></td>`).join('')}</tr>`;
  $('#table-caption').textContent = `Selected sources · latest sample period · ${fmtDate(summary[0].latest.period_end_utc)}`;
  $('#source-meta').textContent = `Source: synthetic demo fixture · sample period ${fmtDate(summary[0].latest.period_start_utc)} – ${fmtDate(summary[0].latest.period_end_utc)}`;
}

function renderError(message) {
  $('#dashboard-content').setAttribute('aria-busy', 'false');
  $('.content-grid').hidden = true;
  $('#table-panel').hidden = true;
  $('#kpis').innerHTML = `<div class="error-state"><strong>Dashboard data could not be loaded</strong><span>${escapeHtml(message)}</span><button type="button" id="retry">Try again</button></div>`;
  $('#retry').addEventListener('click', loadDashboard);
}

async function loadDashboard() {
  $('#dashboard-content').setAttribute('aria-busy', 'true');
  try {
    const countries = encodeURIComponent(state.selected.join(','));
    const [summaryResult, ...series] = await Promise.all([
      request(`/api/v1/dashboard/summary?countries=${countries}`),
      ...state.selected.map((code) => request(`/api/v1/countries/${code}/generation-mix`))
    ]);
    state.latestSummary = summaryResult.summary;
    state.latestSeries = series;
    state.selectedCategoriesCatalog = series[0].observations.at(-1).values.map(({ category, label }) => ({ id: category, label }));
    renderCurrentDashboard();
  } catch (error) {
    renderError(error.message);
  }
}

function renderCurrentDashboard() {
  if (!state.latestSummary || !state.latestSeries) return;
  renderKpis(state.latestSummary);
  renderChart(state.latestSeries);
  renderComparison(state.latestSummary);
  renderTable(state.latestSummary);
  renderCategoryPicker();
  $('.content-grid').hidden = false;
  $('#table-panel').hidden = false;
  $('#dashboard-content').setAttribute('aria-busy', 'false');
}

async function init() {
  try {
    const result = await request('/api/v1/countries');
    state.countries = result.countries;
    renderPicker();
    await loadDashboard();
  } catch (error) {
    renderError(error.message);
  }
}

$('#refresh').addEventListener('click', () => { loadDashboard(); showToast('Demo sample refreshed.'); });
$('#period-select').addEventListener('change', (event) => {
  state.periodHours = Number(event.target.value);
  renderCurrentDashboard();
});
init();
