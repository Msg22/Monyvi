# Issue #355 — Purchase-date historical metal-rate coverage

Status: Implementation complete and integrated. Prior author lane reports marked historical. Previous verification passed on parent `3ce0b7cf0372d43743451b118d06ec488f3f1845`; local pre-push verification gates executed as detailed below.

## Implemented core contract

- Timestamped Add-time acquisition references qualify as purchase-date history only when both real provider timestamps resolve to the saved `YYYY-MM-DD` in IANA `Africa/Cairo`.
- Otherwise resolution checks the owner-scoped local dated cache, then the authenticated remote stored-rate endpoint. Both provider timestamp legs must resolve to the exact purchase date in Africa/Cairo. No nearest-day, current-rate, later-rate, or mixed-date substitution exists.
- Remote numeric JSON is parsed losslessly. Canonical observation atoms from one batch are preferred; an invalid/incomplete canonical batch never falls back to its legacy root quotes. Roots with no observation rows can use stored gram quotes only with both exact provider-date proofs. USD identity is exact `1`. Snapshot gram quotes remain authoritative; troy-ounce fields are derived compatibility values using exact `31.1034768`. Existing daily records remain supported.
- Historical display/Add-estimate purity uses the approved app-wide quote rule: Gold `gold-999` uses the quoted 24K gram rate directly (effective factor `1`), while lower Gold karats and Silver use their stored factors. Persisted `gold-999 / 0.999` evidence and existing immutable FR-050/P&L accounting remain unchanged.
- Cache is owner-scoped, installation-local WatermelonDB and excluded from sync. It stores exact normalized facts plus internal provider/date/fetch/digest/quality metadata.
- Daily cache records do not become immutable acquisition action evidence and do not alter FR-050/P&L attribution.
- Add-only estimator owns `unset -> estimated -> manual`. Any user edit, including clearing the field, permanently prevents automatic overwrite for that form session.
- Edit Holding is not wired to the estimator.
- Server rate limiting enforces the approved 60 endpoint requests per account per rolling hour via private PostgreSQL migration `089_historical_metal_rate_request_limits.sql`. Evaluated against server `clock_timestamp()` using an atomic per-user advisory lock. No remote migration applied or deployed this turn.

## Automated coverage authored

| Contract | Test |
| --- | --- |
| Cairo calendar matching, mixed-date rejection, USD identity, exact historical purity math | `packages/logic/src/metals/__tests__/historical-rate.test.ts` |
| Legacy daily compatibility: lossless shape, exact date, missing EGP, exact troy conversion | `supabase/functions/_shared/historical-metal-rate-contract.test.ts` |
| Auth before remote lookup, date validation, cancellation, 60/hr limit denial 429, remote error mapping | `supabase/functions/fetch-historical-metal-rate/handler.test.ts` |
| Incremental root paging, early stop proof, query-count regression, atom batch isolation | `supabase/functions/fetch-historical-metal-rate/remote-reader.test.ts` |
| Shared snapshot candidate qualification, SnapshotRank comparison ordering, Cairo timestamp parser | `supabase/functions/_shared/historical-metal-rate-contract-remote.test.ts` |
| Strict rate limiter RPC runtime validation, signal abort attachment, fail-closed handling | `supabase/functions/fetch-historical-metal-rate/rate-limiter.test.ts` |
| Local-only schema preservation + v30 migration | `scripts/__tests__/metal-historical-rate-local-schema.test.ts` |
| Explicit sync exclusion | `apps/mobile/__tests__/services/metal-historical-rate-cache-sync-exclusion.test.ts` |
| Owner-scoped cache create/update/corruption behavior | `apps/mobile/__tests__/services/metal-historical-rate-cache-service.test.ts` |
| Authenticated mobile Edge response validation | `apps/mobile/__tests__/services/metal-historical-rate-fetch-service.test.ts` |
| Action -> cache -> exact-date network resolver, offline miss, missing EGP | `apps/mobile/__tests__/services/metal-purchase-date-reference-service.test.ts` |
| Presentation-safe Details historical facade | `apps/mobile/__tests__/services/metal-historical-detail-facade-service.test.ts` |
| Add estimate ownership/manual-clear invariant | `apps/mobile/__tests__/hooks/useMetalHistoricalPurchasePriceEstimate.test.tsx` |
| Historical quoted-24K override + lower-karat regression | `packages/logic/src/metals/__tests__/historical-rate.test.ts` |
| Current-acquisition-action selection | `apps/mobile/__tests__/services/metal-historical-detail-composition-service.test.ts` |
| Detail row/no-provenance UI | `apps/mobile/__tests__/components/metals/holding-detail-fidelity.test.tsx` |
| Add manual edit/clear versus programmatic setter wiring | `apps/mobile/__tests__/app/metals-add.test.tsx` |
| Exact EN/AR microcopy and key parity | `apps/mobile/__tests__/i18n/metals-content-contract.test.ts` |
| Database rate limiter pgTAP: 60 allowed, 61st denied, per-user isolation, window expiry/pruning | `supabase/tests/historical-metal-rate-request-limits.test.sql` |

