# ADR 0002: ENTSO-E source selection and reuse gate

- Status: private opt-in live mode accepted; external redistribution remains gated
- Date: 2026-11-19

## Context

ENTSO-E documents the generation-by-production-type data item 16.1.B&C, a REST query using document type A75 and realised process A16, and candidate EICs for Hungary and Austria. The Germany-Luxembourg bidding zone is combined, and the current area list does not list a separate Liechtenstein area. ENTSO-E describes the series in MW per market time unit, published by H+1, with estimates possible and country-dependent updates.

The API requires an account and security token. The project owner reports that authorized API access has now been granted. Separately, the Terms of Use describe CC BY 4.0 as applying to a subset of platform data. The currently linked free-reuse list does not enumerate the selected generation data item, so public reuse is not established by the available documents.

## Decision

- Keep ENTSO-E as the leading candidate, not an enabled provider.
- A short, manual HU request may be made with the owner's locally stored token for query-contract validation. Do not publish ENTSO-E values until the rights to reuse this specific item in the intended public app are confirmed.
- Implement a private, self-hosted, non-persistent HU mode as an owner-controlled operational choice, with visible source attribution, no endorsement claim, and no exposure/redistribution to others. This project choice is not a legal determination that this data item's use is licensed, does not claim CC BY rights, and leaves compliance with the Transparency Platform terms to the data user.
- Keep all public demo data synthetic and label it clearly.
- Model zones independently of countries; treat DE-LU as a combined bidding zone, and do not assume a separate LI provider zone.
- Authorized short HU requests confirmed the candidate request parameters and PT15M response resolution. An isolated XML normalizer exists, but remains outside the application runtime until reuse rights and coverage behavior are resolved.

## Consequences

The default demo stays fully reproducible without credentials or external calls. Private live use is opt-in and does not persist data. Any wider sharing or publication requires written reuse clarification and a defensible policy for sparse series and complete mix coverage.
