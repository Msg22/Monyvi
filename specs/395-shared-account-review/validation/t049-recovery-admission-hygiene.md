# #395 T049 — Recovery Admission Integration Hygiene

**Status:** Candidate source and harness correction **AUTHORED, NOT RUN**. Exact immutable parent: `9093c3d9b6895416dca8989c4fa79238a04a2550` (tree `0f569bd841be697c1a76cd7d15d57d61a91f9a02`), containing approved 134 + Root's private root setter correction. Governing Constitution/integration-maintainer persona and skill at `503f5a1336ba23f6d270615ce1ba47b02116e4f0`, six frozen #395 contracts and current candidate authority. Only the files listed below belong to this maintenance lease. No activation, source admission/Green, changed business semantics or new proof is claimed.

## Changed-only source inventory

| Path under `apps/mobile/` | Original blob SHA | Correction |
| --- | --- | --- |
| `services/account-review-recovery-canonical.ts` | `90e316ca1c3031badb9006511ee4fd874951121c` | Consolidate duplicate import of canonical type names and error constant. No decoder behavior change. |
| `services/account-review-recovery-commit.ts` | `af17b9405301d58001ae9c963d93669f7a21da52` | Remove redundant async/await from synchronous prepared queue/draft restore; keep timestamp assignments exact through `Object.assign(row._raw, {created_at})` and `{deleted:true, updated_at}`. |
| `services/account-review-recovery-evidence.ts` | `42808148ff68910ec6f1b93a45bb136e108cd6d9` | Replace direct untyped physical `_raw.deleted/account_id/user_id` reads with **existing strict** `physicalBoolean`/`physicalText` readers, preserving owner, lifecycle and postimage proof. |
| `services/account-review-recovery-protected-push.ts` | `c66a65bb5a03ac5ba770d112cd2f88e376f50958` | Correct immutable readonly array typing style only. No collector/dirty-member change. |
| `services/account-review-default-predecessors.ts` | `bae31946cef06c3b5f1a3794bdb88a88e4c909bc` | Narrow legacy/new canonical root mutation-record fields through `unknown`/strict `isRecord` before observing created account IDs. No `any`, casts or copied business unions; the established registry still validates envelopes. |
| `services/financial-action-reconciliation-production.ts` | `23cc0cbc8d2191edeadbd9cce28759076ece2884` | Remove unused `CanonicalAccountSnapshot` import. |
| `services/account-review-save-plan.ts` | `0212859624a86401df9bcc381454a66714886ac2` | Convert `ReviewPrivatePlanContext` object type alias to identical interface, without touching construction. |
| `services/financial-action-foundation-repository.ts` | `4f9b4db8f1f8c3d26f4105b605bb7b2939eeb802` | Mechanical cohesive physical/private capture helper extraction: **993 → 852 lines**. Retain Root's prepareCreate/prepareUpdate private root setter and all original awaiting/revalidation/commit sequence. |
| `services/financial-action-local-recovery-capture.ts` | **Absent** | New private module containing the moved existing `captureLocalRecoverySnapshotJson`, prepared/existing operation expectations and immutable pre/postimage functions/types; no public DTO, state field, or new financial logic. |

**Source/identity invariants:** The original nine private recovery keys remain unchanged, including `queuePreimage` and `defaultDependencyActionIds`. `Root` still verifies action/owner/session/source and canonical postimages inside the writer; private snapshot data remains device-local, not part of the cloud financial payload/hash. Root's source setter under `prepareNewRoot` and `prepareLocalRoot` remains exactly preserved. `captureLocalRecoverySnapshotJson` still binds the original canonical action and selected Review session, awaits the original builder and validates the closed private snapshot before preparing the root; no IO or writer invocation was moved across that barrier. The unchanged repository still compares immutable cached-preimages, authenticates after each await, prepares domain/effect/SMS operations, and rolls back cached prepared state when the adapter batch fails. It now delegates the **same capture functions** to the new private helper.

### Physical raw boundary

