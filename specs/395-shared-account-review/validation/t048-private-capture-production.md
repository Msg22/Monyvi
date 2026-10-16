# #395 T048 — first-write device-private snapshot capture (source only)

**Source authority:** immutable parent `b0eb67628ecc014df0a81d5bb22046e2e0732665` (tree `c00979ec4c5bf32be380c6376924436ae4bb98f1`), Constitution 1.8.0 at `503f5a1336ba23f6d270615ce1ba47b02116e4f0`, approved `specs/395-shared-account-review/contracts/local-recovery.md`, and the original physical T043/T053 SQLite suites. One exclusive T048 production source lease. No worker tests/formatter/generator/SQL/native/cloud operations.

## Exact changed-only objects at the immutable parent

| Path | Before | Source blob |
| --- | --- | --- |
| `apps/mobile/services/financial-action-foundation-contracts.ts` | `8ce75657b380617c7d22e595e35f0853927afe1d` | `9fb7e1106090bb7a1879538de51d090301b919d4` |
| `apps/mobile/services/financial-action-foundation-repository.ts` | `596803cec19b6192ce654f9d987f063cc8360129` | `7b40ac3b2d308a094e6cd4ceff37936621a6f494` |
| `apps/mobile/services/account-review-save-plan.ts` | `d6752f88b33263901ea783c58cd73f92daa104e6` | `0212859624a86401df9bcc381454a66714886ac2` |
| `apps/mobile/services/account-review-local-snapshot.ts` | NEW | `97ee9b537c52eb13c6299358543db094aff0a9d5` |
| `apps/mobile/services/account-review-local-snapshot-postimages.ts` | NEW | `9858f85ee0c5c3fa40862b11589e9c6ae2405527` |
| `apps/mobile/services/account-review-local-snapshot-sms.ts` | NEW | `07cb0bfcd97e424d8c61162aef25f9932c376048` |
| `apps/mobile/services/account-review-local-snapshot-defaults.ts` | NEW | `3e44fab34e3d154d9b51f0e7ce62033e4eb4a7c2` |
| This validation report | NEW | GitData report blob |

## Canonical source contract and physical sequence

The **only** new plan contract is optional `FinancialActionLinkedOperationPlan.buildLocalRecoverySnapshot(input: FinancialActionLinkedOperationPreparedOwnershipInput): Promise<AccountReviewLocalSaveSnapshot>`. The pre-existing callbacks, public financial envelope, `frozenIntentDigest`, payload hash, synchronized root shape, common registry and legacy tuple validation are unchanged.

Inside `commitLinkedPlan`, the foundation creates a single frozen physical evidence input containing its real `cachedPreimages` and `preparedPostimages`. It calls the existing cached/prepared ownership callback and verifies prepared member identity; **only afterward** it awaits the optional private builder. The candidate is strictly parsed at the authenticated root-bound reader using the original canonical public `actionId`, owner, `review.batch-save/v1` source/session. Validation error paths refuse commit without echoing raw private content. Foundation then rechecks current actor, pending root and unchanged prepared operations, calls `prepareLocalRoot` with the canonical private JSON, and commits **the same root operation plus every linked domain, account, effect and SMS operation in one original `commitPreparedBatch`**. No after-commit root write is added; a private build/owner/adapter failure follows the existing prepared-cache rollback. Non-review/legacy callers omit the callback and keep their old nullable private state.

`createLinkedReviewPlan` wires the builder from **the actual revalidated writer-time** `FrozenReviewSave`, canonical `ReviewBatchSavePayload`, current owner scope, current owned accounts and `SmsSaveScope`. The callback invokes the existing session/current-owner guard again after awaiting all postimage hashes and dependency reads. No source-eligibility/reducer rule or parallel mutable domain DTO is introduced.

## Nine-key evidence from actual persisted sources

