# Data sources and ENTSO-E validation

Last checked: 2026-11-19. This is an implementation record, not legal advice. Recheck provider documentation and reuse terms before each public data release.

## Candidate source

ENTSO-E Transparency Platform REST API is the first candidate source for actual generation by production type. The API endpoint and access flow are documented by ENTSO-E:

- Production endpoint: `https://web-api.tp.entsoe.eu/api` (HTTPS only).
- Test endpoint: `https://web-api.tp-iop.entsoe.eu/api` (test data coverage is smaller).
- The API requires a registered and verified Transparency Platform account, a request for RESTful API access sent to `transparency@entsoe.eu` using the registered email, confirmation (the help page says within three working days), and a security token generated under My Account.
- No account, token, credential, or live API request was used for this project validation.

Official references: [token access steps](https://transparencyplatform.zendesk.com/hc/en-us/articles/12845911031188-How-to-get-security-token), [request endpoint](https://transparencyplatform.zendesk.com/hc/en-us/articles/15696677194644-Request-Endpoint).

## Candidate request contract

For `Actual Generation per Production Type [16.1.B&C]`, ENTSO-E's extraction guide gives this candidate dependency set:

| Parameter | Candidate value / behavior |
| --- | --- |
| `documentType` | `A75` — actual generation per type |
| `processType` | `A16` — realised |
| `in_Domain` | The selected zone's EIC; required |
| `periodStart`, `periodEnd` | Required time interval in UTC; the API query guide uses `yyyyMMddHHmm` |
| `psrType` | Optional; omit to request all available production types |
| Method / endpoint | HTTPS GET to the production endpoint |

The request parameter guide says parameter names are case-sensitive and a time interval is mandatory. Its generic web API interval guidance is up to one year, but tighter limits can apply to particular data items. The extraction guide linked above is version 0.3, marked a draft, and dates from 2016; the current REST API page points to a Postman collection that was not machine-readable in this review. Treat the table as a candidate, not a confirmed live contract. Confirm it against the current Postman documentation and one authorized short request before implementing the adapter.

References: [ENTSO-E extraction guide, generation dependency table](https://transparency.entsoe.eu/content/static_content/download?path=%2FStatic+content%2Fweb+api%2FIG-for-TP-data-extraction-process.pdf), [request parameters](https://transparencyplatform.zendesk.com/hc/en-us/articles/15696716612372-Request-Parameters), [request methods](https://transparencyplatform.zendesk.com/hc/en-us/articles/15696643163924-Request-Methods).

### Expected meaning and freshness

The data item is aggregated net generation in MW per market time unit. The published value is an average over available instantaneous net generation values; where output is unknown it may be estimated, including for small units without real-time measurement. The stated publication deadline is H+1. The help page says updates are usually absent for the aggregated-by-type item; wind/solar and country-level exceptions can differ. In particular, the page notes that Austria and Germany near-real-time values can include planning/extrapolation data and may later be updated with settlement data. Consequently, “actual” is the ENTSO-E process/data-item name and must not be presented to users as necessarily raw, final, or measured-only.

Reference: [Actual Generation per Production Type details](https://transparencyplatform.zendesk.com/hc/en-us/articles/16648290299284-Actual-Generation-per-Production-Type-16-1-B-C).

## Candidate zones, not country assumptions

The current ENTSO-E area list distinguishes area types (including BZN bidding zone, CTA control area, MBA market balance area, and others). Candidate EIC groupings from that list:

| Display / intended comparison | Candidate EIC | Area-list notes |
| --- | --- | --- |
| Hungary bidding zone (`BZN|HU`) | `10YHU-MAVIR----U` | Listed for HU LFA/LFB/SCA and Hungary BZN/CTA/MBA; validate the exact API accepted value with a live response. |
| Austria bidding zone (`BZN|AT`) | `10YAT-APG------L` | Listed for AT BZN and several other area types. |
| Germany-Luxembourg bidding zone (`BZN|DE-LU`) | `10Y1001A1001A82H` | This is a combined zone. Do not label its whole output “Germany-only”. The current area list also shows a Germany (DE) IPA, which is not the same as the BZN. |
| Switzerland bidding zone (`BZN|CH`) | `10YCH-SWISSGRIDZ` | A potential pilot-zone mapping; confirm data availability for the selected item. |

The current area list does not show a separate Liechtenstein entry. Do not create an independent `LI` provider zone without further confirmation; investigate whether it should be represented only through a combined neighboring area for the intended analysis.

Reference: [ENTSO-E Area List with EIC](https://transparencyplatform.zendesk.com/hc/en-us/articles/15885757676308-Area-List-with-Energy-Identification-Code-EIC), updated 2026-09-21.

## Rate limit

The ENTSO-E help page currently states a primary limit of 400 requests/minute per user account/API token, with temporary token bans possible after exceeding it. This is a ceiling, not a recommended polling target. The proposed 15-minute poll interval remains unvalidated; batch only when supported, cache responses, and choose a conservative interval based on actual update cadence and response behavior.

Reference: [API Rate Limit Part 1](https://transparencyplatform.zendesk.com/hc/en-us/articles/12783148966036-API-Rate-Limit-Part-1), updated 2026-04-20.

## Reuse and public publication status: unresolved blocker

The Terms of Use say only a subset of platform data is published as open data under CC BY 4.0. The current linked list of freely reusable data (last modified 2023-10-18) enumerates data items but does not list Actual Generation per Production Type / article 16.1.B&C. The Terms also require source attribution and prohibit implying ENTSO-E endorsement; where reuse may prejudice the primary owner's rights, they direct the data user to seek the rights holder's agreement. Therefore this project has **not** established permission to redistribute or publicly display API results for this data item merely because the endpoint is public or requires a token.

Do not commit real ENTSO-E response bodies, screenshots containing real API data, or derived public fixtures, and do not enable a public live-data adapter until ENTSO-E and/or the relevant primary data owner clarifies reuse for the intended public self-hosted application. Keep the demo synthetic meanwhile. Recheck the open-data list before each reuse.

References: [Terms and Conditions](https://transparencyplatform.zendesk.com/hc/en-us/articles/40921911218961-Legal-Terms-and-Conditions), [current list of data available for free re-use](https://transparencyplatform.zendesk.com/hc/en-us/article_attachments/40921869379729), [Terms of Use PDF, clauses 2.5 and 3.1](https://transparencyplatform.zendesk.com/hc/en-us/article_attachments/40921869376401).

## Next source-validation steps

1. The project owner completes the registration/access flow and generates a token locally. Never paste the token into chat, issues, screenshots, source files, or logs.
2. Obtain a written reuse answer for API data item 16.1.B&C for a public self-hosted portfolio application, including attribution, transformed aggregates, caching, and fixture publication.
3. If reuse is allowed, make one short HU request using the candidate parameters; save only an appropriately redacted/synthetic or explicitly licensed fixture.
4. Record response XML shape, categories, actual period boundaries, resolution, source update behavior, and any negative-acknowledgement/error behavior.
5. Only then finalize mappings and the adapter contract. If reuse is not allowed, retain synthetic mode or choose a source with suitable explicit terms.