## Historical note on prior remote-author reports

- Earlier report entries stating "verification intentionally NOT RUN in the remote author lane" reflect the initial work partition before final integration.
- Those entries are preserved as historical context. The implementation has since been fully integrated into the mobile app, logic package, and Edge functions.

## Completed integration

The purchase-date historical rate feature is wired across presentation, service, and database layers:

1. **Holding Detail screen**: Integrated with `readHistoricalMetalDetailReference` selecting only rate references owned by the current `acquisitionActionId`. Exposes only presentation-safe values (`rateDate`, purchase currency, selected-purity per-gram decimal, loading/unavailable states) and hides all internal provider/source/quality/freshness metadata.
2. **Add Holding screen**: Composed with `useMetalHistoricalPurchasePriceEstimate`. Programmatic estimates call `updateField("purchasePrice", value)`. User edits/clears route through `onPurchasePriceUserChange`, locking manual ownership. The localized helper renders the formatted market rate (`Estimated from the purchase-date market rate of {{rate}}/g. You can change it to what you paid.`). If estimate rounds to `0.00` or `0`, field is left empty and ownership stays unset.
3. **Edit Holding screen**: Estimator is explicitly not composed into the Edit route.
4. **App-wide quoted 24K rule**: Gold `gold-999` display and Add estimate use the quoted 24K rate directly (factor `1`) without mutating stored `0.999` catalog evidence or immutable accounting.
5. **Local WatermelonDB cache**: Cache integrated with read-only timestamp regression fix (`metal-historical-rate-cache-service.test.ts`), owner-scoping, and sync exclusion.
6. **Server Rate Limiter**: Integrated in `fetch-historical-metal-rate` edge function. Checks auth and request validity, reserves atomic rolling 1-hour slot via private PostgreSQL RPC, and returns 429 with `Retry-After` header when 60 requests/hr is reached.

## Prior verified evidence (Parent commit `3ce0b7cf0372d43743451b118d06ec488f3f1845`, Oct 14)

Prior verification executed at parent `3ce0b7cf0372d43743451b118d06ec488f3f1845` established the baseline:
- Mobile automated test suites: 6 mobile test suites, 65 tests passed.
- Mobile TypeScript: `tsc --noEmit` passed cleanly.
- Mobile lint, formatting, git diff: passed without regressions.
- Physical device verification: Mohamed confirmed physical-device Add form autofill.
- Honest boundaries: Helper device visual layout across all font scales not yet fully checked; full offline / manual / E2E suites and full cross-device matrix are separate baselines and not claimed here.

## Review follow-up improvements (PR #387 review)

1. **Edge timeout mitigation & rank-based per-root observation skip**:
   - Replaced exhaustive multi-day fetch of all roots and observations with incremental root paging (`limit=100`, ordered by `timestamp_metal.desc.nullslast,timestamp_currency.desc.nullslast,created_at.desc.nullslast,id.desc`).
   - Extracted shared `SnapshotRank` and `tryQualifyRootRank` to compare candidate ranks before observation queries. If a root cannot outrank an already verified complete candidate, observation fetching for that root is skipped without halting future pages prematurely.
   - Applied mathematical early-stop: paging terminates safely once `root.timestamp_metal < bestMinTime`.
   - Guarded `rootPageSize` against non-positive, non-integer, NaN, or non-finite inputs to guarantee finite offsets and terminate cleanly.
   - Preserves exact approved ordering: descending `min(metalAt, currencyAt)`, descending `max(metalAt, currencyAt)`, descending `created_at`, descending `id`.
   - Preserves Cairo calendar-day proof on both legs, 72h broad envelope, complete 38-atom canonical batch with BTC, and lossless numeric precision.