- **Created account/child/financial domain refs:** Derive from the canonical `payload.domainMutation.records` and match every exact `table/id` to a real prepared `create` postimage. `expectedPostimageHash` hashes the actual frozen postimage, not a fixture or public intent hash. Effects are deliberately **not** an invented `createdEntityRefs` entity; the helper also verifies exact prepared physical effect membership/owner/action/account/amount/currency/effective status.
- **Hash algorithm:** `hashAccountReviewLocalPostimage` constructs deterministic ASCII-sorted physical `[name, tagged-type-and-value]` entries under `account-review-physical-postimage/v1`, including actual `table` and `id`. Synced domain/account/effect postimages omit only volatile Watermelon transport `_status/_changed`. Device-only SMS draft/queue postimages retain those physical tombstone/transport markers so absence/replacement/rebinding is distinguishable at the downstream replay checker. All values come from actual `Model["_raw"]`; unsupported types fail closed.
- **SMS:** The source snapshot uses the actual owned queue model and authenticated `sessionId`, original queue created/updated timestamps, an unchanged-queue physical postimage hash and `disposition: "present"`. Each prepared SMS delete or sibling rebind must match exactly one immutable **cached preimage** plus its actual prepared postimage, and its operation must be explainable by the selected draft set or canonical bookkeeping. The `available` private variant holds original ID, fingerprint, timestamps, `payloadJson`, selection and canonical decimal text for the physical numeric `payloadVersion`/`position` (both require `Number.isSafeInteger`). SMS input not bound to the queue/owner or with missing/extra prepared evidence rejects the first write. Voice strictly produces `smsDrafts: []`, `queuePreimage: null`, and stores no raw Voice transcript/audio.
- **Defaults/account recovery proof:** Rechecks actual current account membership against the already frozen `creationDefaultSnapshot`. Captures immutable `is_default` preimages with real postimage hashes of every existing active account for account-creation default decisions. For Save actions **without** a creation-default snapshot, it still captures the original default marker and physical postimage of every affected existing account update, including zero-net revisions. This allows later recovery to verify newer account edits without deducing them from the public hash.
- **Dependencies:** Within the owner-scoped, serialized local writer, reads actual nonterminal owned action roots and recognizes prior canonical review-created accounts contributing to the frozen active/default set or currently affected existing financial accounts; captures distinct ASCII-sorted action IDs as `defaultDependencyActionIds`. Unparseable/unprovable potentially account-creating predecessor evidence refuses rather than claiming independent default authority. Full predecessor ordering/transport remains held for T050.

All nine original fields are provided exactly once, validated using the existing `accountReviewLocalSaveSnapshotSchema` and root-bound `parseAccountReviewLocalSaveSnapshot`. There is no new store/table/column and no private evidence in public `payloadJson` or `outcomeJson`. All original Save replay/frozen historical selected-intent checks remain in their original services.

## Root verification and known limits

**Prior grouped Root Red:** The capture suite has **11 total scenarios**: L01 (1), L02 (2), L03 (1), L04 (2), L05–L09 (1 each). Its previous admission was **1 PASS / 10 FAIL** before this source wave. This corrects the earlier erroneous count of 12. The pull suite has **7 P01–P07 cases**, but the deliberately absent dedicated pull module causes **creation Red / zero assertions**. Existing Save/foundation 106 PASS, pure private 40 PASS and generator 20 PASS are **Root's previous wave**, not newly executed results.

**Separate L01 fixture timeout:** Its v30→v31 migration test previously timed out at 5 seconds. The fixture creates an old adapter on a shared-memory SQLite URI and opens a new v31 adapter for the *same URI while the original remains live*. This is a plausible lifecycle/connection contention site, **not an established root cause** without a minimal controlled diagnostic. No arbitrary timeout increase, mocked DDL, package installation or unapproved fixture edit was performed. L01 is an independent harness/migration investigation, **not** an explanation for the private-capture failures.

**Still held:** Dedicated root pull/upsert, private retention/prune/discard/expiry/supersession, post-restart once-only compensation and physical tamper/absence guard, numeric restoration conversion, dependency push ordering, terminal private clearance, privacy across all outbox/log channels. The source hashes expose a real future physical verifier boundary, but **no restoration is claimed**. Historical preimages are preserved without resampling from a newly parsed session.

**Source fileguard:** All newly authored helpers stay well under 900 lines, with short named functions. The pre-existing generic foundation repository already exceeded 900 lines at the immutable parent (937); it is now 989 lines after this T048 seam. Rewriting historical guarded foundation code merely to satisfy the limit would exceed this exclusive, non-destructive grant; Root should treat this as an explicit file-size exception/review consideration, not silent compliance.

**NOT RUN:** Jest, real SQLite, migration, TS, ESLint, Prettier, generator, SQL/pgTAP, CI, native, provider, hosted calls, emulator or device. This artifact performs no Git refs/push/PR/comments/delegation/Codex handoff. Validation is a source-level handoff only; Root owns consolidated Green or repair assignments.

**T048 SOURCE RELEASED — OWNERSHIP FROZEN — STOP.**
