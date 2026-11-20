import { readFileSync } from 'node:fs';
import { parseEntsoeResponse } from './parse-response.js';

const BASE_URL = 'https://web-api.tp.entsoe.eu/api';
const TOKEN_FILE = process.env.ENTSOE_API_TOKEN_FILE;
let TOKEN = process.env.ENTSOE_API_TOKEN;

if (TOKEN_FILE) {
  try {
    TOKEN = readFileSync(TOKEN_FILE, 'utf8').trim();
  } catch {
    console.error('Could not read ENTSOE_API_TOKEN_FILE. Check the local secret file path and permissions.');
    process.exitCode = 2;
  }
}

function utcParameter(date) {
  return date.toISOString().slice(0, 16).replace(/[-:T]/g, '');
}

if (process.exitCode !== 2 && !TOKEN) {
  console.error('ENTSOE_API_TOKEN is not set. Store the token in a local environment variable; do not paste it into chat or source files.');
  process.exitCode = 2;
} else {
  const now = new Date();
  const end = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  const start = new Date(end.getTime() - 3 * 3_600_000);
  const params = new URLSearchParams({
    securityToken: TOKEN,
    documentType: 'A75',
    processType: 'A16',
    in_Domain: '10YHU-MAVIR----U',
    periodStart: utcParameter(start),
    periodEnd: utcParameter(end)
  });
  const url = `${BASE_URL}?${params}`;

  try {
    const response = await fetch(url, { headers: { accept: 'application/xml' }, signal: AbortSignal.timeout(20_000) });
    const body = await response.text();
    const report = parseEntsoeResponse(body);
    const success = response.ok && report.timeseries_count > 0;
    console.log(JSON.stringify({
      request: 'HU actual generation by production type',
      period_start_utc: start.toISOString(),
      period_end_utc: end.toISOString(),
      http_status: response.status,
      success,
      ...report,
      response_values_logged: false,
      point_timestamps_or_values_logged: false
    }, null, 2));
    if (!success) process.exitCode = 1;
  } catch (error) {
    console.error(`ENTSO-E request failed: ${error.name === 'TimeoutError' ? 'request timed out' : 'network or response error'}. Details omitted to avoid leaking request credentials.`);
    process.exitCode = 1;
  }
}
