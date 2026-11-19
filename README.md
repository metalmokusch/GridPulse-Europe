# GridPulse Europe

A self-hosted dashboard for comparing European electricity generation mixes with clear source, time, unit, freshness, and data-quality information. Runtime AI is not part of the product.

## Current status

The first demo vertical slice is implemented. It serves synthetic HU, AT, and DE generation series through a small read-only Node.js API and presents a responsive dashboard with an hourly stacked chart, country comparison, and exact-value table. The fixture is illustrative only: it is not official, observed, or live data.

No provider credentials, external runtime calls, or third-party npm dependencies are required.

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

## API

- `GET /health/live`
- `GET /health/ready`
- `GET /api/v1/countries`
- `GET /api/v1/categories`
- `GET /api/v1/dashboard/summary?countries=HU,AT`
- `GET /api/v1/countries/{code}/generation-mix`
- `GET /api/v1/countries/{code}/generation-mix/latest`

All demo observations use MW and UTC periods and are explicitly marked `synthetic`. The versioned taxonomy is exposed at `/api/v1/categories`. Renewable share is solar, wind, hydro, biomass, and geothermal divided by total generation; nuclear is excluded. A share is omitted if coverage is incomplete or unknown source data contributes a non-zero amount.

## Project decisions and next steps

- [Project plan and current status](docs/PROJECT_PLAN.md)
- [ENTSO-E source and reuse validation](docs/data-sources.md)
- [ENTSO-E source gate decision](docs/adr/0002-entsoe-source-gate.md)
- [Normalized observation contract](docs/data-model.md)
- [Observation contract decision](docs/adr/0003-normalized-observation-contract.md)
- [Persistence boundary decision](docs/adr/0004-persistence-boundary.md)
- [Initial technical direction](docs/adr/0001-initial-technical-direction.md)

Live ENTSO-E ingestion remains gated on account access, confirmation of the current query contract, and reuse/attribution rights for generation data item 16.1.B&C. See the supplied project specification for the full product requirements.
