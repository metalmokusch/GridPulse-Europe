# GridPulse Europe

A self-hosted dashboard for recent electricity generation by source. It displays the reporting period, source, unit, freshness, and data quality. Runtime AI is not part of the product.

## Current status

**V1.0.0 is ready for self-hosted Docker Compose deployments.** It has been validated on a private live deployment: the HU–BE–AT comparison worked, and the container reported healthy. The three-country API response returned HTTP 200 with no partial errors. HU and AT returned 96 fifteen-minute intervals, while BE returned 24 hourly intervals. The HU-only quality monitor reported 25/25 successful checks over the rolling 24-hour window, 0 failures, and 100% mature interval coverage. After a container restart, the history remained available and the next check succeeded. Live data and derived results should not be redistributed publicly without confirming applicable reuse terms.

The app has two modes:

- **Demo (default):** synthetic HU, AT, and DE fixtures; no credentials or external runtime requests. Fixture values are illustrative only, not official or observed data.
- **Private ENTSO-E live mode (opt-in):** actual-generation data by production type for 20 configured bidding zones. A 24-hour live validation successfully normalized all 20 zones; only metadata was printed or recorded. Sixteen returned 15-minute intervals; Belgium, Portugal, Latvia, and Switzerland returned hourly intervals, which remain hourly in the app. Germany is represented by the combined DE-LU zone.

The live zone list is Hungary (HU), Austria (AT), Germany-Luxembourg (DE-LU), Netherlands (NL), Poland (PL), Czechia (CZ), Slovakia (SK), Slovenia (SI), Croatia (HR), Romania (RO), Greece (GR), France (FR), Belgium (BE), Spain (ES), Portugal (PT), Finland (FI), Lithuania (LT), Latvia (LV), Estonia (EE), and Switzerland (CH). Countries with multiple bidding zones are not yet aggregated.

The dashboard compares up to three selected countries, supports 6/12/24-hour windows and source filters, and keeps country, period, and source selections in the URL. Each selected country is fetched independently, so an unavailable zone does not hide successful countries; the dashboard names partial failures. Missing periods remain blank; they are never filled with zero. Freshness is based on the latest reported market period.

## Renewable share and coverage

Live renewable share is calculated from the categories reported for each period. Explicitly mapped renewable categories enter the numerator. Unknown and unclassified categories remain in the reported total but never count as renewable. When coverage is incomplete, the dashboard labels the percentage as **reported categories only**; it is not a claim of complete system coverage. The strict domain-level mix calculation continues to require a complete-coverage attestation.

ENTSO-E's `actual` process may include estimates. Some categories can be sparse or absent in a period, so a missing point is not treated as proof of zero generation or full category coverage. The B17 waste category remains unclassified because its renewable content cannot be inferred from the source code.

## Run locally

Requires Node.js 20 or newer. The default server binds to `127.0.0.1:8787`.

```sh
npm start
```

Open <http://localhost:8787/>.

Run syntax checks and the offline test suite:

```sh
npm run check
npm test
```

There are no third-party runtime npm dependencies. Tests use Node's built-in test runner and do not call ENTSO-E.

## Enable private live mode

ENTSO-E API access requires an account and token. Keep the token in an untracked local file; never commit it or print it in logs. For local Node.js:

```sh
mkdir -p secrets
chmod 700 secrets
# Put the token in secrets/entsoe_api_token, then:
chmod 600 secrets/entsoe_api_token
GRIDPULSE_DATA_SOURCE=entsoe \
  ENTSOE_API_TOKEN_FILE=secrets/entsoe_api_token \
  npm start
```

The API token stays server-side. Live observations are cached in memory for five minutes and are not persisted. The dashboard refreshes every 15 minutes; manual refresh bypasses the cache. The separate hourly quality check currently monitors HU only and records metadata in a host-mounted JSONL log. It records check outcomes, freshness, reported and mature interval coverage, pending intervals, bounded failure codes, and category IDs. It does not record production quantities, provider response text, exception messages, or credentials.

The app has no login. Keep live mode on a trusted home network, do not forward its port to the public internet, and do not expose it to users outside your control. ENTSO-E API access does not itself establish public redistribution rights for this data item. The repo documents current source and reuse findings in [docs/data-sources.md](docs/data-sources.md); get written rights clarification before public exposure or publication of data or derived results.

## Run with Docker Compose

The default Compose service runs the synthetic demo and publishes only on loopback:

```sh
docker compose up --build -d
```

To enable the private live mode, store the token in `secrets/entsoe_api_token`, ensure the container's `node` user (UID 1000) can read it, then start both Compose files:

```sh
docker compose -f compose.yaml -f compose.entsoe.yaml up --build -d
```

The overlay stores quality history under `${GRIDPULSE_DATA_DIR:-./gridpulse-data}/quality.jsonl`. Set `GRIDPULSE_BIND_ADDRESS=0.0.0.0` in a local `.env` file only when LAN access is needed; the app has no authentication, so do not expose it to the public internet. Other useful settings are `GRIDPULSE_PORT`, `GRIDPULSE_DATA_DIR`, `ENTSOE_API_TOKEN_FILE`, and `GRIDPULSE_QUALITY_INTERVAL_MINUTES` (minimum 30 minutes; default 60).

The container runs as a non-root user with a read-only root filesystem, dropped Linux capabilities, and a health check. Live source observations are not stored; the only persistent app data is the optional metadata-only quality log.

## API

- `GET /health/live`
- `GET /health/ready`
- `GET /api/v1/countries` — returns the three demo countries or the configured live zones, depending on mode
- `GET /api/v1/categories`
- `GET /api/v1/dashboard/summary?countries=HU,AT` — accepts one to three supported countries; live responses include available `summary` rows, a `partial` flag, and safe per-country `errors`
- `GET /api/v1/countries/{code}/generation-mix`
- `GET /api/v1/countries/{code}/generation-mix/latest`
- `GET /api/v1/monitoring/quality` — available only when live quality monitoring is enabled

All observations use UTC timestamps and MW. Live response periods retain their source resolution (PT15M or PT60M); the adapter does not interpolate or split hourly readings into smaller intervals.

## Project documentation

- [Project plan and current status](docs/PROJECT_PLAN.md)
- [ENTSO-E sources, zones, and reuse notes](docs/data-sources.md)
- [Normalized data model](docs/data-model.md)
- [Architecture decisions](docs/adr/)

GitHub Actions runs syntax checks and offline tests on Node.js 20, 22, and 24 for pushes to `main` and pull requests.
