# PR 271 review follow-up, 19 September 2026

This supplements the combined PR 271/301/303 manual plan. It does not add Sell,
Dispose, or Undo controls. Use the existing supported lifecycle QA seed for sold
and disposed records. Device QA remains pending.

## Additional manual checks and coverage

| Scenario                                                                                           | Expected behavior                                                                                                                                                                | Automated evidence                                                                                                                                     | Device-only evidence                                                               |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Open Accounts, Transactions, and Recurring payments before any complete rate snapshot is available | Recorded rows and original-currency amounts remain visible. Only conversion-dependent totals show unavailable, never zero. Loaded records do not wait for the rate subscription. | `missing-current-rates-availability.test.tsx`, `transaction-list-read-model-service.test.ts`, `useTransactionsGrouping.test.ts`, `useAccounts.test.ts` | Cold-start/offline presentation and screen-reader output                           |
| Sort recurring amounts when cross-currency rates are unavailable                                   | No crash and no misleading comparison of nominal amounts in different currencies; existing order is retained.                                                                    | `missing-current-rates-availability.test.tsx`, `useRecurringPayments.test.tsx`                                                                         | Mixed-currency device list                                                         |
| Enter a cross-currency transfer, then select a same-currency destination                           | The old conversion quote clears; saving uses the source amount without the former conversion override.                                                                           | `add-transaction-account-selection.test.tsx`                                                                                                           | Keyboard, picker and save journey                                                  |
| A current snapshot becomes unavailable while a transfer quote is shown                             | The automatic quote clears. No stale derived amount is silently retained.                                                                                                        | `add-transaction-account-selection.test.tsx`                                                                                                           | Controlled snapshot-loss injection requires a harness; not a normal UI action      |
| Inspect a conversion preview in English and Arabic                                                 | Amounts/rates follow the active locale; unavailable and rate text are translated.                                                                                                | `transaction-conversion-preview-service.test.ts`, `TransactionEditModal.test.tsx`, logic `currency.test.ts`                                            | RTL, enlarged fonts and narrow-screen wrapping                                     |
| Inspect a sold record whose historical result cannot be calculated                                 | Summary and sold row explain that profit/loss is unavailable; no invented zero and no disappearance of the sale.                                                                 | `portfolio-realized-sale.test.tsx`                                                                                                                     | Requires a controlled incomplete-evidence fixture; do not edit live financial data |
| Refresh after an initial failure, then receive the first complete snapshot                         | The obsolete refresh error clears. Metal price trust includes preferred-currency FX trust.                                                                                       | `useLiveRatesScreen.test.ts`                                                                                                                           | Refresh, offline recovery and spoken status                                        |

Additional automated-only regressions cover exponent-form finite balances,
unsupported legacy metal rows, restored effective sales after rejected undo,
POST-only ingestion, response-time capture, exact USD identity spellings,
required metal-command calendar evidence, and unique migration prefixes. These
are not instructions to perform unavailable lifecycle actions in the app.

## Review disposition

Thread suffixes below identify `PRRT_kwDOT16ATM…` on PR 271. Resolution happens
only after the verified fix is pushed. This file records implementation scope,
not proof that GitHub CI or device QA has passed.

