# Issue #242 Account-Balance Writer Inventory

**Status**: T025 Red inventory and guard complete. Active financial writers remain
intentionally unguarded until T032 routes or blocks them.
**Validated against current main**: `bf2e3a071c2814772e9a9669479afeeb85d48767` on
2026-09-01. This branch must rebase before any implementation integration.
**Authority**: Constitution 1.6, live issue #242, `tasks.md` T025-T033,
`contracts/{action,command,rpc,reconciliation,metadata-lww,test-harness}-contract.md`,
and `docs/business/business-decisions.md`.

The originally supplied discovery path `dependencies/account-integrity.md` does
not exist on current main. T025's canonical target is this file.
`dependencies/issue-242.md` remains reserved for T033.

## Inventory Rules

- One row identifies one callable mutation primitive or externally reachable
  bypass.
- Indirect callers reuse the primitive's row and are listed under Path coverage.
- `balance = 0` creation is not fabricated financial history. It must initialize
  `financial_revision = 0`; no effect row is allowed until a real non-zero
  effect exists.
- A newly inferred account whose initial balance includes imported financial
  results is not zero initialization. Its linked effects, action root, outbox,
  balance, and revision must commit as one group.
- T032 must list every active ID below in
  `apps/mobile/services/account-balance-writer-registry.ts` as `guarded` or
  `blocked`. A documentation-only exemption is forbidden.
- `accounts.balance` and `accounts.financial_revision` may be written only by
  the guarded command/RPC/reconciliation boundary. Generic sync may carry
  approved account metadata only.

## Active Local Mutation Primitives

| Writer ID                           | Current implementation anchor                                                                         | Current callers / financial path                                                                    | T032 disposition                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `account.cash.create-within-writer` | `account-service.ts#createCashAccountWithinWriter` (`acc.balance = 0`)                                | Onboarding `confirmCurrencyAndOnboard`; `ensureCashAccount`; SMS ATM cash destination               | Guard zero-revision initialization; no fabricated effect                                              |
| `account.cash.prepare`              | `account-service.ts#prepareCashAccount` (`account.balance = initialBalance`)                          | Durable SMS review cash destination                                                                 | Zero initialization may stay effect-free; non-zero initial balance must be linked to imported effects |
| `account.cash.prepare-named`        | `account-service.ts#prepareNamedCashAccount` (`account.balance = initialBalance`)                     | Durable SMS review named ATM destination                                                            | Same rule as `account.cash.prepare`                                                                   |
| `account.create`                    | `account-service.ts#createAccountForUser` (`acc.balance = roundForCurrency(...)`)                     | Add Account through `useCreateAccount`                                                              | Non-zero initial balance becomes a guarded adjustment; zero starts at revision 0                      |
| `account.pending.prepare`           | `pending-account-service.ts#preparePendingAccounts` (`record.balance = initialBalanceByDedupKey...`)  | Legacy SMS review and durable SMS draft save                                                        | Imported non-zero initial balance must be represented by the same selected batch action effects       |
| `account.edit-balance`              | `edit-account-service.ts#updateAccountWithinWriter` (`acc.balance = roundForCurrency(...)`)           | `updateAccountWithBalanceAdjustment` through Edit Account; optional internal adjustment transaction | Guard old/new delta and evidence atomically; metadata-only edit must omit protected fields            |
| `transaction.create`                | `transaction-service.ts#prepareTransactionCreateWithBalance` (`record.balance +=/-=`)                 | Manual/voice transaction, recurring Pay Now, live SMS transaction                                   | One guarded account effect; stable domain action ID                                                   |
| `transaction.update`                | `transaction-service.ts#updateTransaction` (revert old and apply new balances)                        | Edit transaction, including account/type/amount changes                                             | One complete correction group; unique sorted guard per affected account                               |
| `transaction.delete`                | `transaction-service.ts#deleteTransaction` (reverse balance)                                          | Soft delete from Edit Transaction                                                                   | Append compensating/reversal evidence; never hard-delete history                                      |
| `transaction.convert-to-transfer`   | `transaction-service.ts#convertTransactionToTransfer` (revert transaction then debit/credit transfer) | Edit Transaction conversion                                                                         | One atomic group; source and destination guarded exactly once                                         |
| `transaction.batch-delete`          | `transaction-service.ts#batchDeleteDisplayTransactions` (`a.balance = nextBalance`)                   | Transactions multi-select delete for transactions and transfers                                     | One complete grouped command with deterministic account ordering                                      |
| `transfer.create`                   | `transfer-service.ts#createTransfer` (source debit, destination credit)                               | Manual transfer and live SMS ATM via `createSmsAtmTransfer`                                         | Guard source and destination exactly once in ascending account-ID order                               |
| `transfer.update`                   | `transfer-service.ts#updateTransfer` (revert old pair, apply new pair)                                | Edit transfer, including cross-currency edit                                                        | One complete correction group across every old/new affected account                                   |
| `transfer.delete`                   | `transfer-service.ts#deleteTransfer` (reverse source/destination)                                     | Soft delete from Edit Transfer                                                                      | Append reversal evidence; guard both accounts                                                         |
| `transfer.convert-to-transaction`   | `transfer-service.ts#convertTransferToTransaction` (revert transfer then apply transaction)           | Edit Transfer conversion                                                                            | One atomic group; every affected account appears once                                                 |
| `transaction.batch-import`          | `batch-create-transactions.ts#prepareBatchCreateTransactions` (`record.balance = nextBalance`)        | Voice review, legacy SMS review, durable SMS draft save, ATM transfer rows                          | One root/outbox with ordered per-account effects; selected batch is all-or-none                       |

