# Normalized generation data model

This contract is provider-neutral. It does not claim that the ENTSO-E item or its categories have been validated against a live response. Provider-specific parsers must preserve the source value and map into this domain explicitly.

## Generation observation

`src/domain/observation.js` validates a single source-category observation with these required fields:

| Field | Meaning |
| --- | --- |
| `provider`, `provider_dataset` | Source and dataset identifiers |
| `source_zone` | Provider area identifier/label; distinct from country code |
| `period_start_utc`, `period_end_utc` | ISO 8601 UTC interval, end exclusive by source convention when confirmed |
| `source_published_at_utc` | Nullable source publication timestamp |
| `fetched_at_utc` | Time this application fetched the value |
| `source_category` | Exact provider/source category identifier, preserved verbatim |
| `normalized_category` | Versioned GridPulse category; use `unknown` when no safe mapping exists |
| `taxonomy_version` | Exact version used to classify `normalized_category` (currently `1.2.0`) |
| `value`, `unit` | Finite number and explicit `MW` or `MWh`; negative values are valid only for pumped hydro storage (`hydro_pumped_storage`) because ENTSO-E B10 uses negative values while pumping |
| `data_status` | `actual`, `forecast`, `estimate`, `unknown`, or `synthetic` |
| `quality_flags` | Zero or more non-empty diagnostic flags |

The validator requires UTC `Z` timestamps and a positive period. It rejects unsupported units, statuses, categories, and invalid values. It canonicalizes timestamps to millisecond precision and de-duplicates quality flags.

## Taxonomy v1.2.0

Normalized categories: `solar`, `wind_onshore`, `wind_offshore`, `hydro`, `hydro_pumped_storage`, `biomass`, `geothermal`, `other_renewable`, `nuclear`, `coal`, `gas`, `oil`, `other_fossil`, `other`, and `unknown`.

Renewable-share membership is explicitly defined as solar, onshore/offshore wind, hydro, biomass, geothermal, and other renewables. Nuclear is excluded. This domain taxonomy does not establish how any provider category maps to these values; mapping tables remain adapter-owned and must be documented and tested separately.

Pumped hydro storage is kept separate from renewable hydro and excluded from renewable-share calculations. ENTSO-E B10 values can be positive in generating mode or negative in pumping mode; preserve the sign so reported net generation totals remain meaningful. Other categories continue to reject negative values.

## Mix summary policy

`summarizeGenerationMix` rejects observations from different providers, datasets, zones, time periods, units, or data statuses. It sums the supplied values as the total and renewable amounts. Its strict analytical percentage is returned only when the caller explicitly attests `coverage_complete: true`, no unknown-category amount is present, and the total is non-zero. Otherwise that function returns `null` with a reason (`incomplete_coverage`, `unknown_categories`, or `zero_total`).

The private ENTSO-E live adapter separately reports an explicitly labeled *reported-category share*: renewable mapped values divided by the sum of values actually returned for the same interval. It never fills missing intervals with zero. Unknown and known-unclassified categories remain in that reported denominator but never enter the renewable numerator. `coverage_complete` stays false, and the dashboard labels the percentage “reported categories only.” This is a partial observed mix metric, not an attestation of full-system renewable share.

`coverage_complete` must only be true when the provider response is known to include all categories required for the denominator. The system must not infer completeness from a convenient sum or from absent categories. Until the ENTSO-E response contract and category semantics are validated, this rule is exercised only with the complete synthetic demo fixture.

## Validation

`npm test` covers timestamp/unit/value/status validation, unknown-category preservation, taxonomy classification, incomplete coverage behavior, zero denominator, and cross-zone/period/unit/status rejection.

## Freshness classification

`src/domain/freshness.js` classifies a non-null `data_as_of_utc` using caller-supplied `freshForMs` and `staleAfterMs` thresholds. It returns `fresh`, `delayed`, or `stale`; a missing timestamp returns `no_data`, and a future timestamp returns `unknown` with a `future_timestamp` reason. It defines no defaults because acceptable freshness depends on the selected provider's publication cadence. The demo continues to label its samples `synthetic` and does not misrepresent them as fresh source data. Its complete synthetic fixture explicitly supplies zero-valued records for taxonomy categories absent from the sample recipe.
