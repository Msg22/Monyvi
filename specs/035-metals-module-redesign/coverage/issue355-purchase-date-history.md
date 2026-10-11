# Issue #355 — Purchase-date historical metal-rate coverage

Status: implementation authored against `main@3264eba2b67bcc66cddc95e3fbdb36e8705ee642`; verification intentionally **NOT RUN** in the remote author lane.

## Implemented core contract

- Timestamped Add-time acquisition references qualify as purchase-date history only when both real provider timestamps resolve to the saved `YYYY-MM-DD` in IANA `Africa/Cairo`.
- Otherwise resolution checks the owner-scoped local dated cache, then the authenticated remote stored-rate endpoint. Both provider timestamp legs must resolve to the exact purchase date in Africa/Cairo. No nearest-day, current-rate, later-rate, or mixed-date substitution exists.
- Remote numeric JSON is parsed losslessly. Canonical observation atoms from one batch are preferred; an invalid/incomplete canonical batch never falls back to its legacy root quotes. Roots with no observation rows can use stored gram quotes only with both exact provider-date proofs. USD identity is exact `1`. Snapshot gram quotes remain authoritative; troy-ounce fields are derived compatibility values using exact `31.1034768`. Existing daily records remain supported.
- Historical display/Add-estimate purity uses the approved app-wide quote rule: Gold `gold-999` uses the quoted 24K gram rate directly (effective factor `1`), while lower Gold karats and Silver use their stored factors. Persisted `gold-999 / 0.999` evidence and existing immutable FR-050/P&L accounting remain unchanged.
- Cache is owner-scoped, installation-local WatermelonDB and excluded from sync. It stores exact normalized facts plus internal provider/date/fetch/digest/quality metadata.
- Daily cache records do not become immutable acquisition action evidence and do not alter FR-050/P&L attribution.
- Add-only estimator owns `unset -> estimated -> manual`. Any user edit, including clearing the field, permanently prevents automatic overwrite for that form session.
- Edit Holding is not wired to the estimator.

## Automated coverage authored

| Contract | Test |
| --- | --- |
| Cairo calendar matching, mixed-date rejection, USD identity, exact historical purity math | `packages/logic/src/metals/__tests__/historical-rate.test.ts` |
| Legacy daily compatibility: lossless shape, exact date, missing EGP, exact troy conversion | `supabase/functions/_shared/historical-metal-rate-contract.test.ts` |
| Auth before remote lookup, date validation, cancellation, exact-date absence/remote error mapping | `supabase/functions/fetch-historical-metal-rate/handler.test.ts` |
| Local-only schema preservation + v30 migration | `scripts/__tests__/metal-historical-rate-local-schema.test.ts` |
| Explicit sync exclusion | `apps/mobile/__tests__/services/metal-historical-rate-cache-sync-exclusion.test.ts` |
| Owner-scoped cache create/update/corruption behavior | `apps/mobile/__tests__/services/metal-historical-rate-cache-service.test.ts` |
| Authenticated mobile Edge response validation | `apps/mobile/__tests__/services/metal-historical-rate-fetch-service.test.ts` |
| Action -> cache -> exact-date network resolver, offline miss, missing EGP | `apps/mobile/__tests__/services/metal-purchase-date-reference-service.test.ts` |
| Presentation-safe Details historical facade | `apps/mobile/__tests__/services/metal-historical-detail-facade-service.test.ts` |
| Add estimate ownership/manual-clear invariant | `apps/mobile/__tests__/hooks/useMetalHistoricalPurchasePriceEstimate.test.tsx` |

## Remote-only source correction — 2026-10-11