| Threads                                        | Classification               | Change or remaining decision                                                                                                         |
| ---------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 6j6k79, 6j6k8D, 6j69NX                         | Fix now                      | Response-time capture, exact USD identity normalization, POST-only refresh                                                           |
| 6j6k8H                                         | Fix now                      | Reconciled holdings may report a still-effective accepted sale; canonical action/evidence gates remain intact                        |
| 6j6k8I, 6j6k8U, 6j69Mm                         | Fix now                      | Preferred FX trust, service-owned rate calculations, first-snapshot error recovery                                                   |
| 6j6k8K, 6j6k8O, 6j69MU, 6j69Mv, 6j69M5, 6j6919 | Fix now                      | Preserve recorded facts, nullable derived values, readiness and safe sorting                                                         |
| 6j6k8R, 6j69M2                                 | Fix now                      | Plain-decimal numeric adapters and supported Gold/Silver net-worth scope                                                             |
| 6j69MX, 6j69Mh                                 | Fix now                      | Clear stale transfer quotes and localize conversion previews                                                                         |
| 6j69Ma, 6j691x                                 | Fix now                      | Authoritative navigation type and explicit callback return type                                                                      |
| 6j69NG                                         | Fix now                      | Require calendar validation at the metal command envelope boundary; generic registry stays generic                                   |
| 6j691u                                         | Fix now                      | Explicit unavailable sold-result messages                                                                                            |
| 6j69MS, 6j69NQ                                 | Fix now                      | Stacked-branch database CI coverage and Markdown correction                                                                          |
| 6j69NK                                         | Reject requested issue split | Issue 302 explicitly supersedes 280/281; preserve approved combined scope. Correct malformed Markdown only.                          |
| 6j6k76                                         | Approved fix                 | Commit-visible publication ordering, separate from capture/freshness timestamps; late commit and split-observation concurrency tests |
| 6j6k8a                                         | Approved fix                 | Producer/database reject incompatible rates without rounding; migration stops on existing incompatible complete evidence             |
| 6j69NA                                         | Deferred with approval       | [Issue #316](https://github.com/Msg22/Monyvi/issues/316): bounded/resumable initial sync; no history cutoff or deletion              |

Migration `071_atomic_market_rate_snapshots.sql` replaces the colliding `070`
filename; its SQL behavior is unchanged. A prefix-uniqueness regression prevents
the collision recurring. Existing local QA databases with the older migration
history must not be reset or have history rewritten without the tester's
approval.

## Rate compatibility release checks

These are automated integration checks, not unsupported device UI actions:

- Supply overflow (`1e400`) and underflow (`1e-400`) provider tokens. Refresh
  fails before persistence; the previous complete snapshot remains available.
- Bypass Edge and call the persistence RPC with incompatible exact strings.
  Database validation rejects the transaction without a root or observations.
- Finite subnormal values and high-precision decimal canaries retain exact
  financial evidence; the compatibility check does not round or clamp it.
- Before deployment, migration 073 checks existing complete snapshots. If it
  reports `snapshot_incompatible_existing_rate`, stop and use the reported ID to
  request a recovery decision. Never reset the tester's database or alter
  historical financial evidence to make migration pass.

Coverage: `market-rate-snapshot-contract.test.ts`, `handler.test.ts`, and
`atomic_market_rate_snapshots_test.sql`. Tests run against an isolated database,
not by resetting the device QA database. Device-only follow-up: verify a failed
refresh leaves cached values and honest freshness visible after offline restart.

## Publication cursor release checks

These are automated database/sync checks, not actions requiring a device form:

- Finish a rate write captured before the previous successful sync. The next
  sync still receives its complete root and all 38 observations.
- Pause a complete publisher before commit. First-page pull waits, then includes
  the committed snapshot; no shared sync watermark skips it.
- Attach required observations in two concurrent partial transactions. Once both
  finish, their complete snapshot publishes exactly once.
- Keep later pages on the first-page watermark. New publications wait for the
  next sync; provider/capture evidence remains unchanged, including delayed
  historical snapshots that must not replace a newer selected snapshot.
- Run an incremental sync with the maximum UUID boundary, and verify malformed
  page IDs/watermarks still fail closed rather than advancing sync metadata.

Coverage: `market_snapshot_publication_test.sql` (9 checks),
`market_snapshot_publication_concurrency_test.sql` (5 real multi-session
checks), `pull-market-rate-snapshots.test.ts` and importer tests. Isolated
database only; do not reset the shared QA database. Device follow-up: refresh
twice, restart offline, and confirm unchanged provider-time freshness and cached
values.

Initial-sync size/performance remains unverified and deferred to #316. Passing
these correctness checks does not establish a bounded memory footprint.

## Follow-up review wave: current-rate consumers and recovery

Device QA remains pending. Use seeded terminal holdings; this wave does not add
Sell, Dispose, or Undo actions.

| Manual scenario                                                          | Expected result                                                                                                       | Automated coverage                                                                            | Manual-only boundary                                         |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Clear the destination amount on a cross-currency transfer and press Done | Validation remains visible; no transfer is saved and the form stays open                                              | `add-transaction-account-selection.test.tsx`                                                  | Keyboard and picker journey                                  |
| Switch History filters while a read is pending                           | Previous-filter rows never appear under the new filter                                                                | `useMetalHistory.test.ts`                                                                     | Device loading presentation                                  |
| Receive a holding metadata edit or event-effectiveness reconciliation    | History rereads and reflects the effective local state                                                                | `useMetalHistory.test.ts`                                                                     | Controlled reconciliation needs a fixture, not a form action |
| Retry after a rate subscription fails                                    | Cached complete values remain available and a replacement subscription can receive new complete values                | `market-rate-snapshot-stream.test.ts`                                                         | Offline recovery and device lifecycle                        |
| Open a USD-only or empty breakdown before rates arrive                   | Known USD amounts and empty totals remain available; FX- or metal-dependent amounts remain unavailable                | `current-market-snapshot-calculations.test.ts`, `missing-current-rates-availability.test.tsx` | Cold start and offline presentation                          |
| Open This Month while conversion rates are pending or unavailable        | Dependent values load while pending, then show unavailable without a direction arrow; independent values stay visible | `missing-current-rates-availability.test.tsx`, `period-filter-localization.test.tsx`          | Screen reader and layout                                     |
| Inspect negative prefixed amounts and wealth percentages in Arabic       | One minus sign only; grouping, precision and digits follow the shared locale policy                                   | logic `currency.test.ts`, `WealthBreakdownSection.test.tsx`                                   | RTL and enlarged text                                        |
| Inspect Transactions net worth with seeded sold/disposed holdings        | Effective ownership matches the portfolio projection; terminal asset rows are not valued again                        | `useNetWorth-lifecycle.test.ts`, `useNetWorth.test.ts`, portfolio read-model suites           | Seeded device comparison                                     |

Automated-only producer checks cover stalled response headers/body (bounded
timeout, aborted request, no persistence) and non-contract provider timestamps
(Unknown observation time without discarding an otherwise valid snapshot).
Coverage: `handler.test.ts` and `market-rate-snapshot-contract.test.ts`.

Test corrections separately verify real safe-area prop forwarding, stream retry
emissions, delayed historical fixture validity, and explicit mock/callback
types. The active protocol documentation now distinguishes V2 publication paging
from compatibility V1 and records migrations 071–073.

Terminal-detail rendering remains owned by issue #283 / PR #315. Publication
checkpoint thread `6kAdZI` remains open for a product/sync-contract decision;
this wave does not claim to fix the refresh cursor boundary.
