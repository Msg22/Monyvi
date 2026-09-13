# Slice 3B Account-Effects Current-Main Checkpoint

Date: 2026-09-06

Branch: `codex/issue242-account-effects-current-main`

Base: `2fc01442030f313fe07e8d5161856fba41ff8376`

## Selective Reconstruction

The branch replays only the nine issue-#242 commits from the stale Slice 3B
branch. The obsolete Metals payload-registry commit and all unrelated Metals,
fixture, generated, and sync history were excluded. Current-main's dedicated
Metals push remains intact and is composed with account-action RPC
acknowledgements.

Migration `069_account_financial_effects.sql` remains the next migration after
current-main migration 068. Local WatermelonDB schema version 29 adds exact-text
account revisions and account-effect minor units, registers the effect model,
and preserves local uniqueness. Generator safeguards keep private server-only
cutover quarantine data out of the device schema.

## Task Status

| Task      | Status at this checkpoint                                                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T025      | Complete: writer inventory and completeness guard are present.                                                                                                                                            |
| T026-T028 | Complete: Red contracts and recorded failure evidence are present.                                                                                                                                        |
| T029      | Checkpoint-complete: migration 069 compiles after 068 and both SQL suites pass.                                                                                                                           |
| T030      | Partial Green: local model/schema/atomic command exist; direct transaction creation and recurring Pay Now use the boundary.                                                                               |
| T031      | Checkpoint-complete: dedicated push acknowledgement, protected-field handling, device-local SMS recovery, and compensation tests pass.                                                                    |
| T032      | Partial: fail-closed registry exists, but the remaining legacy writers below have not been cut over and the deterministic cutover fixture is absent.                                                      |
| T033      | Infrastructure complete but gate not passed: generated artifacts are updated against current main; full writer cutover, restart/multi-device/cutover coverage, and account-credit E2E remain outstanding. |

## Privacy And Financial Safety

- Complete SMS review recovery snapshots remain device-local. The synchronized
  descriptor contains only normalized action data plus draft ID, queue ID,
  fingerprint, and snapshot hash.
- Account revisions and signed minor units are stored as exact strings on the
  device and as bounded PostgreSQL `bigint` values on the server.
- Cross-currency transfers use destination-currency precision for the converted
  amount.
- The RPC rejects foreign accounts/categories/linked records, stale revisions,
  replay hash mismatches, and revision exhaustion atomically.

## Remaining Registry-Blocked Writers

- Account ownership (`account-service.ts`, `pending-account-service.ts`,
  `edit-account-service.ts`): `account.cash.prepare`,
  `account.cash.prepare-named`, `account.create`, `account.pending.prepare`,
  `account.edit-balance`.
- Transaction ownership (`transaction-service.ts`,
  `batch-create-transactions.ts`): `transaction.update`, `transaction.delete`,
  `transaction.convert-to-transfer`, `transaction.batch-delete`,
  `transaction.batch-import`.
- Transfer ownership (`transfer-service.ts`): `transfer.create`,
  `transfer.update`, `transfer.delete`, `transfer.convert-to-transaction`.
- SMS ownership (durable/legacy review plus foreground, background, headless,
  auto-confirm, notification, and ATM handlers): `sms.review-durable`,
  `sms.review-legacy`, `sms.live-foreground`, `sms.live-background`,
  `sms.live-headless`, `sms.live-auto-confirm`, `sms.notification-confirm`,
  `sms.live-atm`.
- Sync/server ownership: `sync.accounts.pull-full-row` and
  `remote.accounts.authenticated-update`.
- Fixture/repair ownership: `fixture.accounts.upsert`,
  `fixture.accounts.restore`, `repair.accounts.recalculate-all`.

Already guarded at this checkpoint: `account.cash.create-within-writer`,
`transaction.create`, `recurring.pay-now`, `debt.no-active-writer`, and
`sync.accounts.push-full-row`.

## Verification

The PostgreSQL checks used disposable database `codex_issue242_cm_20260906`,
cloned from the local current-main schema-068 database. Migration 069 was
applied only to that copy; the shared manual-QA runtime remained on schema 068.

| Check                                                  | Result                    |
| ------------------------------------------------------ | ------------------------- |
| Migration 069 compile on current-main schema 068 clone | Passed                    |
| `supabase/tests/account_financial_effects_test.sql`    | 38/38 passed              |
| `supabase/tests/account_financial_action_rpc_test.sql` | 36/36 passed              |
| Focused mobile Jest                                    | 12 suites, 121/121 passed |
| Focused logic Jest                                     | 5 suites, 114/114 passed  |
| Generator script tests                                 | 18/18 passed              |
| Mobile TypeScript                                      | Passed                    |
| Database package TypeScript                            | Passed                    |
| Focused ESLint                                         | Passed                    |
| Focused Prettier                                       | Passed                    |
| `git diff --check`                                     | Passed                    |

The issue-#242 account artifacts regenerated deterministically. The whole-tree
drift audit also reproduced inherited current-main generator drift: five
untracked Metals base models, `BaseAsset` field ordering, and schema formatting.
Those unrelated post-check outputs were restored and are not included in this
branch.

## Publication Boundary

This branch is suitable only for a draft checkpoint PR. It is not full #242, not
an enablement gate, and not safe as a dependency for credited Sale, credited
Undo, or account compensation/replacement-credit journeys. No such journey may
merge against this checkpoint until every blocked writer is either cut over or
deliberately quarantined and the required deterministic local, restart,
multi-device, cutover, and end-to-end tests pass.