The generated Watermelon `Model["_raw"]` type exposes core metadata but not physical schema columns as named typed properties. The existing `account-review-local-snapshot-postimages.ts` already exports strict `physicalRawField`, `physicalText` and `physicalBoolean` readers, which validate existence/type instead of silently treating missing fields as valid. Evidence reads now use these exact helpers for account/child owner and deletion checks. Compensation **writes** retain real schema-defined `created_at`, `updated_at`, `deleted` columns on the prepared raw model through `Object.assign`, after the unchanged canonical timestamp/date checks. They do not invent preimages, widen financial ownership, change effect membership, or bypass the adapter's writer. No new `any`/type assertions are introduced.

## Changed-only test/harness inventory

| Path under `apps/mobile/__tests__/services/` | Original SHA | Correction |
| --- | --- | --- |
| `account-review-durable-recovery-test-helpers.ts` | `c499432e39720a66db7adea966edadd2ccfd5208` | Strict actual deleted field via existing `physicalBoolean`; historical Save/root fixture semantics unchanged. |
| `account-review-durable-recovery-guards.sqlite.integration.test.ts` | `9373ac4e9702af1fa70bb73075aaa0da5365d563` | Jest-hoist-safe `OWNER` resolution via typed `jest.requireActual` inside actual Supabase test factory. Existing 2 physical negative cases and real SQLite ledger preserved. |
| `account-review-initial-prune.sqlite.integration.test.ts` | `9ffb2262ee6ececf3eb9efd85464f3fe9d30f258` | Same Jest-hoist fix; the P04 after-validated-plan **cached actual queue** timestamp tamper now uses strict `physicalRawField("updated_at")` + number safety and `Object.assign` with same +1000ms value. All **six** physical prune cases/assertions preserved. |
| `account-review-sync.test.ts` | `f2ef3908fbed8d65d66dbde71c21c9d0daae18ca` | Unit suite's newly transitive static `@monyvi/db` import now resolves through the **actual** SQLite adapter, current DB schema, and genuine T043 model class registry, using the established dispatcher Jest test pattern. No production SUT, reconciler, response receipt or business command is mocked; all original **24** cases/assertions remain. |
| `account-review-sync-test-fixtures.ts` | `21072475a0f7288f1566d16dbe214c61d7fd2286` | **Intentionally unchanged**; already canonical hashed envelopes and generated change types. |

The existing **12 durable SQLite recovery tests** in the separate frozen source remain untouched and must be included by Root in the grouped admission. The user-owned 2 guards, 6 prune and 24 sync cases retain their actual mutation/restart/ownership semantics, with the scopes above only removing setup and typing blockers. The test harness still imports genuine produced Save/foundation services and models. There is no fake `@monyvi/db` result shape that fabricates financial behavior: it constructs real Watermelon models using the current schema and real SQLite adapter.

## Proof limits and independently held failures

**NOT RUN** in this worker: Jest, SQLite, TypeScript, ESLint, formatter, generators, SQL, sync push/pull, native/emulator, provider, hosted services or any checks. All files are candidate source and fixture repairs, **not a Green result**. Root's next grouped gate needs actual suite execution, source-only static checks, independent review and ownership collision reconciliation.

Other lanes have exclusive `services/sync/financial-action-root-pull-identity.ts` and `services/account-review-local-snapshot-defaults.ts` patches; neither was read as new-authorized work nor modified. The physical Root-pull identity and Save route tests are likewise outside this lease.

The separate T043 older SMS positive cases now report `invalid_owned_original_queue_tombstone` / `local_sms_queue_session_or_ownership_changed` under the latest Root setter and queue ownership constraints. **Those failures are documented as pending Root proof**; this correction neither weakens their production ownership guards nor edits existing older assertions. No queue business ownership, Save behavior, financial accounting, replay, once-only compensation, public DTO, or sync semantics changed here.

**Integration authority:** Integration-maintainer verifies a shared capture source only; it cannot independently accept unexecuted behavioral Red/Green or approve financial feature activation. Root runs consolidated checks and merges only after all disjoint lanes are reviewed. No refs, branches, pushes, PR, hosted operations, provider, native work or Codex/delegation were performed. **SOURCE RELEASED — STOP.**
