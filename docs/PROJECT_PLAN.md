# GridPulse Europe — project plan

## Product overview

GridPulse Europe is a public, self-hosted analytics application for recent electricity generation by source across a pilot set of European countries/zones. It must show when an observation refers to, when it was fetched, its source, unit, and quality/freshness. Missing or stale data must remain explicit. The deployed application has no AI/model dependency.

## Implementation plan

1. **Validate source and environment:** official ENTSO-E access, zone, generation semantics, rate-limit, and reuse documentation reviewed. Still pending: authorized API access, confirmation of the current query contract against a real authorized request, explicit reuse rights for item 16.1.B&C, and deployment validation.
2. **Record technical choices:** initial native Node.js/demo stack is recorded in ADR 0001. Revisit framework, package manager, chart library, and database only when the next vertical slice justifies them; document each change in an ADR.
3. **Bootstrap demo-first vertical slice:** complete. API health/readiness, synthetic fixture data, and a responsive dashboard with explicit time/unit/status and tabular fallback run without external credentials.
4. **Build data contracts and persistence:** provider-neutral UTC observation validation, versioned taxonomy, safe renewable-share calculation, and configurable freshness classifier are implemented and covered by offline tests. Country/zone distinction is preserved. A single-instance SQLite persistence boundary is the provisional direction; package choice, migrations, adapter-owned category maps, and idempotent storage remain open (see ADR 0004).
5. **Add provider adapter:** only after source access, query behavior, licensing/reuse, and rate limits are documented. Keep credentials server-side and reads initially manual/small-volume.
6. **Complete analytics and operations:** comparison/history, accessible chart/table states, Compose deployment, persistent data, backup/restore, security checks, and OMV validation.

## Current state

- Standalone local Git repository connected to the public `metalmokusch/GridPulse-Europe` repository.
- First demo vertical slice implemented with native Node.js ESM, built-in HTTP, static HTML/CSS/JavaScript, synthetic HU/AT/DE fixtures, health/data endpoints, responsive dashboard, SVG chart, comparison cards, and table alternative.
- Dashboard controls support 6/12/24-hour chart windows and source-category filtering for the SVG chart and latest-value table. Country comparison and headline KPIs remain based on all sources.
- Dashboard country, period, and source selections are encoded in the URL so selected views can be shared and restored.
- Sixteen offline Node.js tests cover health, country/zone metadata, observation validation, UTC/unit/synthetic contracts, taxonomy, renewable-share completeness and arithmetic, freshness classification, input validation, and static asset delivery.
- No third-party runtime dependencies or provider credentials. A GitHub Actions CI matrix targets Node.js 20, 22, and 24 with read-only repository permissions.
- GitHub Actions run #7 for commit `6e39142` completed successfully on 2026-11-19 (Node.js 20/22/24 matrix and container image build).
- Dockerfile and Compose configuration now package the fixture-only demo with a non-root user, read-only filesystem, dropped Linux capabilities, health check, and loopback-only default binding. GitHub Actions builds the container image. No data volume is configured before persistence exists.
- Current official ENTSO-E data-source documentation and reuse terms are recorded in [data-sources.md](data-sources.md). Provider integration and live data queries remain gated on authorized access and reuse rights. Candidate query parameters need confirmation against current documentation.

## External dependency backlog

- Obtain authorized ENTSO-E REST API access before implementing the provider adapter. Keep credentials out of the repository.
- Keep provider credentials out of the repository and store them only in the deployment environment.
- Obtain written reuse rights for data item 16.1.B&C before publishing API results or derived data.
- Current live query parameters, output shape, category completeness, and resolution still require a short authorized validation request.

## Immediate next task

Continue with source-independent work: extract dashboard URL-state parsing/serialization into a small testable module and cover valid/default/invalid links using the built-in Node test runner. Defer OMV deployment testing until persistent storage or live data makes it useful; do not configure a data volume before there is data to persist. Keep provider integration, real-data fixtures, and persisted polling behind the external backlog gates above.

