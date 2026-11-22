# ADR 0006: Private live quality monitoring

- Status: accepted for private owner-operated deployment
- Date: 2026-11-20

## Context

The ENTSO-E live mode needs multi-day observation on a private self-hosted deployment. The dashboard should retain enough history to review availability, freshness, interval coverage, and sparse source categories without storing provider values.

## Decision

- Run an independent hourly provider check by default (minimum interval 30 minutes), append one compact quality record to a local JSON Lines file on a persistent host-mounted directory, and avoid requiring an open dashboard.
- Record request result, check timestamp, latest period age in minutes, full-window expected/observed/missing intervals, mature-window expected/observed/missing intervals, recent intervals still within H+1, source category IDs, a sparse/unmapped indicator, and a bounded failure classification (for example HTTP_503, REQUEST_TIMEOUT, PROVIDER_REJECTED, EMPTY_RESPONSE, or INVALID_RESPONSE). Unknown error details collapse to `UNCLASSIFIED`. Never persist exception messages, production quantities, response XML/text, URLs containing credentials, or the API token.
- For the monitor only, classify an interval as mature once its period end is at least 60 minutes before the check time. This follows the provider's stated H+1 deadline; it is a reporting grace window, not an attestation that the provider always publishes exactly one hour later.
- Legacy log rows do not contain interval timestamps/counts needed for this split. Do not infer their mature coverage; show it as unavailable until new-format checks have been recorded.
- Show a rolling 24-hour summary in the dashboard, including both raw 24-hour coverage and coverage after the H+1 grace window. Read at most the most recent 2,880 records; the file may be compacted during a future maintenance task.
- Keep quality logging opt-in through `GRIDPULSE_QUALITY_LOG_FILE`; enable it only in the separate private ENTSO-E Compose overlay.
- Do not use this log as an observation database. No source values are persisted.

## Consequences

- The operator can leave the app running in its self-hosted environment and inspect accumulated quality results later without leaving a browser open.
- The JSONL file is local operational metadata and must stay outside Git and public distribution.
- This monitoring does not establish data reuse rights or complete category coverage.
