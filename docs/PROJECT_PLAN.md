# GridPulse Europe — project plan

## Product overview

GridPulse Europe is a public, self-hosted analytics application for recent electricity generation by source across a pilot set of European countries/zones. It must show when an observation refers to, when it was fetched, its source, unit, and quality/freshness. Missing or stale data must remain explicit. The deployed application has no AI/model dependency.

## Implementation plan

1. **Validate source and environment:** official ENTSO-E access, zone, generation semantics, rate-limit, and current terms reviewed. API access and short HU query are validated. A private, opt-in, non-persistent HU live mode is implemented. Pending: investigate sparse B06 series. Written reuse clarification is required before exposing the service to others or publishing data.
2. **Record technical choices:** initial native Node.js/demo stack is recorded in ADR 0001. Revisit framework, package manager, chart library, and database only when the next vertical slice justifies them; document each change in an ADR.
3. **Bootstrap demo-first vertical slice:** complete. API health/readiness, synthetic fixture data, and a responsive dashboard with explicit time/unit/status and tabular fallback run without external credentials.
4. **Build data contracts and persistence:** provider-neutral UTC observation validation, versioned taxonomy, safe renewable-share calculation, and configurable freshness classifier are implemented and covered by offline tests. Country/zone distinction is preserved. A single-instance SQLite persistence boundary is the provisional direction; package choice, migrations, adapter-owned category maps, and idempotent storage remain open (see ADR 0004).
5. **Add provider adapter:** access and HU query behavior are validated. Private HU live mode is opt-in, server-side, non-persistent, and limited to one validated zone. Wider use still requires written reuse clarification and a coverage policy.
6. **Complete analytics and operations:** the responsive dashboard, Compose deployment, and initial OMV validation are complete. Multi-day live-feed monitoring is underway. Historical analytics, persistence of source observations, backup/restore, and broader security review remain open.

## Current state

- Standalone local Git repository connected to the public `metalmokusch/GridPulse-Europe` repository.
- First demo vertical slice implemented with native Node.js ESM, built-in HTTP, static HTML/CSS/JavaScript, synthetic HU/AT/DE fixtures, health/data endpoints, responsive dashboard, SVG chart, comparison cards, and table alternative.
- Dashboard controls support 6/12/24-hour chart windows and source-category filtering for the SVG chart and latest-value table. Country comparison and headline KPIs remain based on all sources.
- Dashboard country, period, and source selections are encoded in the URL so selected views can be shared and restored.
- Thirty-four offline Node.js tests cover dashboard demo/live rendering, health, country/zone metadata, observation validation, UTC/unit/synthetic contracts, taxonomy, renewable-share completeness and arithmetic, freshness classification, dashboard URL state, ENTSO-E client/parsing/normalization and private live routes, privacy-safe quality monitoring, input validation, and static asset delivery.
- No third-party runtime dependencies or provider credentials are required. A GitHub Actions CI matrix targets Node.js 20, 22, and 24 with read-only repository permissions.
- GitHub Actions has successfully checked the dashboard and container build, using a Node.js 20/22/24 test matrix.
- Dockerfile and Compose configuration now package the fixture-only demo with a non-root user, read-only filesystem, dropped Linux capabilities, health check, and loopback-only default binding. GitHub Actions builds the container image. No data volume is configured before persistence exists.
- Current ENTSO-E data-source findings and reuse terms are recorded in [data-sources.md](data-sources.md). The owner has authorized access and validated short HU requests. Private live mode is enabled by explicit configuration; sharing/publishing remains gated on reuse clarification and coverage policy.
- A separate manual ENTSO-E validation script sends a short HU request and reports only response metadata/category identifiers. It does not log response values or persist data. The token is read server-side from `ENTSOE_API_TOKEN` or `ENTSOE_API_TOKEN_FILE`; the default demo container receives no token.
- Dashboard URL state parsing and serialization live in a dependency-free browser module and are covered by offline tests for defaults, valid and invalid links, and serialization.
- An owner-run three-hour HU request returned HTTP 200, 15 time series, 126 points at PT15M resolution, and categories B01, B02, B04, B05, B06, B09, B11, B12, B14, B15, B16, B17, B19, and B20. This does not establish category completeness or equal series coverage.
- The ENTSO-E source-code label dictionary is recorded separately from normalized category mappings; mixed or ambiguous labels remain unmapped pending explicit policy.
- A successful three-hour HU query reported 15 series with 126 points at PT15M. Thirteen categories had 11 points across 14:00Z–16:45Z; B06 appeared as three sparse series. Missing points are not assumed to mean zero, and coverage is not yet attested complete.
- The ENTSO-E XML normalizer creates 15-minute domain observations, maps only unambiguous PSR categories, preserves series diagnostics, and always marks coverage incomplete. The live HU client uses it at runtime but does not persist records. Offline tests cover valid points, unknown mappings, sparse/repeated series, and malformed data. The default dashboard still reads synthetic fixtures.
- Opt-in `GRIDPULSE_DATA_SOURCE=entsoe` mode fetches HU actual-generation data server-side, uses a five-minute in-memory cache, and does not persist provider data. The normal demo configuration remains synthetic. Compose has a separate ENTSO-E overlay for a file-backed token secret.
- Native `npm start` binds to loopback by default; the container listens internally on all interfaces while Compose publishes only to host loopback by default.
- Live dashboard labels identify ENTSO-E, show reported-only totals, leave missing intervals blank, and withhold renewable share while coverage is incomplete. Live mode is designed for the owner's private instance, not for public exposure or redistribution.
- Live mode classifies age from the latest period end: fresh through 90 minutes, delayed through 3 hours, then stale. These provisional thresholds are documented in ADR 0005.
- Live mode refreshes automatically every 15 minutes; the manual refresh button bypasses the five-minute memory cache. Requests remain server-side and no observations are persisted.
- The private ENTSO-E Compose overlay runs an independent hourly quality check and appends metadata-only records to a persistent host-mounted JSONL log. The dashboard displays rolling 24-hour success, freshness, interval coverage, and sparse category summaries. Production quantities and credentials are not logged.
- The private live container is running on the OMV host and is healthy. The owner confirmed dashboard access over the home LAN. The first background check succeeded: 96/96 intervals had at least one reported category; B05, B06, and B09 were flagged by the heuristic sparse-category check. This is an initial sample, not a multi-day conclusion.

## External dependency backlog

- Investigate why B06 (oil) arrived in three sparse series and whether the query's last requested 15-minute interval is omitted; keep real response values out of the repository.
- Obtain written reuse clarification before exposing live data to other users or publishing API results or derived data.

## Immediate next task

Leave the private live mode running on OMV for several days, then review the metadata-only quality history for freshness, interval coverage, sparse categories, and request failures. Before sharing or publishing results, obtain written reuse clarification for item 16.1.B&C. Complete the dashboard product slice before adding more countries.