- The endpoint authenticates and validates the date before reading remote `market_rates` and matching `market_rate_observations`.
- Both real provider timestamps prove the Cairo calendar date; `created_at` is used only to break ties between equally observed snapshots.
- Eligible snapshots sort by newest complete provider pair, then other provider timestamp, creation tie, and root ID. Every returned metal/FX value belongs to that single snapshot.
- Snapshot records carry `snapshotId`, `metalProviderObservedAt`, `currencyProviderObservedAt`, and truthful stored provenance. Canonical eligibility requires the complete atomic producer contract: Gold, Silver, all 35 supported fiat currencies, and BTC (38 unique valid observations). BTC is validated but omitted from historical fiat output. Legacy roots without observation rows may omit FX currencies; those currencies remain absent.
- Tests authored: `historical-metal-rate-contract-remote.test.ts`, `remote-reader.test.ts`, rewritten `handler.test.ts`, and snapshot pure-parser tests. They cover high-precision raw numeric tokens, Cairo midnight, oldest/newest eligibility, the unchanged producer's full 38-row output, malformed BTC, newer partial batch versus older complete exact-date batch, canonical rejection, mixed batches, pagination, auth/date gates, remote errors, and request cancellation.
- Cache/schema/model persistence is owned by the metadata correction author; source parser retains all approved proof fields. No gates were executed.

## Deferred integration boundary

Current governed `MetalHoldingDetailScreen`, common Detail read-model shaping, translations, and the Add form UI remain untouched until the lead supplies the approved visual delta.

Later integration should:

1. map the current acquisition action's two `MetalRateReference` rows through the existing raw-reference shaping helper and call `readHistoricalMetalDetailReference`;
2. expose only `rateDate`, purchase currency, selected-purity per-gram decimal, loading/unavailable/retry state to the presentation layer; do not surface internal provider/trust metadata;
3. compose the Add route with `useMetalHistoricalPurchasePriceEstimate`, using ordinary form updates for automatic estimates and routing actual Purchase Price user edits through `onPurchasePriceUserChange`;
4. never compose the estimator into Edit.

## Local final verification batch

The local successor should run the project-standard focused test commands for the files above, Edge Node tests for legacy daily compatibility, remote snapshot contract, remote reader, and remote handler suites, DB schema-generation stability, affected lint/type/format, then the normal pre-push aggregate. No pass is claimed here.

Remote-only lookup is approved. Metals.Dev HTTP fallback, provider API-key use, limiter/counter work, and remote migrations are deferred. Hosted endpoint deployment and real stored-rate read validation remain unverified; this author lane performed no remote DB/provider operations.


## Approved follow-on integration — 2026-10-10

- Historical Gold `gold-999` display and Add estimate now follow the approved app-wide quoted-24K rule: use the quoted 24K gram rate directly (effective factor `1`) while preserving stored `0.999` evidence and unchanged FR-050/P&L accounting.
- Gold 21K/18K and Silver continue using their stored catalog factors.
- The active Details production read explicitly opts into purchase-date history enrichment. It selects only rate references owned by the holding's current `acquisitionActionId`; legacy/null acquisition actions fall back to exact-date cache/network history rather than borrowing another action's evidence.
- Active Details exposes one presentation-safe fact: `Market rate on purchase date`; the UI never renders resolver origin, provider, source, quality, freshness, or trust metadata.
- Add composes `useMetalHistoricalPurchasePriceEstimate` with the existing form setter. Programmatic estimates call the ordinary `updateField("purchasePrice", value)`; actual Purchase Price edits and clears use the manual-ownership handler.
- The Add helper is exactly `Estimated from the purchase-date market rate. You can change it to what you paid.` only while the displayed value is estimator-owned. Missing history retains the existing paid-amount helper and manual entry.

### Focused follow-on tests authored, NOT RUN

- Historical quoted-24K override + lower-karat regression in `packages/logic/src/metals/__tests__/historical-rate.test.ts`.
- Current-acquisition-action selection in `apps/mobile/__tests__/services/metal-historical-detail-composition-service.test.ts`.
- Detail row/no-provenance UI in `apps/mobile/__tests__/components/metals/holding-detail-fidelity.test.tsx`.
- Add manual edit/clear versus programmatic setter wiring in `apps/mobile/__tests__/app/metals-add.test.tsx`.
- Exact EN/AR microcopy and key parity in `apps/mobile/__tests__/i18n/metals-content-contract.test.ts`.
- Estimator quoted-24K behavior in `apps/mobile/__tests__/hooks/useMetalHistoricalPurchasePriceEstimate.test.tsx`.
- Presentation-safe facade quoted-24K behavior in `apps/mobile/__tests__/services/metal-historical-detail-facade-service.test.ts`.

No test/lint/type/build/format/device gate has been executed in this remote author lane.
