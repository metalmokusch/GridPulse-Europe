# ADR 0002: ENTSO-E source selection and reuse gate

- Status: candidate source selected; live integration blocked
- Date: 2026-11-19

## Context

ENTSO-E documents the generation-by-production-type data item 16.1.B&C, a REST query using document type A75 and realised process A16, and candidate EICs for Hungary and Austria. The Germany-Luxembourg bidding zone is combined, and the current area list does not list a separate Liechtenstein area. ENTSO-E describes the series in MW per market time unit, published by H+1, with estimates possible and country-dependent updates.

The API requires an account and security token. Separately, the Terms of Use describe CC BY 4.0 as applying to a subset of platform data. The currently linked free-reuse list does not enumerate the selected generation data item, so public reuse is not established by the available documents.

## Decision

- Keep ENTSO-E as the leading candidate, not an enabled provider.
- Do not make live requests or publish ENTSO-E values until access is granted and the rights to reuse this specific item in the intended public app are confirmed.
- Keep all public demo data synthetic and label it clearly.
- Model zones independently of countries; treat DE-LU as a combined bidding zone, and do not assume a separate LI provider zone.
- Once authorized, start with a short, manual HU query, inspect the response, and only then implement normalization and the provider adapter.

## Consequences

The current demo stays fully reproducible without credentials or external calls. The next blocking input is account access and a written data-reuse clarification, not implementation code. If reuse is unavailable, evaluate another explicitly licensed source or keep the application fixture-only.
