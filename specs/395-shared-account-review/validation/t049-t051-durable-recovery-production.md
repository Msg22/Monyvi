# #395 T049–T051 Durable recovery source candidate — NOT VERIFIED

**Read-only intake / candidate source:** 2026-10-16. Exact immutable common parent
`40c0775f5bb3b61af786677f13fc62d08323e66f` (tree
`4a6c9c13b01d367ef6b3fc40a5bc64e570eb16db`). Trusted governing commit
`503f5a1336ba23f6d270615ce1ba47b02116e4f0`. User-approved #395
contracts and full local 31/T048 capture context are present in that parent.
No new product/schema/cloud field, migration, tuple, public DTO, registry change,
route or UI artifact. **UNREFERENCED GitData commit only.**

## Source implementation (exclusive paths)

- `account-review-recovery-evidence.ts`: owner/action/public-envelope SHA
  binding, strict nine-key private snapshot, actual T048
  `hashAccountReviewLocalPostimage` for every physically created domain row,
  children, and default postimages; unique real action-effect membership;
  trusted rejection/absent-created-account evidence; existing canonical
  financial proof delegated to the existing
  `verifyCanonicalAccounts(bundle,hashProvider)`; queue/fingerprint/
  postimage/namespace collision refusal before mutation.
- `account-review-recovery-canonical.ts`: move the **existing** strict
  `parseCanonicalAccountsFromOutcomeJson` implementation out of production
  into a side-effect-free helper (production preserves its original re-export),
  avoiding a circular dependency with recovery.
- `account-review-recovery-commit.ts`: isolated
  `reconcileRejectedAccountReviewInSqlite({database,actionId,hashProvider})`.
  The real authenticated `Database.write` re-reads the owned root, validates
  all evidence first, captures cached models, prepares one adapter batch for
  losing domain soft-deletions, canonical surviving existing-account
  balances/revisions, immutable-effect deactivation, guarded historically
  identical SMS draft restoration, and the terminal root marker/private
  cleanup. Newer foreign/stale/colliding evidence refuses instead of partial
  compensation. Exact historical SMS numbers require canonical/safe
  physical conversion. An already reconciled owned root returns replay.
- `financial-action-reconciliation-service.ts`: export already-existing
  canonical-chain verifier, unchanged algorithm and legacy behavior.
- `financial-action-reconciliation-production.ts`: dispatch review roots to
  the new guarded writer, leave old tuples on the original production
  reconciler; fail closed on unimplemented Add default metadata
  compensation. Existing canonical decoder export remains compatible.
- `account-review-retention-lifecycle.ts`: strict owner-scoped private-root
  transitions; immutable seven-key expired/superseded per-draft metadata,
  `parsedAt <= cutoff`, same-batch `prepareOperations()` only **after**
  cached-model snapshots, queue supersession and proven pruning dispositions.
  No public/private leak. Installed into the existing
  `sms-review-draft-repository.ts`,
  `sms-review-namespace-repository.ts`, and
  `sms-review-namespace-draft-expiry.ts` serialized existing writers,
  including manual/bulk discard, newly created namespace, empty-queue prune,
  individual expiry and orphan private-root scans with no active drafts.
- `account-review-retention-terminal.ts`: accepted review root keeps
  immutable accounting identity; clears device-only private bytes only with
  a matching persisted canonical outcome and accepted status, in its own
  authenticated atomic root update. Malformed accepted evidence blocks cleanup.
- `account-review-default-predecessors.ts`: internal
  `assertReviewDefaultPredecessorsAccepted({root,database,hashProvider,loadOwnedRoot}): Promise<void>`.
  Review uses the actual captured sorted IDs, no sampled default; Add derives
  required creator IDs from the immutable owned financial action envelopes and
  account local/synced status, with no new Add private field, persisted DAG or
  ephemeral UI state. Missing creator, unsupported/pending/rejected/foreign
  ancestor, invalid hash and cycles refuse transport. Ancestors have to be
  verified canonical accepted; accepted roots need not retain private evidence.
- `financial-action-sync-service.ts`: immutable candidate hash check,
  predecessor check, state transition, second owned-root/owner/predecessor check
  before network RPC; transport failure retains retryable root. Optional
  production coordinator lookup is wired in `sync/push-service.ts`.
- `account-review-recovery-protected-push.ts` with
  `sync/account-protected-fields.ts`: strict closed review/new-Add envelope
  parse, physical create/child/effect/guard membership and owner/parent checks,
  rejection of orphan effects without root, protected generic-sync row IDs for
  account, BankDetails, SMS sender, transaction, transfer and effects, while
  preserving unchanged legacy collector routing. Only
  `{payloadHash,payloadJson}` flows through dedicated RPC.
