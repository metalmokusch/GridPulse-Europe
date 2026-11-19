# GridPulse Europe — project plan

## Product overview

GridPulse Europe is a public, self-hosted analytics application for recent electricity generation by source across a pilot set of European countries/zones. It must show when an observation refers to, when it was fetched, its source, unit, and quality/freshness. Missing or stale data must remain explicit. The deployed application has no AI/model dependency.

## Implementation plan

1. **Validate source and environment:** official ENTSO-E access, zone, generation semantics, rate-limit, and reuse documentation reviewed. Still pending: authorized API access, confirmation of the current query contract against a real authorized request, explicit reuse rights for item 16.1.B&C, and deployment validation.
2. **Record technical choices:** initial native Node.js/demo stack is recorded in ADR 0001. Revisit framework, package manager, chart library, and database only when the next vertical slice justifies them; document each change in an ADR.
3. **Bootstrap demo-first vertical slice:** complete. API health/readiness, synthetic fixture data, and a responsive dashboard with explicit time/unit/status and tabular fallback run without external credentials.
4. **Build data contracts and persistence:** UTC observation model, country/zone distinction, category mappings, migrations, freshness rules, and idempotent storage; validate with offline fixtures.
5. **Add provider adapter:** only after source access, query behavior, licensing/reuse, and rate limits are documented. Keep credentials server-side and reads initially manual/small-volume.
6. **Complete analytics and operations:** comparison/history, accessible chart/table states, Compose deployment, persistent data, backup/restore, security checks, and OMV validation.

## Current state

- Standalone local Git repository connected to the public `metalmokusch/GridPulse-Europe` repository.
- First demo vertical slice implemented with native Node.js ESM, built-in HTTP, static HTML/CSS/JavaScript, synthetic HU/AT/DE fixtures, health/data endpoints, responsive dashboard, SVG chart, comparison cards, and table alternative.
- Five offline Node.js tests cover health, country/zone metadata, UTC/unit/synthetic data contracts, renewable share arithmetic, input validation, and static asset delivery.
- No third-party runtime dependencies or provider credentials.
- Current official ENTSO-E data-source documentation and reuse terms are recorded in [data-sources.md](data-sources.md). Provider integration and live data queries remain gated on authorized access and reuse rights. Candidate query parameters need confirmation against current documentation.

## Immediate next task

The remaining source gate is external: obtain authorized API access, verify the current query parameters with one short HU request, and get written clarification that data item 16.1.B&C may be reused for this project. Until these are clear, keep the adapter unconnected and use synthetic/demo data. Afterward, record an approved response fixture and XML/category details, then implement the provider-neutral parser.
