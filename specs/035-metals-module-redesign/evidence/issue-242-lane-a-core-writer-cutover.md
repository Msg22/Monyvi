# Issue #242 Lane A Core Writer Cutover Checkpoint

Date: 2026-09-06

Branch: `codex/issue242-core-writer-cutover`

Stacked base: `81c79c72a53e1b60afaeff88f2dde642198c6c85`

Target: `codex/issue242-account-effects-current-main`

## Scope And Status

This checkpoint cuts the independent transaction and transfer writers over to
the account financial-action command boundary. It does not change migration 069,
the synchronized action schema, SMS orchestration, fixtures, repair, or Metals
journeys.

| Writer                            | Status  | Evidence                                                                                                                                                                          |
| --------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transaction.update`              | Guarded | Exact old-effect reversal plus new effect; same-account effects collapse to one revision increment; cross-account edits use each account currency precision.                      |
| `transaction.delete`              | Guarded | Transaction soft-delete and exact inverse account effect share one local command group.                                                                                           |
| `transaction.convert-to-transfer` | Guarded | Transaction delete, transfer create, and both account effects share one group; conversion fails closed when different account currencies require an unavailable converted amount. |
| `transaction.batch-delete`        | Guarded | Mixed transaction/transfer records produce one sorted mutation set and one aggregated effect per account.                                                                         |
| `transfer.create`                 | Guarded | Source amount uses source precision; converted amount uses destination precision; cross-currency writes require an explicit destination amount.                                   |
| `transfer.update`                 | Guarded | Old effects are reversed and new effects applied atomically, including converted-amount-only changes and account swaps.                                                           |
| `transfer.delete`                 | Guarded | Transfer soft-delete and both exact inverse effects share one group.                                                                                                              |
| `transfer.convert-to-transaction` | Guarded | Transfer delete and transaction create are one group; a destination-account transaction uses the converted amount and destination currency.                                       |

The shared preparation service validates ownership, deleted state, signed
minor-unit range, safe balances, revision overflow, deterministic ASCII order,
one net effect per account, operation postimages, and the prepared-create
revision-zero case. Identical replay is delegated to the foundation without
preparing or applying a second local plan. Metadata-only edits, including edit
forms that resubmit unchanged financial fields, do not create zero-effect
actions.

## TDD Evidence

The Red phase was recorded locally before production implementation:

- shared command preparation: missing module;
- transaction writer service: missing module, followed by a canonical domain
  reference mismatch exposed by the first implementation;
- transfer writer service: missing module;
- unchanged-financial-field edit cases: transaction rejected with
  `INVALID_TRANSACTION_AMOUNT`; transfer rejected as a zero effect;
- prepared account create and same-account update composition: wrong expected
  revision and duplicate prepared updates.

The corresponding Green coverage lives in:

- `apps/mobile/__tests__/services/core-account-financial-action-service.test.ts`
- `apps/mobile/__tests__/services/transaction-core-writer-service.test.ts`
- `apps/mobile/__tests__/services/transfer-core-writer-service.test.ts`
- the existing transaction and transfer public-service suites
- `apps/mobile/__tests__/architecture/account-balance-writer-guard.test.ts`

## Account Contract Expansion Decision Matrix

No option in this table is implemented by this checkpoint. The current registry
remains blocked for every row.

| Variant                                         | Required ordered mutation/effect evidence                                                                                                                                                                                                 | Required invariants                                                                                                                                                                                                                                        | Required contract and verification work                                                                                                                                                                                                                                                                                   | Replay, rollback, and sync consequence                                                                                                                                                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full `account.create`                           | Canonical records: `account:create`, then zero or more `account_sms_sender:create`, then optional `bank_details:create`; one account effect equal to `openingBalanceMinorUnits`; new-account guard revision `0`.                          | All children link to the created account; child ownership is inherited through that parent; final local balance equals the opening effect; final revision is `1`; provider/sender/card normalization is unchanged.                                         | Add child mutation entities and exact after schemas to TypeScript and SQL validators; extend migration 069 RPC application/ownership checks; add mobile command, registry, pgTAP, rollback, duplicate-submit, child-sync, and restart tests.                                                                              | One action ID must replay without duplicate account or children. Any child failure rolls back account, effect, revision, root, and outbox. Dedicated sync must acknowledge the whole group before generic child push can mark rows synced.                        |
| Full account edit with balance                  | Canonically sort the primary `account:update`, optional prior-default `account:update`, account-sender creates/updates/deletes, and bank-details create/update/delete; include one effect only when the target balance differs.           | Live preimage supplies the delta; target account metadata and balance share one postimage; at most one default account remains; every child belongs to the edited account; metadata-only edits carry no account effect.                                    | Expand the operation shape beyond one account record; add child entities and multi-account metadata CAS rules; update RPC, TypeScript validator, postimage assertions, local command tests, pgTAP, default-account races, and sync acknowledgements.                                                                      | Replay returns the stored group and must not repeat default/child changes. Any stale preimage or child failure rolls back all records. Sync must preserve the group rather than independently pushing an intermediate default or child state.                     |
| Account edit plus adjustment transaction        | Exact records: `[account:update, transaction:create]`; one account effect equal to `targetBalance - liveBalance`. The transaction is evidence for that same effect and must not cause a second balance application.                       | Same owner, account, and currency; transaction amount equals the absolute effect; transaction type matches its sign; fixed adjustment category is owned/accessible; target balance and transaction postimages match the envelope.                          | Extend the TypeScript operation shape and composite-link validator; change migration 069 validation/application; add local postimage, category ownership, stale CAS, replay/hash mismatch, rollback, RPC pgTAP, and dedicated-sync tests.                                                                                 | One action replays both records exactly once. Account and transaction roll back together. Sync must acknowledge them as one financial group and prevent generic transaction push from double-applying the represented effect.                                     |
| Cash/pending account creation inside SMS review | One privacy-safe composite action containing sorted account creates, account child creates, transaction/transfer creates, review-draft cleanup, and one aggregated effect per affected account; each created account guard begins at `0`. | Full SMS recovery snapshot remains device-local; synchronized evidence contains only normalized financial data plus minimal IDs/fingerprint/hash; temp IDs resolve deterministically; duplicate account identities and SMS fingerprints remain idempotent. | Define a composite SMS/account operation rather than placing prepared account mutations outside evidence; extend TypeScript/SQL entities, validators, RPC, device-local recovery coordination, transaction/transfer links, destination precision, pgTAP, foreground/background/headless, restart, and batch-review tests. | Replay must recreate nothing and return the same temp-to-real resolution. Any account, child, transaction, transfer, or cleanup failure rolls back the whole local group. Sync must send only the minimal descriptor and acknowledge every linked row atomically. |

Recommendation: approve the explicit composite shapes above rather than split
financial and related domain writes into separate actions. Splitting would lose
the current all-or-nothing user semantics and create replay/sync windows where
the balance, history record, account metadata, or SMS review state disagree.

## Still Blocked After This Lane

- Account domain: `account.cash.prepare`, `account.cash.prepare-named`,
  `account.create`, `account.pending.prepare`, `account.edit-balance`.
- Shared batch writer: `transaction.batch-import` (Voice and SMS review share
  the same prepared mutation primitive, so it cannot be declared guarded by a
  Voice-only call-site change).
- All SMS indirect paths, sync pull/server direct writers, fixtures, restore,
  and repair remain as listed in the Slice 3B base checkpoint.

T032 remains partial. This checkpoint is not the issue #242 completion gate and
does not enable account-credit Metals journeys.

## Verification At Local Checkpoint

| Check                                               | Result                         |
| --------------------------------------------------- | ------------------------------ |
| Focused core/public-boundary/foundation mobile Jest | 9 suites, 122/122 passed       |
| Full mobile Jest                                    | 321 suites, 2,760/2,760 passed |
| Account-effects logic Jest                          | 2 suites, 9/9 passed           |
| Mobile TypeScript                                   | Passed                         |
| Full mobile ESLint with project rules               | Passed                         |
| Focused Prettier                                    | Passed                         |
| `git diff --check`                                  | Passed                         |

No SQL, migration, generated schema, or remote database file changed in this
lane, so the base checkpoint's isolated migration/pgTAP evidence is inherited
rather than re-run or claimed as new Lane A evidence.
