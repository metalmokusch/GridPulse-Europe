# ADR 0004: Persistence boundary for the first self-hosted release

- Status: accepted for architecture; database driver and schema implementation deferred
- Date: 2026-11-19

## Context

The app currently serves synthetic fixtures and has no persistence. Live ingestion is separately blocked on provider access and reuse rights. Persistence should therefore be designed so fixtures and a future provider adapter can use the same normalized observation contract, without making the dashboard depend on a database API.

The likely first deployment is a single self-hosted instance. Its actual host, container runtime, filesystem, backup process, and supported Node.js version have not yet been verified. CI currently supports Node.js 20, 22, and 24.

## Options considered

- **SQLite:** one local file, simple single-host operation, transactions and indexes, and easy backup handling. It is a strong fit for one application instance. Concurrent writers, network filesystems, and multiple app replicas need deliberate handling.
- **PostgreSQL:** stronger multi-client concurrency and operational separation, but adds a database service, credentials, upgrades, backups, and more deployment work than current requirements justify.
- **JSON or flat files:** no database driver, but transactions, concurrent writes, deduplication, querying, schema evolution, and crash-safe replacement become application responsibilities.

## Decision

- Keep a persistence port between domain/application code and storage. The read API and calculations consume normalized domain records; they must not issue SQL.
- For a first single-instance self-hosted deployment, prefer a local SQLite database on a persistent local volume, with explicit schema migrations, uniqueness-based idempotency, and documented backup/restore.
- Do not select or install a SQLite package in this ADR. The built-in `node:sqlite` module is not available on Node.js 20 and is experimental in the current Node.js 24.14 environment. The project must choose whether to raise its minimum runtime, use a maintained external driver, or defer persistence until the deployment target is known.
- Do not use JSON files as the durable observation store. Keep fixtures as code-owned synthetic test/demo data.
- Do not introduce PostgreSQL unless measured workload or a multi-instance requirement needs it.
- Persist only source records whose retention and reuse rights are confirmed. Until then, do not build scheduled live polling or persist real provider responses.

## Follow-up requirements before implementation

1. Confirm the target OMV host's architecture, supported Node.js/container version, and persistent local volume path.
2. Decide the minimum supported Node.js version and choose a maintained SQLite driver compatible with it; review native build/runtime requirements before adding a dependency.
3. Define a stable record identity over provider, dataset, source zone, source category, period, unit, and relevant status/version fields. Ensure re-fetches do not duplicate observations and corrections can be represented.
4. Specify UTC storage, migration rollback/recovery behavior, retention, and a tested backup/restore procedure.
5. Add persistence integration tests against a temporary database before wiring storage into the HTTP handlers.

## Consequences

The domain model can progress without a database dependency. A single-file database is the provisional deployment direction, not a final package or schema commitment. CI can keep testing the pure domain on Node.js 20 while a future storage implementation runs in a version-compatible job or uses a compatible driver.
