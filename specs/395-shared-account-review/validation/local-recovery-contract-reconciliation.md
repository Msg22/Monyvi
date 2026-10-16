# #395 device-local recovery — contract reconciliation, 2026-10-16

**Status:** Source-backed **technical documentation ONLY**, awaiting fresh
read-only Speckit analysis and applicable tests-first Red. Nothing in this
package implements or verifies the private root storage, migration,
generator, sync, recovery, Cloud SQL/RLS or new business behavior.

## Immutable authority and protected boundaries

- **Feature document parent:** `6453b4c1c8cb71b648ce282be500d14f45f166d9`.
- **Trusted general governance:** `c02a773613f9b6ebc5ca01aae02dd41863fd0e90`.
- **Reviewed Constitution VII 1.8.0 exception:**
  `dd16d5440556b651cb5b6395a00c1c4d37538dcf`.
  This is a deliberately separate policy PR, **not** merged into Main by
  this feature work; Root explicitly adopted it as the one governing
  exception for this technical reconciliation.
- **Previously proposed target:** `local-recovery.md` from
  `c5d6ce1184f84229c6554bb2eb878267261a7002`.
- **Immutable approvals:** `spec.md` approved sha256
  `e012f5a7d2edadc8bc1e2fa2ce03aeea56bc0c947dc02bfc2a3f166150e2c7d0`;
  B1 manifest sha256
  `cf447362f73c91f975f97ecf2295bce1ed8300213f701f6caab181ee997059a0`.
  Neither file, the 23 approved images/sidecars, or their approval receipts
  were edited. These are pinned reference hashes, **not locally recomputed
  digests** in this authoring lane.
- `tasks.md` retains **all 80 original task IDs in their existing order,
  with each checkbox unchanged**. No Speckit regeneration or task closure.

## Contract reconciliation — what changed and what did not

| Requirement/invariant | Closed documentation decision | Target |
| --- | --- | --- |
| US6 / FR-018 | Atomic selected financial Save includes local historical recovery evidence with its root, not later sampled app state | local-recovery, financial-save, wire-shapes, plan, business |
| FR-019 | Durable SMS choices, linked-group updates, Review later and rejected action restoration; never resurrect explicit discard or expiry | local-recovery, data-model, tasks T049/T051/T074 |
| FR-021 / Constitution VIII | Authenticated owner/queue/root/effect/children scope, raw-data privacy and exact postimage proof | local-recovery, wire-shapes, tasks T043/T044/T050/T053 |
| FR-020 (unchanged) | No extra review-time provider/usage; **not** the primary recovery acceptance criterion | local-recovery introduction |
| Constitution VII 1.8.0 | Strictly device-private Watermelon extension permitted by versioned local-only migration; remote server-owned SQL 090/091 remains independent | plan, data-model, local-recovery, financial-save |
| Existing public wire | Required `frozenIntentDigest` commits ORIGINAL selected intent incl. SMS dedup; `payloadHash` commits full canonical action. Neither is private snapshot/hash or raw payload storage | wire-shapes, local-recovery, financial-save |
| Local carrier | One nullable `financial_action_groups.local_recovery_snapshot_json`/non-generated `localRecoverySnapshotJson`, old roots null; **no Supabase type/field/dummy SQL** | all technical docs + narrow business technical table |
| Local version | Reserve next Watermelon migration **31** after max **30**; durable generator-owned override/non-generated model, committed generated output and repeated `db:sync-local` parity | local-recovery, plan, tasks T053 |
| Private snapshot | Strict `account-review-local-save/v1` nine-key schema, including ninth `queuePreimage`; Voice queue null, no transcript or durable Voice session | wire-shapes, local-recovery, data-model |
| SMS retention | `available` full proof vs `expired/superseded` metadata only; per-entry `parsedAt <= now - 30 days`, **equality expires**; preserve unexpired siblings | local-recovery, wire-shapes, data-model |
| Queue disposition | `present/pruned_empty/expired/superseded`; only proven atomic `pruned_empty` + no owned queue + exact guards can recreate header; discard/reset/new namespace invalidate | local-recovery, wire-shapes, financial-save, tasks T049 |
| Prepared hashes | Hash actual owned prepared create/delete/tombstone/rebind/default projections, excluding mutable sync transport fields; immutable action effects checked separately | local-recovery, wire-shapes, tasks T043/T048/T051 |
| Linked-plan builder | Optional typed **private** builder from immutable cached preimages/prepared postimages after ownership validation; root private value prepared in SAME adapter batch | financial-save, wire-shapes, tasks T048 |
| Dedicated pull/privacy | Verify owned action-root remap preserves validated private data; foreign/unmatched roots receive null; exclude local bytes from generic/dedicated remote serialization, outbox, outcomes, logs | local-recovery, wire-shapes, tasks T044/T050/T053 |
| Default predecessors | Actual distinct sorted `defaultDependencyActionIds`, no optimistic default resample; accept predecessors canonically before successor, reject/unsupported leaves pending recovery | local-recovery, wire-shapes, tasks T044/T050/T051 |

