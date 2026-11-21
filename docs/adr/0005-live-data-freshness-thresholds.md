# ADR 0005: Provisional ENTSO-E freshness thresholds

- Status: provisional
- Date: 2026-11-20

## Context

The ENTSO-E Actual Generation per Production Type item has an H+1 publication deadline. The private live mode needs to distinguish a recently ended market period from delayed or old data. The API is queried on demand and its result is cached in memory for five minutes; provider polling cadence and revision behavior have not yet been measured over multiple days across all enabled zones.

## Decision

- Classify freshness from the latest reported `period_end_utc`, not fetch time.
- Use `fresh` through 90 minutes old, `delayed` through 3 hours old, and `stale` after 3 hours. A missing observation is `no_data`; a future period end is `unknown`.
- Recalculate status at each API response even when the provider values come from the five-minute cache.
- Refresh the live view every 15 minutes; manual refresh bypasses the five-minute cache. This is a conservative UI polling cadence and remains subject to change if source update behavior requires it.
- Label these thresholds provisional in the live UI. They were first chosen against HU and need review against mature interval history across the enabled zones.

## Consequences

Users can distinguish a recent market period from one delayed by normal publication time or older than expected. The status does not claim that data is final or measured-only; ENTSO-E actual-generation values may include estimates and later updates. These thresholds must be revisited after multi-day observation across the enabled zones and before increasing automated polling frequency.
