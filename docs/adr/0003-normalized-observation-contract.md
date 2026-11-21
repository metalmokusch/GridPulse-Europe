# ADR 0003: Normalized observation and mix calculation contract

- Status: accepted for the synthetic demo and future adapter boundary
- Date: 2026-11-19

## Context

The dashboard needs consistent UTC periods, units, zone identifiers, source categories, and quality/status metadata before any live provider is enabled. Renewable share can be misleading when provider categories are missing, unknown, or incorrectly classified.

## Decision

- Model one normalized record per provider source-category and time period.
- Preserve the provider's category string and use the explicit normalized `unknown` category if no reviewed mapping exists.
- Version the domain taxonomy as `1.2.0`; renewable categories include `other_renewable` alongside solar, wind onshore/offshore, hydro, biomass, and geothermal. Pumped hydro storage is separate and excluded from renewable share; ENTSO-E B10 may carry negative values while pumping. Nuclear is excluded.
- Values must be finite; negative values are accepted only for the normalized `hydro_pumped_storage` category.
- Require a caller-supplied completeness attestation before publishing a renewable percentage. Return `null` if coverage is incomplete, a non-zero unknown amount exists, or the denominator is zero.
- Require a mix to contain only one provider, dataset, zone, period, unit, and data status.
- Use the validator and calculation only with synthetic data until the provider contract and reuse rights are approved.

## Consequences

Adapters must own category mappings and completeness evidence. The core domain does not guess a category or infer complete coverage from the values. This keeps the demo testable offline and lets the source adapter change without changing recommendation or UI semantics.

Freshness thresholds are also caller-supplied. The domain classifier defines no universal threshold until a provider's publication cadence and correction behavior have been validated. A synthetic demo timestamp is not presented as evidence of live-source freshness.
