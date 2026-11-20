# Data sources and ENTSO-E validation

Last checked: 2026-11-20. This is an implementation record, not legal advice. Recheck provider documentation and reuse terms before changing the current private mode or making a public data release.

## Candidate source

ENTSO-E Transparency Platform REST API is the first candidate source for actual generation by production type. The API endpoint and access flow are documented by ENTSO-E:

- Production endpoint: `https://web-api.tp.entsoe.eu/api` (HTTPS only).
- Test endpoint: `https://web-api.tp-iop.entsoe.eu/api` (test data coverage is smaller).
- The API requires a registered and verified Transparency Platform account, a request for RESTful API access sent to `transparency@entsoe.eu` using the registered email, confirmation (the help page says within three working days), and a security token generated under My Account.
- The project owner reports that authorized access was granted and a short HU production request succeeded. No token, credential, or real response body is stored in the repository.

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

The request parameter guide says parameter names are case-sensitive and a time interval is mandatory. Its generic web API interval guidance is up to one year, but tighter limits can apply to particular data items. The extraction guide linked above is version 0.3, marked a draft, and dates from 2016; the current REST API page points to a Postman collection that was not machine-readable in this review. Treat the table as a candidate, not a confirmed live contract. A successful short HU request confirmed that `documentType=A75`, `processType=A16`, the candidate HU EIC, and UTC `yyyyMMddHHmm` time parameters are accepted together. An owner-run three-hour request returned HTTP 200, 15 time series, 126 points, and `PT15M` resolution; the observed categories were B01, B02, B04, B05, B06, B09, B11, B12, B14, B15, B16, B17, B19, and B20. B01–B09, B11–B12, and B14–B20 are identifiers observed in this response, not evidence that every category is always present or that all categories are covered. The returned point count is not divisible evenly across the 15 time series, so category-specific coverage and period boundaries need review before ingestion design.

References: [ENTSO-E extraction guide, generation dependency table](https://transparency.entsoe.eu/content/static_content/download?path=%2FStatic+content%2Fweb+api%2FIG-for-TP-data-extraction-process.pdf), [request parameters](https://transparencyplatform.zendesk.com/hc/en-us/articles/15696716612372-Request-Parameters), [request methods](https://transparencyplatform.zendesk.com/hc/en-us/articles/15696643163924-Request-Methods).

### Expected meaning and freshness

The data item is aggregated net generation in MW per market time unit. The published value is an average over available instantaneous net generation values; where output is unknown it may be estimated, including for small units without real-time measurement. The stated publication deadline is H+1. The help page says updates are usually absent for the aggregated-by-type item; wind/solar and country-level exceptions can differ. In particular, the page notes that Austria and Germany near-real-time values can include planning/extrapolation data and may later be updated with settlement data. Consequently, “actual” is the ENTSO-E process/data-item name and must not be presented to users as necessarily raw, final, or measured-only.

Reference: [Actual Generation per Production Type details](https://transparencyplatform.zendesk.com/hc/en-us/articles/16648290299284-Actual-Generation-per-Production-Type-16-1-B-C).

## Candidate zones, not country assumptions

### ENTSO-E PSR source labels

The owner-observed HU response contained B11, B12, B14, B15, B16, B17, B19, and B20. The ENTSO-E STA Implementation Guide v2.2 names these respectively hydro run-of-river and poundage, hydro water reservoir, nuclear, other renewable, solar, waste, wind onshore, and other. The full source label list is recorded in [`src/providers/entsoe/psr-types.js`](../src/providers/entsoe/psr-types.js). These labels are not normalized taxonomy mappings: in particular, `B15` (other renewable), `B17` (waste), and `B20` (other) require explicit classification policy and may need to remain `unknown` pending evidence. `B11` and `B12` are hydro; separate hydro storage/pumping is B10 and was not in the observed response.

Reference: [ENTSO-E STA Implementation Guide v2.2, PSR type list](https://www.entsoe.eu/Documents/EDI/Library/cim_based/STA_ImplementationGuide_V2.2.pdf).

The time-series parser reports source intervals and resolutions, including seconds, and associates each period and point-position range with its PSR code. It never returns point timestamps or quantities. The owner-provided category-specific report had 15 series/126 points at PT15M. Thirteen source categories had one series each with 11 points, positions 1–11, over 14:00Z–16:45Z. B06 appeared in three series across two periods: one point over 14:15Z–14:30Z and one point in each of two separate series over 14:00Z–14:15Z and 14:30Z–16:45Z. This could reflect sparse oil generation or provider series splitting; the metadata alone does not distinguish absent production from missing values, nor validate the query window's final 15 minutes. Do not fill missing points with zero or call category coverage complete from this response alone.

### Normalization prototype

`src/providers/entsoe/normalize-generation.js` converts XML points into provider-neutral 15-minute observations using each period's start, resolution, and point position. Each duplicate source series remains represented in quality flags; values are not merged. Explicit mappings are limited to unambiguous source categories: B01 biomass, B02/B05 coal, B04 gas, B06 oil, B09 geothermal, B11/B12 hydro, B14 nuclear, B16 solar, and B19 onshore wind. B15 (other renewable), B17 (waste), B20 (other), and unrecognized codes normalize to `unknown`. This function always returns `coverage_complete: false` and never synthesizes missing periods. It marks records with the ENTSO-E `actual` process status while preserving a quality flag that the dataset may include estimates. It is a parser/domain boundary only: the dashboard, persistence, and public live API do not call it until reuse rights and category coverage are resolved.

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

## Private access and redistribution

The current terms distinguish consultation/re-use of platform data from the subset explicitly licensed for free redistribution. Clause 3.1 applies to data use “for any purpose whatsoever”: use data in good faith, identify ENTSO-E as publication source, avoid implying endorsement, and do not prejudice the primary owner's rights; seek the rights holder's agreement if a use risks those rights. The current free-reuse list (last modified 2023-10-18) grants CC BY 4.0 re-use for listed data, but does not list Actual Generation per Production Type / item 16.1.B&C. The terms do not state that a private self-hosted dashboard is automatically covered by that open-data license, nor do they explicitly say that private viewing is prohibited. API access approval is not itself a data-reuse license.

The project therefore implements an opt-in, private, non-persistent HU live mode for the owner's self-hosted instance, with source attribution and no public redistribution. This is an operational choice, not a determination that the item is CC BY or legal advice. Do not commit real response bodies, screenshots containing real API data, or fixtures. Do not expose the live instance to the public or distribute the data/derived datasets. If the app is later shared with other users, exposed beyond the owner's private network, or real values are published, first obtain a written reuse answer from ENTSO-E and/or the relevant primary data owner. Recheck terms before changing that use.

References: [Terms and Conditions](https://transparencyplatform.zendesk.com/hc/en-us/articles/40921911218961-Legal-Terms-and-Conditions), [current list of data available for free re-use](https://transparencyplatform.zendesk.com/hc/en-us/article_attachments/40921869379729), [Terms of Use PDF, clauses 2.5 and 3.1](https://transparencyplatform.zendesk.com/hc/en-us/article_attachments/40921869376401).

## Next source-validation steps

1. The project owner stores the token locally. Never paste the token into chat, issues, screenshots, source files, or logs.
2. The owner can use the opt-in local HU mode for private analysis, subject to the existing terms, attribution, and no-redistribution guardrails.
3. Investigate sparse B06 series and verify behavior over additional windows; keep response values out of the repository.
4. Before exposing the app to other people or publishing results, request written reuse clarification for item 16.1.B&C, including derived charts, caching, and attribution.
5. Recheck the current terms and free-reuse list before changing the mode of use.