## Indirect Domain And Runtime Paths

These paths do not introduce another assignment site. They are separate
acceptance paths because replay, restart, background delivery, and user-scope
behavior differ.

| Path ID                    | Entry path                                                                                             | Reused primitive(s)                                                                        | Required proof                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `recurring.pay-now`        | `recurring-payment-service.ts#submitRecurringPayment`                                                  | `transaction.create`                                                                       | Transaction, balance/revision, and schedule completion/advance commit once or not at all; retry is idempotent |
| `sms.review-durable`       | `sms-review-draft-save-service.ts#saveSelectedSmsReviewDrafts`                                         | `account.cash.prepare*`, `account.pending.prepare`, `transaction.batch-import`             | Selected items, new accounts, effects, balances, revisions, and draft deletion are one atomic batch           |
| `sms.review-legacy`        | `sms-review-save-service.ts#prepareSavePayload` then review save callback                              | `account.pending.prepare`, `account.cash.create-within-writer`, `transaction.batch-import` | No pending account may commit before its selected financial group                                             |
| `sms.live-foreground`      | `_layout.tsx` foreground `onTransactionDetected` to `handleDetectedSms`                                | `transaction.create` or `transfer.create`                                                  | Fingerprint dedup plus stable action replay                                                                   |
| `sms.live-background`      | native event listener while app backgrounded to `handleDetectedSms`                                    | `transaction.create` or `transfer.create`                                                  | Same owner-pinned guarded action as foreground                                                                |
| `sms.live-headless`        | `index.js#registerSmsHeadlessTask` to `smsDetectionTask` to `handleDetectedSms`                        | `transaction.create` or `transfer.create`                                                  | Retry/restart preserves one action/effect                                                                     |
| `sms.live-auto-confirm`    | `handleDetectedSms` auto-confirm branch to `saveDetectedTransaction`                                   | `transaction.create` or `transfer.create`                                                  | Same fingerprint and same action identity cannot apply twice                                                  |
| `sms.notification-confirm` | `initializeDetectionActionHandler`; foreground response or cold-start `replayLastNotificationResponse` | `transaction.create` or `transfer.create`                                                  | Repeated response/dismiss retry applies one effect and remains owner-scoped                                   |
| `sms.live-atm`             | `saveDetectedTransactionWithoutLock` to `createSmsAtmTransfer`                                         | `account.cash.create-within-writer`, `transfer.create`                                     | Bank debit and Cash credit guard both accounts; destination creation is atomic                                |
| `debt.no-active-writer`    | No current debt command service changes an account balance on this baseline                            | None; linked debt transactions still use transaction writers                               | Registry must block any future debt balance mutation unless routed through guarded transaction/effect command |

## Remote, Fixture, Repair, And Sync Bypasses

| Writer ID                              | Current implementation anchor                                                                               | Risk                                                                                  | T032 disposition                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `sync.accounts.push-full-row`          | `sync/push-service.ts#pushChanges` plus `transformToSupabase`; generic `accounts` upsert sends full raw row | Stale device can overwrite accepted balance                                           | Exclude protected columns and route financial roots/effects through dedicated sync                     |
| `sync.accounts.pull-full-row`          | `sync/pull-strategies.ts#pullUserTable`; `select("*")` and unfiltered transform                             | Generic pull can overwrite local optimistic/canonical protected fields                | Pull metadata whitelist only; dedicated reconciler installs verified financial projection              |
| `remote.accounts.authenticated-update` | Existing Accounts RLS update policy permits owner full-row updates                                          | Any current client can bypass action ID/hash/revision                                 | Fail closed with column/RPC enforcement; least-privilege grants                                        |
| `fixture.accounts.upsert`              | `seed-fixtures/seed-engine.js#seedFixtureData`; service-role `accounts` upsert                              | Creates/replaces balances without revision/effect protocol                            | Local test/dev fixture only; seed explicit revision-0 or deterministic guarded fixtures as appropriate |
| `fixture.accounts.restore`             | `seed-fixtures/seed-engine.js#restoreSeededAccountBalances`                                                 | Direct post-ledger balance restoration                                                | Replace with deterministic cutover/action fixture; no production path                                  |
| `repair.accounts.recalculate-all`      | Active `public.recalculate_all_account_balances()` from migration 044 directly updates `accounts.balance`   | Security-definer repair can erase initial/manual/transfer effects and bypass revision | Revoke application access and replace/block under explicit test/developer cutover contract             |

## Historical Non-Writers

- Migration 020 created transaction balance triggers, but migration 024 drops
  all three triggers and the trigger function. They are not active runtime
  writers.
- `public.recalculate_account_balance(account_id)` calculates a value but does
  not mutate. Its caller `recalculate_all_account_balances()` is the active
  repair writer.
- Daily snapshot functions read account balances only.
- Account deletion soft-deletes account-related rows but does not assign a new
  balance.
- Debt rows store `original_amount` and `outstanding_amount`; no current debt
  service mutates an account balance.

## Completeness Search Evidence

T025 validated current-main production TypeScript/JavaScript and SQL for model
assignments, compound assignments, Supabase account upserts/updates, `SET balance`,
WatermelonDB writers/batches, and callers of every mutation primitive. The
validated snapshot contains:

- 16 active local mutation primitives in the first table;
- 10 distinct indirect domain/runtime paths, including explicit no-active-debt
  state;
- 6 remote/fixture/repair/sync bypasses;
- zero active transaction triggers after migration 024.

`apps/mobile/__tests__/architecture/account-balance-writer-guard.test.ts`
preserves this inventory as an executable completeness and migration guard.
