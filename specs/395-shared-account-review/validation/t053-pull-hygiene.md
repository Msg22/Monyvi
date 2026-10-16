# #395 T053 — Dedicated owned-root pull hygiene

**Authoring scope:** exclusive narrow hygiene lease; immutable parent `579b1b32373eea64edc59f0a1235b93a325ed96d`, parent tree `1f194640a9c4c0b1086f90ffbd3b2319635c6dfb`. No feature activation, runtime service change, DB operation, or checks performed.

## Exact changed-only GitData inventory

| Path | Parent blob | New blob |
| --- | --- | --- |
| `apps/mobile/services/sync/financial-action-root-pull.ts` | `ddc965f963bacb887f6481efdd3f8e0611d72e4d` | `0ee9f111e3b69795e0bc593ef8d56356df4e68c2` |
| `apps/mobile/services/sync/financial-action-root-pull-identity.ts` | `c2d75767712f94dbfca223a697b615663b540e5d` | `89e00b5e4c84db86fd69abb17404adf9a6d35810` |
| `apps/mobile/__tests__/services/financial-action-root-pull-integration.test.ts` | `1fa37c2a9dc864b01c6c4f8f9caf0e9c3c0ec338` | `0e38450bfd86e58938ac19c130dd1e98b7f9b6fa` |
| `specs/395-shared-account-review/validation/t053-pull-hygiene.md` | NEW | This report |

## Repairs, without changing pull contract

1. **Jest Babel mock factory:** the actual transport spy in `jest.mock("@/services/supabase")` was named `capturedFrom`. Babel-Jest hoisting rejects references to this free variable before tests initialize. Renamed the declaration and every call to `mockCapturedFrom`, the recognized mock-prefixed closure pattern already used for `mockRpc` and `mockCurrentActor`. No transport fake replaces `pullMetalDedicatedTable`, `atomic-pull-strategies.pullChanges`, `prepareOwnedFinancialActionRootPull`, or Watermelon's `synchronize()`.
2. **Authoritative optional sync table typing:** `AppSyncDatabaseChangeSet` is imported solely as an existing type from `services/sync/types.ts`; the guarded `SyncPullResult.changes` is assigned to it. `financial_action_groups` and `metal_holding_states` are read through their declared optional mapped properties, followed by the existing missing-root guard or nullish fallback. No invented runtime field, public generated type change, unsafe `any`/assertion cast, or copied table-name union.
3. **Unused fixture import:** removed the module-level `database` import from `account-review-local-recovery-test-harness`; each case still uses the real freshly cloned owned WatermelonDB `fresh` database. The database assembled *inside* the proven Jest mock factory remains and is used.
4. **Explicit, bounded changed-set return:** removed the unsafe object spread `{ ...result, deleted }` from the public `prepareOwnedFinancialActionRootPull` projection. Return now enumerates `created: []`, the existing validated `result.updated`, and locally validated `deleted` IDs. `projectIncomingRoots` already always creates an empty `created` set; this is the same `SyncTableChangeSet` shape with no ability to inherit arbitrary extra keys. Owner/action/canonical identity/terminal-private behavior and standalone writer remain untouched.
5. **Array-style lint only:** readonly array annotations in the root-pull module and its identity file now use `ReadonlyArray<T>`. No serializer, hash, state, schema, or filtering behavior changes. The Pro implicit-ID correction is explicitly preserved: `validatePublicProjection` still allows `"id"` in addition to actual schema columns.

## Actual integration evidence authored, not executed

The exact parent holds **R01–R03** from the initial T053 integration. The four additional previously authored R04–R07 cases were present in earlier unreferenced GitData blob `e3a39008eeb5fe09e87abf03a793be2c5e32e37d` but **not in the immutable parent**. This scoped hygiene artifact includes all seven cases, preserving the original three assertions and the four prior coordinator scenarios, correcting only Jest hoisting, optional type access and unused imports.

- R01: owned nonempty financial root PostgREST query/ID remapping/private preservation, before any write
- R02: real Watermelon `synchronize()` retains validated private recovery bytes
- R03: real SDK accepted-terminal root clears private evidence atomically
- R04: actual `atomic-pull-strategies.pullChanges(null, owner, freshDb)` passes a real SQLite database through the dedicated financial root fetch, retains owner/action/local-ID private evidence, and keeps legacy metal empty changes
- R05: authenticated owner switch during the real network pull aborts without mutating root
- R06: unsupported/incomplete reconciliation preserves original local private evidence, never the forged remote copy
- R07: unrelated dedicated metal-holding pull remains functional without a database argument

The seven P01–P07 real standalone SQLite scenarios, existing Save/foundation, T048 capture, root pull callers, root IDs, and sync classification are **not edited**. Both already-correct database-argument paths in `sync.ts → atomic-pull-strategies.pullChanges → pullMetalDedicatedTable` and alternative `pull-strategies.pullChanges` are preserved. No new debug API or private cloud field.

## Root verification and limits

This is source-based hygiene, **not a Green claim**. Root must rerun Babel/Jest loading, seven integration scenarios, strict TypeScript/lint/format, real SQLite P01–P07, and consolidated T048/T053 Save/sync gates. The source edits do not prove provider runtime, physical sync, terminal recovery or whole-network behavior until executed. No test was skipped or transformed into a fake success.

**NOT RUN:** Jest, SQLite, TypeScript, ESLint, formatter, generator, SQL/pgTAP, CI, provider, hosted Supabase, emulator, native/device, or any deployment. No ref/branch/push/PR/comment mutation, delegation or Codex handoff. Only unreferenced GitData blobs/tree/commit authored.

**T053 SOURCE RELEASED — OWNERSHIP FROZEN — STOP.**