- New `account-review-durable-recovery-guards.sqlite.integration.test.ts`:
  G01 deletes an actual created BankDetails row after committed Save/stale
  outcome and proves recovery refuses atomically, leaving action effects
  active; G02 changes an original active account default after Save, proving
  failure preserves its newer choice and exact physical state. Both use
  existing real SQLite foundation/Save/clone harness; no SUT mocks.

## Confirmed integration blocker — ROOT ACTION REQUIRED

**T049 initial same-batch queue prune is NOT COMPLETE and must not be
silently merged or claimed Green.** The actual frozen
`apps/mobile/services/account-review-save-ownership.ts` function
`assertPreparedReviewOwnership` routes every prepared table other than
`sms_review_draft_items` through `verifyDomainCreate`, thereby rejecting a
legitimate linked-plan `sms_review_queues` tombstone as an unknown domain
create. The source grant permits narrow edits to `account-review-save-sms.ts`
and `account-review-local-snapshot-sms.ts`, but **does not grant** this
ownership-verification file and Storage owns other Save/foundation/capture
files. A proposed queue tombstone without fixing that proof gate would break
all-selected SMS Save, so **NO such change is included**. Root must
coordinate/authorize a focused separate
`account-review-save-ownership.ts` verification change, and
the corresponding queue-preimage/postimage T048 capture checks, under one
exclusive owner before D01/D06 can be Green. Existing Save remains unchanged.
Never add another private carrier or mutate Storage's capture helpers.

## Other limits / independent acceptance gates

- **No checks or formatters run.** Root's earlier reported 24 existing
  T044 cases = 5 PASS/19 FAIL; earlier T043 real SQLite
  capture cases = 1 PASS/10 FAIL (one migration timeout), with private-logic
  40 PASS and generator 20 PASS. Those numbers are intake context, not this
  worker's executions. The new twelve T044 cases and two
  new physical negatives are **NOT RUN**. Source-only static inspection
  cannot establish TypeScript/Jest/real SQLite correctness.
- SMS tombstone physical find, destroy-then-identical-ID recreation in one
  adapter batch, and queue restoration for a future proven
  `pruned_empty` disposition require actual SQLite failure/rollback/restart
  checks. No fabricated expectedPostimageHash or mocked reconciliation used.
- Canonical-account server absence, effect chain and outcome values must be
  validated against the owner-approved 090/091 SQL/pgTAP registrations after
  SQL reviewer acceptance; no hosted RPC/schema deployment or semantic
  expansion. Incomplete/malformed SQL outcomes fail closed. The accepted
  cleanup path currently requires `accountRevisions` to be present;
  confirm exact server response shape before activation.
- AddCore still owns the new Add command/registry. No Add factory or
  `account-create-default` source was modified. Add predecessor resolution
  depends on its future approved registration and actual owner-root creator
  coverage. Add rejection compensation remains safely incomplete, NOT Green.
- Protected-push collector and generic-sync exclusions need grouped old/new
  tuple physical matrix and TypeScript lint; potential mixed-action dirty-row
  ordering/collisions must be reviewed. The existing financial/public tuple
  bytes/hash remain immutable; no direct profile/account generic push fallback.
- Cold restart tests must remount the real cloned adapter; no production
  database getter/debug seam was invented. No Voice transcript/audio or
  durable Voice review record is created, and device-only private bytes
  remain excluded from public envelopes, Supabase types, RPC and outbox.
- Independently review financial/account integrity, owner/children security,
  lossless local migration31/pull, server-compatible canonical outcomes, and
  real T044/T043/T048/T049-T051 Red-to-Green before publication. Physical
  risk cases still needed: foreign/missing effect row, duplicate fingerprint
  and queue collision races, terminal/private-outbox privacy, truncated
  historical evidence, same-writer incomplete-status transitions.

## Execution/ownership record

**NOT RUN / NOT AUTHORIZED:** local file writes, tests, TypeScript, lint,
formatter, SQL/pgTAP, native/emulator/device, hosted/provider, deployment,
ref/branch/push/PR metadata, delegation or Codex handoff. Every included source
path is inside the T049–T051 explicit ownership grant; approved Storage/root
pull/schema/foundation files, AddCore registry/writers, Panel SQL and UI forms
are unchanged. This is a **partial implementation candidate**, not a verified
or accepted release. SOURCE RELEASED / STOP; Root owns full review, blocker
resolution, checks and publication.
