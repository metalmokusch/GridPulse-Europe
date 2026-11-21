# GridPulse Europe

A self-hosted dashboard for comparing European electricity generation mixes with clear source, time, unit, freshness, and data-quality information. Runtime AI is not part of the product.

## Current status

The first demo vertical slice is implemented. It serves synthetic HU, AT, and DE generation series through a small read-only Node.js API and presents a responsive dashboard with an hourly stacked chart, country comparison, and exact-value table. The chart supports 6, 12, and 24-hour windows plus source-category filters; country, period, and source selections are encoded in the URL so a view can be shared. The fixture is illustrative only: it is not official, observed, or live data.

The default demo needs no provider credentials or external runtime calls. No third-party npm dependencies are used.

The owner has received ENTSO-E API access. An optional, manual validation request is available for confirming the candidate query contract. It is separate from the app runtime and does not persist or print response values:

```sh
ENTSOE_API_TOKEN='your-local-token' npm run entsoe:validate
```

Prefer loading the variable from an untracked local `.env` or the shell. Do not paste the token into chat or commit it. Public display of ENTSO-E data remains disabled while item 16.1.B&C reuse rights are unresolved.

For a local secret file, place the token in `secrets/entsoe_api_token` and restrict access (`chmod 600 secrets/entsoe_api_token`). Then run `ENTSOE_API_TOKEN_FILE=secrets/entsoe_api_token npm run entsoe:validate`. The demo Compose service does not receive the token, because the current app does not use live data.

## Private live HU mode

The server can fetch live ENTSO-E HU data on demand when explicitly enabled. Local Node.js:

```sh
GRIDPULSE_DATA_SOURCE=entsoe ENTSOE_API_TOKEN_FILE=secrets/entsoe_api_token npm start
```

Docker Compose uses a separate overlay, which mounts the token as a file-backed secret and leaves the default demo service unchanged. The secret file must be readable by the container's `node` user (UID 1000); on a Linux host, set its owner to that UID and use mode `400` where appropriate:

```sh
sudo chown 1000:1000 secrets/entsoe_api_token
sudo chmod 400 secrets/entsoe_api_token
docker compose -f compose.yaml -f compose.entsoe.yaml up --build -d
```

The ENTSO-E Compose overlay also stores a local quality log at `${GRIDPULSE_DATA_DIR:-./gridpulse-data}/quality.jsonl`. It runs a separate hourly check by default (`GRIDPULSE_QUALITY_INTERVAL_MINUTES`, minimum 30 minutes), independent of dashboard visits, and records request outcome, latest-period age, raw and H+1-mature interval coverage, pending recent intervals, bounded failure classifications, and source category IDs. It never writes production quantities, response text, exception messages, or the API token. The log is excluded from Git. The dashboard's “Local quality history” panel summarizes the most recent 24 hours. Summaries read at most the last 2,880 records (30 days at the default cadence); older records show mature-coverage metrics as unavailable because they do not contain the required interval details.

The app currently supports only the validated HU zone in live mode. Responses are cached in memory for five minutes; manual refresh bypasses that cache and live mode refreshes automatically every 15 minutes. No provider values are persisted. Freshness is classified from the latest market period end using provisional 90-minute/3-hour thresholds. Unconfirmed/missing categories remain visible as gaps and renewable share is withheld. The existing server has no login, so keep the default host binding at `127.0.0.1` and do not expose live mode to a network you do not control. Live mode stays opt-in and is not part of the public demo.

The private OMV instance has been deployed and the owner confirmed access from the home LAN. Its host binding is overridden to `0.0.0.0`; because the dashboard has no login, keep it limited to a trusted LAN and do not forward the port to the public internet.

## Run locally

Requires Node.js 20 or newer.

```sh
npm start
```

Open <http://localhost:8787/>. Set `PORT` to use another port.

## Validate

```sh
npm run check
npm test
```

The tests exercise the health and data API contracts, taxonomy and observation validation, freshness classification, synthetic mix arithmetic, read-only behavior, and static asset delivery without opening a network port.

The GitHub Actions workflow runs syntax checks and the offline suite on Node.js 20, 22, and 24 for pushes to `main` and pull requests.

## Run with Docker Compose

Docker Compose is the intended self-hosted deployment path. On first run, copy or clone the repository to the OMV host and run:

```sh
docker compose up --build -d
```

By default, the demo binds to `127.0.0.1:8787` on the host. A reverse-proxy process on the host can reach it there; a reverse-proxy container needs a shared Docker network or another explicit route. To expose it on the LAN, set `GRIDPULSE_BIND_ADDRESS=0.0.0.0` in a local `.env` file before starting Compose. Change the host port with `GRIDPULSE_PORT` if needed. The demo has no login, so place it behind an access-controlled reverse proxy before exposing it beyond a trusted LAN.

This fixture-only release does not write application data and has no database volume yet. Persistent storage and backup configuration will be added with the database implementation.

## API

- `GET /health/live`
- `GET /health/ready`
- `GET /api/v1/countries`
- `GET /api/v1/categories`
- `GET /api/v1/dashboard/summary?countries=HU,AT`
- `GET /api/v1/countries/{code}/generation-mix`
- `GET /api/v1/countries/{code}/generation-mix/latest`

All demo observations use MW and UTC periods and are explicitly marked `synthetic`. The versioned taxonomy is exposed at `/api/v1/categories`. In live mode, renewable share is calculated over the categories actually reported: only explicitly mapped renewable sources enter the numerator; unknown and unclassified categories stay in the denominator and never count as renewable. Missing intervals remain blank. The dashboard labels this as reported categories only while coverage remains incomplete.

## Project decisions and next steps

- [Project plan and current status](docs/PROJECT_PLAN.md)
- [ENTSO-E source and reuse validation](docs/data-sources.md)
- [ENTSO-E source gate decision](docs/adr/0002-entsoe-source-gate.md)
- [Normalized observation contract](docs/data-model.md)
- [Observation contract decision](docs/adr/0003-normalized-observation-contract.md)
- [Persistence boundary decision](docs/adr/0004-persistence-boundary.md)
- [Live data freshness thresholds](docs/adr/0005-live-data-freshness-thresholds.md)
- [Private live quality monitoring](docs/adr/0006-private-quality-monitoring.md)
- [Initial technical direction](docs/adr/0001-initial-technical-direction.md)

An opt-in, private ENTSO-E live mode supports 20 single-bidding-zone countries in [`countries.js`](src/providers/entsoe/countries.js), including HU, AT, and the combined DE-LU zone. A short metadata-only live request returned data for all 20; some are hourly, retained as hourly without inventing quarter-hour readings. The dashboard remains synthetic by default. Public redistribution is not enabled; ENTSO-E attribution and primary-owner rights requirements still apply. See the project plan and source notes for current details.
