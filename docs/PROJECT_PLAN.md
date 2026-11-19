# GridPulse Europe — project plan

## Product overview

GridPulse Europe is a public, self-hosted analytics application for recent electricity generation by source across a pilot set of European countries/zones. It must show when an observation refers to, when it was fetched, its source, unit, and quality/freshness. Missing or stale data must remain explicit. The deployed application has no AI/model dependency.

## Implementation plan

1. **Validate source and environment:** confirm ENTSO-E account/token access, one candidate zone and query shape, actual-generation categories, update cadence, and reuse/attribution terms. Check the target OMV version and hardware when available. No token is needed in this repository.
2. **Record technical choices:** select the smallest maintainable TypeScript stack, package manager, chart library, and licenses. Keep each choice reviewable in an ADR; avoid adding packages before this is settled.
3. **Bootstrap demo-first vertical slice:** API health/readiness, synthetic fixture data, and a responsive dashboard with explicit time/unit/status and tabular fallback. It must start without external credentials.
4. **Build data contracts and persistence:** UTC observation model, country/zone distinction, category mappings, migrations, freshness rules, and idempotent storage; validate with offline fixtures.
5. **Add provider adapter:** only after source access, query behavior, licensing/reuse, and rate limits are documented. Keep credentials server-side and reads initially manual/small-volume.
6. **Complete analytics and operations:** comparison/history, accessible chart/table states, Compose deployment, persistent data, backup/restore, security checks, and OMV validation.

## Current state

- Separate project directory created; no application code or dependencies.
- No ENTSO-E account/token, target OMV version, or reuse terms were validated in this session.

## Immediate next task

Resolve the Phase 0 source gate without exposing a token: use official ENTSO-E documentation/account flow to verify access, then document one token-free query definition (zone, document/process parameters, interval, response format) and the applicable reuse/attribution conditions. Until then, build only synthetic/demo code.
