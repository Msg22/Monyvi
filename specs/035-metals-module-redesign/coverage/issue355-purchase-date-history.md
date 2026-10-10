# Issue #355 — Purchase-date historical metal-rate coverage

Status: implementation authored against `main@3264eba2b67bcc66cddc95e3fbdb36e8705ee642`; verification intentionally **NOT RUN** in the remote author lane.

## Implemented core contract

- Timestamped Add-time acquisition references qualify as purchase-date history only when both real provider timestamps resolve to the saved `YYYY-MM-DD` in IANA `Africa/Cairo`.
- Otherwise resolution falls back to one exact provider daily key. No nearest-day, current-rate, later-rate, or mixed-date substitution exists.
- Historical provider tokens are parsed losslessly. USD identity is exact `1`; Gold/Silver normalize from USD/troy-ounce using exact `31.1034768` grams/troy-ounce.
- Historical purity calculations use the persisted purity factor. The current-only Gold `gold-999` direct quoted-24K exception is untouched.
- Cache is owner-scoped, installation-local WatermelonDB and excluded from sync. It stores exact normalized facts plus internal provider/date/fetch/digest/quality metadata.
- Daily cache records do not become immutable acquisition action evidence and do not alter FR-050/P&L attribution.
- Add-only estimator owns `unset -> estimated -> manual`. Any user edit, including clearing the field, permanently prevents automatic overwrite for that form session.
- Edit Holding is not wired to the estimator.

## Automated coverage authored

| Contract | Test |
| --- | --- |
| Cairo calendar matching, mixed-date rejection, USD identity, exact historical purity math | `packages/logic/src/metals/__tests__/historical-rate.test.ts` |
| Lossless provider daily shape, exact date, missing EGP, exact troy conversion | `supabase/functions/_shared/historical-metal-rate-contract.test.ts` |
| Auth, one-day provider request, key secrecy, exact-date absence/error mapping | `supabase/functions/fetch-historical-metal-rate/handler.test.ts` |
| Local-only schema preservation + v30 migration | `scripts/__tests__/metal-historical-rate-local-schema.test.ts` |
| Explicit sync exclusion | `apps/mobile/__tests__/services/metal-historical-rate-cache-sync-exclusion.test.ts` |
| Owner-scoped cache create/update/corruption behavior | `apps/mobile/__tests__/services/metal-historical-rate-cache-service.test.ts` |
| Authenticated mobile Edge response validation | `apps/mobile/__tests__/services/metal-historical-rate-fetch-service.test.ts` |
| Action -> cache -> exact-date network resolver, offline miss, missing EGP | `apps/mobile/__tests__/services/metal-purchase-date-reference-service.test.ts` |
| Presentation-safe Details historical facade | `apps/mobile/__tests__/services/metal-historical-detail-facade-service.test.ts` |
| Add estimate ownership/manual-clear invariant | `apps/mobile/__tests__/hooks/useMetalHistoricalPurchasePriceEstimate.test.tsx` |

## Deferred integration boundary

Current governed `MetalHoldingDetailScreen`, common Detail read-model shaping, translations, and the Add form UI remain untouched until the lead supplies the approved visual delta.

Later integration should:

1. map the current acquisition action's two `MetalRateReference` rows through the existing raw-reference shaping helper and call `readHistoricalMetalDetailReference`;
2. expose only `rateDate`, purchase currency, selected-purity per-gram decimal, loading/unavailable/retry state to the presentation layer; do not surface internal provider/trust metadata;
3. compose the Add route with `useMetalHistoricalPurchasePriceEstimate`, using ordinary form updates for automatic estimates and routing actual Purchase Price user edits through `onPurchasePriceUserChange`;
4. never compose the estimator into Edit.

## Local final verification batch

The local successor should run the project-standard focused test commands for the files above, Edge Node tests for the two historical provider suites, DB schema-generation stability, affected lint/type/format, then the normal pre-push aggregate. No pass is claimed here.

Live provider evidence remains intentionally unverified in this remote lane: representative dated Gold/Silver/EGP/other-currency responses, quota behavior, and hosted endpoint deployment must be checked by the authorized local/deployment owner without exposing credentials.
