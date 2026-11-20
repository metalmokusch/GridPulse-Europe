# ADR 0006: Private live quality monitoring

- Status: accepted for private owner-operated deployment
- Date: 2026-11-20

## Context

The ENTSO-E live mode needs multi-day observation on the owner's OMV host. The dashboard should retain enough history to review availability, freshness, interval coverage, and sparse source categories without storing provider values.

## Decision

- Run an independent hourly provider check by default (minimum interval 30 minutes), append one compact quality record to a local JSON Lines file on a persistent host-mounted directory, and avoid requiring an open dashboard.
- Record request result, check timestamp, latest period age in minutes, expected/observed/missing interval counts, source category IDs, and a sparse/unmapped indicator. Do not record production quantities, response XML/text, URLs containing credentials, or the API token.
- Show a rolling 24-hour summary in the dashboard. Read at most the most recent 2,880 records; the file may be compacted during a future maintenance task.
- Keep quality logging opt-in through `GRIDPULSE_QUALITY_LOG_FILE`; enable it only in the separate private ENTSO-E Compose overlay.
- Do not use this log as an observation database. No source values are persisted.

## Consequences

- The owner can leave the app running on OMV and inspect accumulated quality results later without leaving a browser open.
- The JSONL file is local operational metadata and must stay outside Git and public distribution.
- This monitoring does not establish data reuse rights or complete category coverage.