2. **Server-side rate limiter (60 req/hr per account)**:
   - Authored local private PostgreSQL migration `089_historical_metal_rate_request_limits.sql` creating `private.historical_metal_rate_requests` and security-definer RPC `public.historical_metal_rate_reserve_request(p_user_id uuid)`.
   - Table permissions revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`. Execution granted solely to `service_role`.
   - Edge handler reserves rate limit with timeout and `AbortSignal` forwarding. Returns 429 with `Retry-After` header and CORS on denial; fails closed on RPC/network failure.
3. **Cache service import cleanup**:
   - Cleaned `MetalHistoricalRateCache` import in `metal-historical-rate-cache-service.ts`.
4. **Estimator zero-rounding fix & lint cleanup**:
   - Fixed estimator hook to leave field empty when estimate calculation rounds to `0.00` (or `0` in zero-decimal currencies like JPY).
   - Removed unused `async` on non-await test callback in `useMetalHistoricalPurchasePriceEstimate.test.tsx`.

## Manual verification plan & query-budget checklist

| Verification Target | Expected Behavior | Automated Regression Mapping |
| --- | --- | --- |
| Exact purchase-date match | Stored rate returned only if both provider legs match Cairo calendar date; no substitution | `historical-metal-rate-contract-remote.test.ts` |
| Cairo DST winter boundary | `2026-01-10` matches earliest UTC boundary `2026-01-09T22:00:00Z` (UTC+2) | `remote-reader.test.ts` (DST boundaries test) |
| Cairo DST summer boundary | `2026-10-10` matches earliest UTC boundary `2026-10-09T21:00:00Z` (UTC+3) | `remote-reader.test.ts` (DST boundaries test) |
| Query budget & early-stop | 500 older snapshots in 72h range result in only 1 root page and 1 observation call | `remote-reader.test.ts` (query count regression test) |
| Identical timestamps skip | 550 roots with same provider timestamps but older created_at fetch observations only once | `remote-reader.test.ts` (identical provider times test) |
| Newer invalid candidate | Incomplete newer snapshot does not shadow older complete valid candidate; fetches older then skips remaining | `remote-reader.test.ts` (newer invalid skipped test) |
| SQL order vs selector | Later SQL ordered root with smaller metal but larger min provider timestamp still wins | `remote-reader.test.ts` (SQL order test) |
| Tie-breaking determinism | Equal min provider instant breaks by max provider, then created_at, then id | `remote-reader.test.ts` (ties test) |
| Rate limiter 60/hr quota | 60 requests accepted; 61st denied with 429, Retry-After header, zero reads | `handler.test.ts`, `rate-limiter.test.ts`, `historical-metal-rate-request-limits.test.sql` |
| Add holding autofill | Selected purchase date fetches historical rate and populates purchase price helper | `metals-add.test.tsx`, `useMetalHistoricalPurchasePriceEstimate.test.tsx` |
| Retry & zero estimate UI | Targeted Retry trigger & zero estimate rounding behavior cleanly handled | `useMetalHistoricalPurchasePriceEstimate.test.tsx`, `holding-detail-fidelity.test.tsx` |

## Local verification gate status so far

The following evidence has been established during the current local pre-push run:

- **Mobile automated test suites**: 9 test suites, 90 tests passed cleanly.
- **Typed UI fixture recheck**: 7 tests passed after fixture lint/type corrections.
- **Full mobile TypeScript**: `tsc --noEmit` passed cleanly (exit 0).
- **Pure logic tests**: 12 passed (`packages/logic`).
- **Calendar & date lineage tests**: Passed.
- **Edge function tests**: 55 tests passed (all contracts, handler, rate-limiter, and remote-reader suites passing after timestamp fixture assertion correction).
- **Edge Deno type-check**: Passed cleanly.
- **Local schema & transformation tests**: 4 passed (`scripts/__tests__/transform-schema.test.ts`, etc.).
- **Database pgTAP tests**: 18 passed (`supabase/tests/historical-metal-rate-request-limits.test.sql`).
- **Real simultaneous database concurrency proof**: Verified in isolated verification database `codex_pr387_verify`: simultaneous execution transitioning from 59 existing rows to 60th allowed and 61st denied with exact `accepted=true` on one connection and `accepted=false` with positive `retry_after_seconds` on the other.
- **Code formatting & git diff**: Passed cleanly (exit 0).
- **ESLint**: Completed cleanly with 0 errors (`exit: 0`, 21 non-blocking style/typing warnings in `verification-ready-lint.log`).
- **Deployment boundary**: Remote database migration and edge function deployment intentionally not executed this turn; reserved for lead final pre-push and staging cutover. No new physical device QA or visual Maestro checks claimed.
