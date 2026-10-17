# #395 First-release delivery scope — human-approved supersession

**Decision:** 2026-10-17. **Status:** scope decision only; implementation and
release acceptance remain unverified. **Authority:** Human narrows the first
release to already approved Voice/SMS shared-account review design and
functionality with _basic_ data safety and sync. The approved
[spec](../spec.md), B1 design bindings, product behavior, existing 80 task IDs
and recorded completion receipts are unchanged. This note governs first-release
**gating and prioritization** where older [plan](../plan.md),
[tasks](../tasks.md) and
[local recovery contract](../contracts/local-recovery.md) describe a broader
eventual implementation. It neither erases those historical technical designs
nor authorizes weakening existing protection.

## Required for the first release

- **Approved flow:** Preserve the existing Voice/SMS account-evidence,
  matching/default/currency/confirmation choices; shared group semantics; Edit
  and Add default-intent behavior; selected-only Save, SMS Review later/durable
  local choices and the approved B1 screens. No invented product behavior, extra
  parser calls, hosted migration or new public financial fields.
- **Owner and data boundaries:** Every local read/write and sync decision is
  scoped to the authenticated owner. Recheck ownership across asynchronous and
  serialized-writer boundaries; reject foreign, replaced, stale or ambiguous
  source/account identities. Voice audio/transcript and raw SMS/review/private
  recovery data must not leak into cloud financial payloads, generic sync, logs
  or diagnostics.
- **Atomic local Save and rollback:** Commit approved selected
  account/child/transaction/transfer/effect/SMS cleanup together, with real
  database constraints and current revision/default/selection checks. Failure
  before the durable commit leaves the complete physical database and cached
  choices retryable, without partial financial posting, unowned edits, orphaned
  drafts, duplicated effects or success navigation. Successful durable commit
  must not be misreported as rollback because of a later notification failure.
- **Idempotent retry and deduplication:** Preserve immutable action/intent
  identity; the same approved Save replays without a second posting. Reject
  reused IDs with changed content; deduplicate SMS against the owner's genuine
  existing transactions/transfers. Already-saved selected SMS entries receive
  only authenticated local cleanup, while actual new financial refs/effects
  correspond exactly to newly created records. All-dedup remains action-free.
- **Basic safe sync:** Preserve existing owner-scoped action/root and effect
  integrity, established SQL/RPC CAS, valid local-to-server action ordering, and
  privacy exclusions. Push/pull failures, missing or unsupported receipts,
  conflicting history, unknown membership and any unproven SDK ACK MUST fail
  closed; do not advance a checkpoint or mark a protected row/root as synced
  without proven authority. Preserve local rows, original dirty flags, pending
  actions, private evidence and retries. Never silently acknowledge, compensate,
  delete, remap or overwrite unresolved financial state.
- **Truthful recovery UX:** Surface an unresolved or rejected financial action
  as pending/error/recovery-needed with an appropriate safe retry or
  later-resolution route. Never display success or discard customer data just
  because advanced automatic repair is deferred. Preserve normal SMS retention
  rules without inventing missing evidence.

## Deferred from first-release _gates_, not silently deleted

The following are **future advanced recovery work**, not conditions to ship the
otherwise approved simple flow: terminal Add compensation carriers and
escaped-carrier completion witnesses; automatic financial-successor chain
reconstruction and compensating predecessors; elaborate rejected-Add/history
postimage replay, historical default reconstruction, and exhaustive once-only
restoration across complex rejected/reconciled lineages. Existing protective
evidence or conservative sync fences stay in place; this decision does not grant
production removal, schema, SQL or SDK weakening. Unknown outcomes remain
unresolved and dirty until a separately authorized, safe reconciliation occurs.

The historical
[T069 technical amendments](../contracts/local-recovery.md#t069-terminal-add-compensation-liveness--bounded-technical-amendment-2026-10-17),
validation reports and checklists remain **historical design/research**, not
first-release test acceptance. No task is checked by a deferral; Root may
separately rescope delivery gates without falsifying prior test outcomes.

### Held post-prune Review and private-retention boundary

The first release explicitly **defers automatic rejected-Review restoration
after its original SMS queue is fully pruned**, and **partial
30-day/private-evidence expiry after that same prune**. Those advanced cases
remain HELD with the exact protective error and unresolved/pending UX; an old
physical deleted draft may not lose its sole sealed private preimage. Preserve
the full owner-scoped physical ledger, account/effect state, dirty root, cached
rows, private proof and retryability. A refusal is never ACK, recovery,
successful redaction or permission for automatic deletion.

Ordinary next SMS Review namespace acquisition **is required**, even after the
previous queue was fully pruned. Its authenticated serialized writer changes
**only** the old Review's private `queuePreimage.disposition` from
`pruned_empty` to `superseded`, leaving every `available` SMS draft preimage,
sealed physical original/tombstone and financial effect intact. The new empty
queue may be cancelled and cold-reopened without resurrecting the old queue. If
the old Review is later rejected, `superseded` plus still-`available` original
drafts must fail closed **before** any compensation or private-proof removal;
the rejected root stays unresolved and dirty. No additional cleanup or
compensation protocol is authorized.

This does **not** defer normal selected Save, all-dedup atomic queue cleanup,
current-active-queue expiry/discard, ordinary rollback or positive recovery with
complete original evidence. Historical advanced D05/L4-RED assertions remain
preserved by reference in frozen composite commit
9ba2ca2fd5e445f788a05e2a6a884a6f560ec878; the active first-release
D05/post-prune rejected-recovery regressions prove HELD outcomes and no partial
mutation. D06 is an **ordinary positive acquire/cancel/reopen gate** with sealed
original/private/financial proof and explicit refusal of unsafe subsequent
rejected restoration. No new compensation protocol, public wire, schema,
spec/task ID or status claim follows from this prioritization.

## Test and artifact disposition

- Keep **all ordinary** Add/default, selected Save, atomic rollback, genuine
  owner/current-revision, dedup/retry, SMS durability, protected sync/pull and
  privacy suites in the active regression/acceptance plan. Failures in these
  baseline protections still block release. Do not replace their tests with
  mocks of financial writers.
- Remove only the unshipped, standalone experimental suite
  `apps/mobile/__tests__/services/account-default-intent-compensation-carrier.sqlite.integration.test.ts`
  from **active test discovery**. It exercises the deferred T069 carrier
  protocol rather than ordinary Add/Save. Preserve its exact authored,
  unreferenced artifact commit `682fa98eb44b8a6b88b9c2675c7debf0fe8fa7bb`
  (original file blob `895c8ca865c0f4858899f57fcc834e1baedd3b97`) for follow-up;
  do not declare its expected Red or a Green result.
- The current delivery is **not** certified by this document. Required ordinary
  test/SQL/SDK/device/RTL/accessibility/hosted checks remain whatever their
  separately verified state is; no run, pass, PR merge, deployment or device
  approval is claimed here.

## Resume advanced work only under new authorization

Later compensation/recovery may reuse the preserved published artifacts and
historical contracts, but must receive an explicit new scope, tests-first proof
and security/privacy review. At no point may deferral authorize a lossy cleanup,
fabricated ACK, or acceptance of a root with unknown owner/financial membership.
