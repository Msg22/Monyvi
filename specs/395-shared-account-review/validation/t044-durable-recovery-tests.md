# #395 T044 — Durable recovery / dependency tests-first handoff

Date: 2026-10-16. **Source-only remote tests; no execution or source changes.**
GitData parent (immutable) `65ae08083a9443f561d23563a73047774e349872`, parent of that context `b0eb67628ecc014df0a81d5bb22046e2e0732665`. Trusted governance `503f5a1336ba23f6d270615ce1ba47b02116e4f0`; canonical spec, contracts, plan and tasks are overlaid at the assigned parent. Do not use a mutable PR head as governance.

## Ownership and existing baseline

New owned tests and test-only helpers only:

- `apps/mobile/__tests__/services/account-review-durable-recovery.sqlite.integration.test.ts`
- `apps/mobile/__tests__/services/account-review-durable-recovery-dependency.sqlite.integration.test.ts`
- `apps/mobile/__tests__/services/account-review-durable-recovery-test-helpers.ts`
- This validation document.

`account-review-sync.test.ts` and `account-review-sync-test-fixtures.ts` remain **unchanged** (Root baseline: 24 authored, 5 pass/19 fail; preexisting 17c typing repair included). Existing T043/T053 physical capture source remains **Storage-owned**, including the foundation contracts/repository, Save plan and snapshot helpers. Existing T043 SQLite baseline reported by Root: 11 cases, 1 pass/10 fail (one separate migration timeout); private-logic 40 and generator 20 passed. **These numbers are intake facts, not executions by this worker.** The independent Panel SQL/pgTAP and Add work are untouched.

## Actual inspected source, not presumed APIs

Pinned production:
`financial-action-reconciliation-service.ts`,
`financial-action-reconciliation-production.ts`,
`financial-action-sync-service.ts`,
`financial-action-foundation-contracts.ts`,
`financial-action-foundation-repository.ts`,
`financial-action-root-integrity.ts`,
`sync/account-protected-fields.ts`,
`sync/push-service.ts`,
`sync/pull-strategies.ts`,
`sync/transforms.ts`,
`sync/config.ts`,
`sms-review-draft-retention.ts`,
`sms-review-draft-cleanup-service.ts`,
`sms-review-draft-repository.ts`,
`sms-review-draft-batch-service.ts`,
`sms-review-namespace-draft-expiry.ts`,
`sms-review-namespace-lifetime.ts`,
`sms-review-namespace-repository.ts` and
`sms-review-namespace-lease-service.ts`.
Used current real `account-review-local-recovery-test-harness.ts`,
Save SQLite helpers/ledger models, source-specific real session fixtures, current model/schema31, and `packages/logic/src/financial-actions/review-local-recovery.ts`. Existing canonical registry is reused; no new financial DTO, schema, private carrier, serializer or public wire field.

The production services currently have no complete review-batch private-root reconciliation, namespace lifecycle compensation and predecessor-aware protected sync. Tests intentionally invoke **current real services**, yielding behavioral Red until T049-T051 source is separately granted and implemented. The SQLite module mock supplies the *real* Node dispatcher/schema/model registry; dependency/transport stubs stand in for authentication boundary or RPC transport **only**, not Save, writer, financial action, reconciliation, retention, namespace or sync logic.

## Authored physical tests (12 expanded cases)

| ID | Actual proof / expected result |
| --- | --- |
| D01 | Commit genuine selected SMS Bank Save; clone adapter; original queue header and every available draft preimage preserved with strict nine-key root. Proven all-selected prune records `pruned_empty` while queue is physically absent. |
| D02 | Stage a deterministic local stale outcome using the real foundation service; reopen a **fresh SQLite adapter**, authenticated owned-root lookup, invoke real production reconciler. Recreate exact original header/drafts, clear all action-created active account/Bank child/sender/transaction refs, retain unchanged original accounts/defaults, deactivate actual effects, clear terminal private bytes, and replay without a second mutation. |
| D03 | After Save/stale/restart, genuinely update action-created BankDetails `accountNumber`; attempt real recovery. Refuse changed domain postimage, preserve newer value and all financial/draft state; no partial compensation. |
| D04 | Switch authenticated owner for an otherwise owned stale root; real recovery must fail without changing physical owner records. |
| D05 | Give sibling SMS entries different real `parsedAt` values before Save. Call **actual** retention cleanup at 30-day exact equality; redact only expired entry to seven-key metadata, retain newer sibling byte-for-byte; prevent remaining original raw payload leak. |
| D06 | True namespace acquire and cancelled release through existing writer after original `pruned_empty`; even when newer queue disappears, original right remains `superseded`, and rejection must never reintroduce old queue. Do not require every SMS entry to be individually superseded absent explicit contract. |
| D07 | Save one real shared SMS group, retain linked unselected rebind drafts; explicitly delete one with real draft writer, verify its precise private preimage becomes seven-key `superseded` while other entries remain intact; stale recovery must not resurrect it. |
| D08 | Real foundation + sync RPC path on cloned SQLite; transport failure only is injected. RPC args are precisely `{payloadHash,payloadJson}` and contain no private bytes, raw SMS draft payload or private column. Root remains `sync_failed` with identical local snapshot and no fabricated canonical receipt. |
| D09 | Real first Voice Cash optimistic default account followed by disjoint generated-ID SMS Bank Save offline. Second root must capture first action ID as sole default predecessor; no RPC while pending. Once first is marked canonical accepted via real foundation state service, second's **unchanged** immutable envelope is dispatched once. |
| D10×2 | Same real two-root case: predecessor marked stale/rejected or unsupported/sync-failed with actual state transitions; dependent RPC is withheld, immutable root unchanged. |
| D11 | Same real dependent root under switched foreign actor; no RPC and no cross-owner state mutation. |