The earlier wrong `US6/FR-020/FR-021` introductory attribution
was corrected to **FR-018/FR-019**, with FR-021 privacy/ownership and
Constitution VIII separately acknowledged. The original approved
business behavior, existing public tuple, `creationDefaultSnapshot`
rules, Voice no-durable-review guarantee, and 090/091 server CAS
remain unchanged.

## Existing eight-task coverage — no new IDs/status claims

| Existing ID | Mandatory acceptance and remaining source seam |
| --- | --- |
| T043 | Tests-first closed private snapshot and per-row/child/default postimage validation; injected precommit rollback, cache snapshot, cloned restart and no Voice raw evidence |
| T044 | Tests-first private-field exclusion, failed sync/rejection/retry/dependency behavior, queue lifecycle and per-entry 30-day expiry |
| T048 | Build validated optional linked-plan private snapshot from actual prepared postimages and capture with local action root atomically |
| T049 | SMS cleanup/rebind plus queue `pruned_empty`, supersession, expiry, new-namespace invalidation and one-queue-owner preservation |
| T050 | Protect complete action/children from generic pushes; privacy mapping and true predecessor dispatch/acceptance ordering |
| T051 | Restart-safe once-only compensation using owned stored root, effects, children, default and SMS postimage hashes; newer edits fail closed |
| T053 | Local migration31, generator override/non-generated field, schema/public-type parity, real SQLite cloud pull/upsert preservation and explicit nonleak checks |
| T074 | Full Voice/SMS/legacy/expiry/restart/logout/failure and no-extra-usage regressions without claiming provider/device execution |

T043/T044 Red and independent review precede source activation, and all
required physical-database/hosted validations retain separate owners.
Do not silently close a task because a documentation contract is complete.

## Source evidence and remaining blockers (not invented APIs)

Read exact current parent `6453b4c1...` evidence:

- `packages/db/src/schema.ts` is schema version 30;
  `packages/db/src/migrations.ts` highest toVersion 30.
  `BaseFinancialActionGroup` and non-generated `FinancialActionGroup`
  have **no** localRecoverySnapshotJson field; private migration31 has
  **not** been created.
- `financial-action-foundation-contracts.ts` still declares
  `FinancialActionLinkedOperationPlan` with prepared creates,
  existing operations and ownership callbacks but **no** private
  snapshot builder; foundation `prepareLocalRoot` sets only existing
  root fields. T048 must introduce that typed callback **without**
  broadening old action contracts.
- Existing reconciliation contains legacy single-draft recovery evidence,
  not a full persistent multi-row review-batch private store. Existing
  `outcomeJson`/`payloadJson` are **not** a safe alternative.
- `scripts/transform-schema.js` derives server-backed schema/models
  from generated Supabase types and explicit local table overlays;
  `sql-to-watermelon-migration.js` derives local migration steps from
  server SQL. They do **not yet prove** preservation of a private
  field added to a server-generated table. T053 must add a durable,
  tested override/regen path; never hand-edit generated base/schema
  files or lose public columns/types.
- Root `package.json`: `db:sync-local` regenerates locally,
  while `db:migrate` calls `db:push` **first**. Hosted deployment
  remains blocked without separate authorization.
- T049 must atomically record queue dispositions on actual cleanup
  and invalidation paths, not guess from absent records.
  T050/T053 must prove real dedicated owned-root pull preserving private
  data without letting remote values overwrite it.
  T051 must validate postimages/default predecessor/effect and child
  membership before compensating, including unresolved mixed
  SMS lifecycles.

**No new material product decision is required** by these document
corrections. The implementation/recovery tests may reveal a technical
source conflict; record it in Speckit analysis or independent review
instead of silently loosening privacy, canonical action/RLS, CAS,
schema ownership or lifecycle guards.

## Next gate and execution honesty

Root should **extract only the eight authorized document blobs**;
run a **fresh read-only `speckit.analyze`** against the reconciled
package, then separately authorize the source owners for local
migration/generator, T048/T049/T050/T051 and independent database/
security/pull/privacy verification. Feature PR396 must not absorb
Constitution VII governance policy commits.

**NOT RUN:** Speckit commands/analysis, tests, formatting, type/lint,
SQL/migration, generator, pgTAP, actual SQLite pull, native/emulator,
provider, hosted deployment or PR operations in this authoring lane.
No source, SQL, generated file, frozen spec, B1, refs or business
runtime was changed.
