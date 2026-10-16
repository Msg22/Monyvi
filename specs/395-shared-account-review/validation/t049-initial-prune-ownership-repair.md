# #395 T049 — Initial queue-prune ownership repair (candidate, unverified)

Date: 2026-10-16. **Immutable parent:** `4bf5ce05f8f1a070e4fefcdf98686fae688ef3aa`, tree `db388b29ac45078d7af0f2ba11d800eb5b720c75`. Governance remains `503f5a1336ba23f6d270615ce1ba47b02116e4f0`. This is a narrow worker-owned change-only, unreferenced GitData candidate, not a branch/PR publication or executable proof.

## Exact changed paths

- `apps/mobile/services/account-review-save-sms.ts`
- `apps/mobile/services/account-review-save-ownership.ts`
- `apps/mobile/services/account-review-local-snapshot-sms.ts`
- NEW `apps/mobile/__tests__/services/account-review-initial-prune.sqlite.integration.test.ts`
- NEW `specs/395-shared-account-review/validation/t049-initial-prune-ownership-repair.md`

No changes to foundation, Save plan/service, private schema, sibling capture helpers, registry, AddCore, pull, SQL, generated public types or UI.

## Actual contracts and implementation

**Single-batch plan:** `smsCleanupOperations(sms)` now requires one original clean queue, nonempty unique selected IDs, complete current owner-scoped `sms.allOwned` membership from the existing real writer, and an exact `sms.unsaved + sms.alreadySaved` partition. It rejects malformed/foreign/rebound/multi-namespace membership. Only when **every currently owned draft in that same original queue** is among selected cleanup entries does it append one `{kind:"markAsDeleted",model:queue}` alongside the already existing selected-draft deletions. If any unselected linked or unrelated draft remains, no queue operation is appended, preserving the live namespace and rebinds. The caller's existing `FinancialActionLinkedOperationPlan`, foundation, financial root, account/child/effect operations and selected SMS updates are unchanged.

**Narrow prepared ownership verifier:** `assertPreparedReviewOwnership(input,postimages)` admits `sms_review_queues` **only** through `verifyOriginalQueueTombstone`, never through generic `verifyDomainCreate`. This proves the source is SMS, physical queue ID equals `payload.sessionId`, queue's owner and prepared `user_id` equal `input.ownerId`, exactly one matching existing-plan queue operation is destructive `markAsDeleted`, postimage is a deletion tombstone, original header timestamps are real safe SQLite numbers and unchanged by prepare, every planned SMS-draft operation is a same-owner/same-queue destructive deletion, and no `rebind_remaining` bookkeeping exists. All original strict domain-create, child-parent, account/effect and prepared-membership guards remain unrelaxed.

**Private root capture:** `captureQueueHeader` reads the actual foundation `cachedPreimages` and `preparedPostimages`; it requires one original queue preimage and one exact destructive prepared queue postimage **iff** the owner-scoped current queue is fully consumed. It validates user/session/source, all selected/current physical draft membership, original header `created_at/updated_at/user_id` against the real cached model and prepared operation, preimage non-deleted vs postimage deleted, and the entire selected-draft destructive prepared membership. It writes `queuePreimage.disposition:"pruned_empty"` and hashes the **actual prepared queue tombstone** using the existing `hashAccountReviewLocalPostimage`. If any current draft remains, it requires no queue pre/post operation and captures `"present"` against the actual retained queue. The same existing optional private snapshot builder persists that strict nine-key JSON with the already-atomic financial root and domain/children/effects/draft/queue operations. Neither public payload nor an additional private carrier or field is introduced.

The actual foundation source already performs `assertPreparedOwnership`, computes the private snapshot after owner/postimage checks, reasserts the authenticated owner and unchanged prepared operations after awaited hashing, and commits `[root.operation,...linkedOperations]` in a single adapter batch. This wave did not alter that ordering or add post-commit assumptions that a purposely pruned queue still exists.

**Consent/dedup boundary:** normal selected financial Save retains original private SMS preimages as `available` for rejection recovery; it does not invoke the explicit-discard lifecycle writer or supersede its own newly committed root. An all-deduplicated Save still takes `commitCleanupOnlySms`, creates no financial/private root, and never enters `smsCleanupOperations`; this repair does not turn dedup into an artificial financial posting. Existing namespace acquisition invalidates `pruned_empty` on any later queue creation (even if that newer queue is cancelled), while normal completed-release on an already-pruned original queue does not supersede it.

## New focused physical SQLite test cases (NOT RUN)

| ID | Actual physical/plan assertion |
| --- | --- |
| P01 | Save a real selected SMS Bank batch; witness exactly one Watermelon adapter batch containing root, created domain/children/effects, all selected draft deletions and exactly one original queue tombstone. Clone real SQLite, validate `pruned_empty` private root with exact original header/hash, available draft preimages, zero active original queue/drafts and `local_complete` root. |
| P02 | Real shared SMS with unselected/rebound QNB and independent CIB drafts: selected Save leaves the original queue active, three unresolved drafts, `queuePreimage:present`; never prunes by merely counting selected rows. |
| P03 | Physically change original queue's `user_id` to a foreign user before Save; error with no financial root or partial data change. |
| P04 | Construct actual real Save linked plan; fault-inject a stale cached queue `updated_at` after prepared ownership but before the genuine private builder, proving refusal before adapter commit, full rollback of cached state and unchanged cloned SQLite. No SUT or preimage hash is stubbed. |
| P05 | Physically rebind one selected draft to a nonexistent queue ID; reject with no root/effects or changed physical data. |
| P06 | Remove the queue tombstone from an otherwise genuine real linked-plan fixture; unchanged existing foundation/ownership/snapshot guards reject rather than committing a root with fabricated `pruned_empty` proof. |

The existing **24 T044**, **12 durable recovery** and **two physical-negative cases**, as well as Storage T043/L01, remain unchanged. **No test was executed by this worker.** New cases are candidates subject to Root's grouped Jest/TypeScript/lint, SQLite clone/restart, independent reviewer, and source/API review. Real provider, emulator and hosted execution remain outside this grant.

## Residual ownership boundary requiring Root awareness

`apps/mobile/services/account-review-save-service.ts:commitCleanupOnlySms` still implements the distinct all-SMS-deduplicated action-free path. It directly performs `prepareDestroyPermanently` on its selected drafts and possibly queue without invoking `prepareAccountReviewPrivateLifecycle`. This worker **did not edit that file**. It creates no new action/private root as required, but an existing unresolved private root sharing a queue could require same-writer lifecycle disposition updates. The root should determine whether that case is already excluded by frozen Save/namespace admission or needs a **separate exclusive grant**. Do not silently broaden this ownership lease or assume a dedup-only deletion can supersede a financial Save's recoverable preimages. New namespace, explicit discard, expiry and owner-scoped retention source from the prior candidate are untouched.

## Honest handoff

**NOT RUN:** Jest, TypeScript, ESLint, formatter, local physical SQLite, pgTAP, emulator/native, hosted/provider/deployment or branch/PR checks. GitData created only owned blobs/tree/unreferenced commit. No test Green or review acceptance is claimed. Root retains formal acceptance, merged source integration, publication and final checks. **SOURCE RELEASED / STOP.**