This covers queue/header preimages, root/action/owner/session binding, postimage CAS, retained accounting identity, default stability, physical children/effect membership, restart/replay, partial strict retention, discard and replacement, private RPC exclusion, and explicit predecessor state dependencies. The server rejection and acceptance **outcome fixtures** exercise local state handling; they are NOT pgTAP proofs or claims that remote SQL emitted canonical outcomes.

## Exact internal APIs consumed / minimal requested SOURCE seams

Existing:
- `createAccountReviewSaveService(...).saveSelectedAccountReview(fixture)` through the real Save harness; `createFinancialActionFoundationRepository` and its `markFinancialActionGroupSyncPending`, `recordFinancialActionGroupServerOutcome`, `getFinancialActionGroup`;
- `productionFinancialActionReconciliationService.reconcileRejectedAction(actionId)`, `createFinancialActionSyncService(...).syncAction(actionId)`;
- `cleanupExpiredSmsReviewDrafts({now})`, `deleteSmsReviewDraftsInWriter(draftIds,ownerId)`, `acquireSmsReviewNamespaceInWriter({expectedUserId})`, `releaseSmsReviewNamespaceInWriter({lease,disposition})`;
- `parseAccountReviewLocalSaveSnapshot({json,expectedRoot})` with only genuine captured root bytes; `SQLiteAdapter.testClone` with the real model registry.

**Proposed for Root review BEFORE any production source grant:** no new public interface, union or copied DTO is necessary for these tests. The existing `FinancialActionFoundationRepository.getFinancialActionGroup(actionId): Promise<FinancialActionGroup|null>` is a sufficient owned predecessor lookup. Add one **internal** async validation/dispatch step to the current sync path, conceptually `assertReviewDefaultPredecessorsAccepted(root: FinancialActionGroup, repository: Pick<FinancialActionFoundationRepository,"getFinancialActionGroup">): Promise<void>`, reading the real strict private snapshot by immutable action/owner/session binding and checking each predecessor's canonical accepted state before dependent network call. Rejected/unsupported/foreign/missing roots cannot be bypassed or re-timestamped; no fire-and-forget dispatch. The reconciliation production path similarly needs its own internal authenticated root/private parser and one owned atomic compensation writer, *not* a test-only exported debug API. Storage separately controls the optional typed builder and real postimage hashes. Signatures are **proposals only**, not source permission or an API claim.

## Explicit boundaries, Red interpretation and remaining proof

**NOT RUN by this worker:** Jest, TypeScript, ESLint, SQL/pgTAP, generator, local SQLite, CLI, emulator, native/visual/accessibility, hosted/provider/deployment, formatters. No existing code/tests changed, no local file writes, refs/push/branch/PR/comment changes, and no delegated worker. GitData blobs/tree/commit are unreferenced; Root owns import and all grouped checks.

The suites are written to fail against missing downstream production functionality rather than satisfying assertions with mocked Save/reconciliation or invented postimage hashes. The exact current failures and runnable type status **are unverified** until Root runs the grouped Jest/type/lint checks after Storage's capture API freeze. In particular, cloned-adapter reconciliation must operate on the fresh authenticated root (the test's DB-module getter swaps only real adapters), and staged test server outcomes intentionally do not prove SQL canonical evidence.

**Open gaps for subsequent owner/source wave and Root acceptance:** direct generic-push/outbox/log-byte inspection on *real Watermelon change sets*, actual missing child/effect and duplicate-fingerprint recovery races, absent-queue postimage corruption, partial compensation rollback injection, default metadata newer-choice conflict, accepted/unsupported SQL tuple registry, pending-root cleanup exact atomic witness, canonical server absence/revision hashes, and physical re-run of all existing T044/T043 cases. Existing 24-case T044 suite exercises much of generic collector behavior but currently has 19 Red and must remain intact. If a proposed source signature changes after Root review, amend tests within this owned suite only; do not force implementation into an invented seam.

**Ownership:** tests/fixture/report files only, released after unreferenced GitData commit. Source, checks, ref movement, SQL and deployment remain with separately authorized owners.
