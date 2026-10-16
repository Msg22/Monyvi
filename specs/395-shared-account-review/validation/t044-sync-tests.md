# #395 T044 — Sync and reconciliation tests-first handoff

**Status, 2026-10-16: TESTS ONLY. NOT RUN. No T050/T051 implementation admitted here.**

Exact parent: 8343b732ec0ae4ff55741baf41c299579214b9c0.
This includes the pure frozen-intent digest contract and the currently
provisional Save source. The approved T048 writer still lacks an admitted
digest-bearing successful Save seed. **No fake successful Save, server receipt
or transport action was substituted.**

## Governance and sources inspected

- Offline financial engineer persona and its offline-financial-systems skill.
- Constitution, root AGENTS.md and business decisions (data safety and sync).
- #395 plan/tasks and approved financial-save/wire-shapes contracts.
- Actual sync/account-protected-fields, push-service, push-ownership-service,
  financial-action-sync-service, reconciliation-service and production loader;
  existing legacy collector, coordinator and recovery tests.

## Existing public API inventory

The new account-review-sync.test.ts invokes the **existing**
collectAccountFinancialActionPushBundles,
collectProtectedFinancialActionRowIds,
isProtectedFinancialActionRow,
stripProtectedAccountFields,
createFinancialActionPushCoordinator,
createFinancialActionReconciliationService,
parseFinancialActionEnvelopeJson and resolveFinancialActionReplay.

The new adjacent account-review-sync-test-fixtures.ts reuses the canonical
approved review-batch-save-fixtures, the existing opt-in pure action registry
and hashFinancialActionEnvelope with a real Node SHA-256 provider. It adds
one schema-valid BANK sender mutation under the actual planned Bank account
and derives exact group change IDs for accounts, BankDetails, sender,
transactions, transfers and account_financial_effects. No root is falsely
claimed to have been locally committed: these are typed SyncPushArgs change
sets, which are the collector API's documented input.

## Case inventory and expected Red classification

- T044-01: strict review-only Bank root and exactly grouped Bank/BankDetails/
  sender/two transaction/effect IDs; original default snapshot, the exact
  signed 1500-minor-unit effect and new Bank nondefault flag remain bound.
- T044-02: suppress all review-owned account/child/financial rows from generic
  LWW while retaining dedicated root/effects.
- T044-03: ATM transfer and both source/destination account effects guarded;
  account financial balance/revision excluded from metadata push.
- T044-04: Voice zero-net real two records and single zero-effect guard;
  no SMS bookkeeping or raw Voice snapshot.
- T044-05, 5 variants: missing required account, BankDetails, sender,
  transaction or effect rejects incomplete group before RPC/acknowledgement.
- T044-05b: orphan dirty action effects and children with no root never push.
- T044-06: reparented BankDetails or sender child cannot piggyback on group.
- T044-07: missing confirmed-group ref with original physical account creates
  rejects via strict review validation.
- T044-08: foreign raw root owner mismatching canonical owner rejects.
- T044-09: valid-length but wrong SHA-256 must reject before RPC even if JSON
  is otherwise canonical; independent SHA-256 of canonical payload bytes
  proves the supplied mismatched hash is not a valid commitment.
- T044-10, 2 variants: wrong source or new-account financial expected revision
  rejects before dedicated action transport.
- T044-11: legacy account.balance-effects/v1 unchanged collection/effects.
- T044-12: transport exception on canonical review payload leaves retryable
  sync_failed, without any fabricated success outcome.
- T044-13: rejected_compensating with incomplete recovery yields recover,
  never re-submits the financial action.
- T044-14: reconciled root acknowledges without a second RPC.
- T044-15: no generic financial-only inverse of review Bank, sender,
  creation-default snapshot and local SMS mapping lacking T051 evidence.
- T044-16: foreign-user recovery bundle does not mutate original owner.
- T044-16b: reconciled root with ineffective effects returns replay without
  repeating legacy foundation compensation; not complete T051 recovery proof.
- T044-16b: already reconciled/ineffective effects yield replay without repeat
  compensation (foundation guard, NOT proof of review child/SMS restoration).
- T044-17: Voice zero-net review rejects *unverified* generic inverse rather
  than pretending complete new-tuple recovery; Voice raw review is not stored.

Pre-T050 source currently recognizes only account.balance-effects/v1 in
the protected collector. The new review bundle/completeness tests should
therefore exhibit meaningful Red, unlike T044-11 legacy baseline.
Current generic reconciliation lacks review-specific local snapshots and
must not be counted as a completed T051 compensation implementation.
Tests/TypeScript/lint/formatter were NOT RUN here.

## Narrow new-seam needs, for Root adjudication (NOT new exported APIs)

T050: The current synchronous collector sees only dirty change sets. It
cannot independently prove current authenticated user, true canonical payload
SHA-256 with no hash provider, or the existence of physical child rows omitted
from dirty changes. The existing async pushChanges entry point already knows
authenticated userId, scoped Watermelon Database, and the injected coordinator.
Add review-only pre-RPC admission there or a similarly existing owned seam:
take userId, DB, changes, explicit review registry and SHA provider; validate
root owner/payload hash and strict tuple, complete local account/BankDetails/
sender/transaction/transfer/effect and revision/absence membership, and
child parent ownership. Only complete groups get a candidate. Failure must
abort the push or retain every dirty protected ID in experimentalRejectedIds
without marking synced. Preserve legacy tuple ordering/behavior.
A separate actual Watermelon markLocalChangesAsSynced test after T050 must
verify local dirty flags never advance on incomplete push; this pure
collector suite does not claim the DB-level acknowledgement proof.

T051: Current FinancialActionReconciliationBundle allows only one legacy
SMS durable draft snapshot, and production loadProductionReconciliationBundle
sets localSmsReviewDraftSnapshot to null. Generic inverse effects omit new
Bank/child/default and selected/unselected SMS queue mapping restoration.
Use the already approved device-local account-review-local-save/v1 snapshot
contract (owner/session/action, smsDrafts, createdEntityRefs,
defaultPreimages and defaultDependencyActionIds), current immutable root,
verified canonicalAbsentAccountIds/effect evidence and current postimages.
Provide a typed owner-scoped review-specific atomic reconciliation path through
the existing reconciliation dependency boundary. Compare expected postimage
hashes and current session mapping; newer user edits must yield
reconciliation_incomplete with no overwritten choice; otherwise compensate
all created domain rows, effects, defaults and original SMS draft mapping
exactly once and persist reconciled terminal state. On cold restart, repeat
must replay with no second writes. Voice retains its financial-action recovery
without raw Voice review persistence. Old sms.review-durable recovery remains
FREE-owned and unchanged.

**Precisely unavailable now:** Real SQLite-positive rejection compensation
and cold-restart once-only SMS draft restoration/collision refusal cannot be
demonstrated until a true review-local snapshot reader and atomic T051
transaction seam exist. The provisional writer cannot yet provide an authentic
digest-bearing root to seed those lifecycle tests. Do not replace this with a
fabricated success writer or overloaded outcome/legacy snapshot field.
A separate new real-SQLite T051 test slice is needed after those admissions.

## Validation ledger

- Jest, strict TypeScript, lint, formatting, SQLite, SQL/Edge, native,
  provider and hosted checks: **NOT RUN**.
- No existing files modified; only two new T044 test/fixture paths and this
  validation report. No production, schema, migration, generated, UI, locale,
  sync-policy or legacy-recovery changes.
- No refs, pushes, GitHub PR/issue/comments, provider/emulator/native,
  delegation or Codex handoff. Root owns coherent Red admission.
