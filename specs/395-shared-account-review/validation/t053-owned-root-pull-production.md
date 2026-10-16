# #395 T053 — authenticated dedicated financial root pull, source handoff

**Exact immutable source parent:** `9267eee9360067ede76bad9c280100f20fd63cfe`  
**Parent tree:** `271d86f0502d7cbfac21ff6ef38960329337446d`  
**Authority:** Constitution 1.8.0 at `503f5a1336ba23f6d270615ce1ba47b02116e4f0`, offline-financial-systems persona and `specs/395-shared-account-review/contracts/local-recovery.md`. T048 candidate `70a7913d` is included in the parent tree but **has not been Green/formally accepted**; this T053 artifact does not activate a feature route, deploy an RPC, or claim T048 acceptance.

## Exact changed-only GitData source blobs

| Path | Before at immutable parent | New blob |
| --- | --- | --- |
| `apps/mobile/services/sync/financial-action-root-pull.ts` | NEW | `ddc965f963bacb887f6481efdd3f8e0611d72e4d` |
| `apps/mobile/services/sync/financial-action-root-pull-identity.ts` | NEW | `ddcade1da5327f39a36bb7a2423b5c746d37dac3` |
| `apps/mobile/services/sync/pull-strategies.ts` | `c2120b47849b16ca86c9067aea5263dfea2dc180` | `4c1aed91df81e05969f71b185cfbd9cb7113fd3f` |
| `apps/mobile/__tests__/services/financial-action-root-pull-integration.test.ts` | NEW | `1fa37c2a9dc864b01c6c4f8f9caf0e9c3c0ec338` |
| This validation document | NEW | Commit tree |

## Approved API and two distinct write boundaries

`applyOwnedFinancialActionRootPull({ database, expectedOwnerId, changes: SyncTableChangeSet }): Promise<void>` is the approved **standalone** API. It asserts the current user, enters a single `database.write`, resolves the identical protected projection, prepares genuine `FinancialActionGroup` create/update/tombstone operations and commits them with `commitPreparedBatch` in the **same writer**. It snapshots original cached rows and restores precommit mutations on error. It does NOT call a writer inside another writer.

`prepareOwnedFinancialActionRootPull` is the **network/global-sync variant**: it performs validation, owner-scoped local lookup and a canonical pull projection only; it NEVER calls `database.write`, `database.batch`, `synchronize`, or a checkpoint mutation. The existing `pullMetalDedicatedTable("financial_action_groups", ... database)` now calls this projection **after the existing PostgREST exact-text / timestamp normalization** and before returning `SyncTableChangeSet`. The existing `atomic-pull-strategies.pullChanges` always includes financial root in `METAL_DEDICATED_PULL_TABLES`, passes the same Watermelon database and final owner fence, and returns the projected root changes with all other tables to the existing `syncDatabase -> synchronize` SDK's **one global remote-apply writer**. The legacy alternative `pull-strategies.pullChanges` shares the same dedicated table entry. No double writer, separate early root update, private network field, new server RPC or altered checkpoint/watermark is introduced. `SYNCABLE_TABLES` and `DEDICATED_SYNC_TABLES` remain unchanged; financial roots remain excluded from generic push/pull.

## Fail-closed projection

- **Authenticated transport:** Existing `.eq("user_id", userId)`, upper-watermark timestamp fence, ordered keyset pagination and `::text` JSONB aliases are preserved exactly. Projection independently checks the current owner before/after querying and rejects foreign server records or an authentication change.
- **Real immutable authority:** Every incoming root is checked against the real generated Watermelon public-column schema, with invalid/missing type, unexpected public field, malformed closed envelope, unsupported action/version, inconsistent `user_id/action_id/domain/kind/domain_reference_id/account_guards_json`, invalid state/outcome evidence and bad SHA-256 refused. It reserializes the canonical action envelope after decoding Postgres JSONB::text, then verifies its SHA-256 using the existing Expo Crypto SHA-256 API. Canonical JSONB outcome text is independently normalized and validated so harmless Postgres whitespace/order does not invent conflicts. Only the one special **device-local private column** is ignored from the server; never trusted.
- **Action-ID remapping:** Lookup uses `expectedOwnerId + actionId` and **separately** checks all physical local IDs (including foreign ID collisions) before choosing an existing ID. On a matching local action, exact owner, actionID, domain, kind, domain reference, canonical payload bytes, hash and account-guard bytes must all match; otherwise the whole pull is rejected before any update. Duplicate remote ID/action or duplicate local root is refused. A brand-new cloud action always receives a `null` private field and never inherits a previous owner's/action's evidence.
- **Private bytes:** A matched unresolved local review root may preserve its existing private JSON only after the **actual nine-key root-bound private parser** validates owner, action, source, session and queue binding against the existing canonical public envelope. Malformed or incorrectly attached private content refuses update. Remote-injected `local_recovery_snapshot_json` is discarded even when nonempty. A canonical accepted terminal action atomically clears the local private column in the same root update; rejected/unsupported/incomplete/pending states retain it. Local accepted/reconciled terminal states refuse rollback to nonterminal remote states. Unresolved private roots refuse tombstone deletion.
- **Safety of batches:** Standalone updates use real prepared Watermelon models with one `commitPreparedBatch` and the original cache rollback snapshot; multi-record malformed/foreign input is rejected by the pure preflight before local updates are prepared. For the production network coordinator the SDK, **not** our new helper, applies projected rows in its single all-table writer. Existing migration and other-table atomicity is untouched.

## Existing and new evidence map

The seven original real SQLite P01–P07 tests at `apps/mobile/__tests__/services/account-review-local-pull.sqlite.integration.test.ts` remain **byte-for-byte untouched**: exact matching private preservation/ID remap, injected remote-private refusal, accepted terminal clear, foreign owner, reused action/hash mismatch, unrelated canonical cloud root with `null`, and no changes on malformed input. The existing T048 physical capture suite has **11 scenarios**, not 12, and is a separate Red/Green dependency.

New `financial-action-root-pull-integration.test.ts` authors three tests, using the SAME proven hoisted actual Node SQLite adapter/model registry; no Save/foundation/root pull SUT mock or fake in-memory root. Network transport alone is injected through the actual Supabase `from(...).select(...).eq(...).lte(...).order(...).limit(...)` chain:

- **R01:** real request targets only owned financial root using exact-text aliases; returned changes map cloud physical ID onto the current valid local root and preserve its private evidence without an early write.
- **R02:** actual `synchronize()` SDK with that protected dedicated-root change physically retains authenticated private evidence after the SDK's remote apply.
- **R03:** actual `synchronize()` SDK with canonical accepted outcome physically clears the device-only carrier while accepting the server root state.

The integrated tests use a test-supplied `pullChanges` result containing the **real `pullMetalDedicatedTable` network output**, so they exercise the actual dedicated transport, projection and real SDK apply; they do **not** assert the entire market-rate/snapshot/global-push multi-table workflow executed. The source-level global coordinator connection is explicit at `atomic-pull-strategies.ts`, unchanged. All ten dedicated-root scenarios are **authored, not executed**.

## L01 v30→v31 independently unresolved

Root's separately isolated v30→v31 real SQLite upgrade case L01 still exceeded even a 30-second CLI allowance. The actual harness uses two `SQLiteAdapter` instances with the same `file:...mode=memory&cache=shared` URI: it initializes/seeds the v30 adapter, keeps that Database live, then creates and awaits the v31 adapter before cloning. The Node adapter recognizes memory URIs and may cache shared-memory connections; **a live earlier connection by itself has NOT been proven the cause**. Static analysis cannot distinguish stalling at old adapter initialization, seed/commit, new adapter initialization/migration, clone, or fixture cleanup without stage-bound actual execution. No production migration defect, 5-second Jest budget issue, connection deadlock or old-connection cause is claimed as established. The source grant permitted optional stage-bound L01 instrumentation, but no credible minimal causal fix or timing-sensitive instrumentation was made in this wave; Root should request bounded stage evidence in an independent test-fixture lease. No timeout increase, fabricated SQL migration, reset, package installation, or mock DDL was used. This timeout is not evidence that T048 private capture failed.

## Verification / remaining work

No captured private evidence or full rejection compensation is declared Green until Root batches this T053 slice with T048 and the existing Save/foundation regressions. Owner-scoped post-restart recovery, physical default/preimage verification, per-draft retention/supersession, numeric conversion and predecessor sync ordering remain separately owned. A deliberately absent callback/invalid T048 snapshot may keep upstream tests Red even if the pull source is correct. Because the root is a locally dirty synced model, only **R02/R03 real SDK behavior** can establish that the projected private update is not overridden by SDK conflict-resolution; source reasoning alone is not a Green claim.

**NOT RUN:** new or existing Jest tests, SQLite, TypeScript, lint, Prettier, generator, migrations, SQL, pgTAP, full sync, CI, provider, hosted, emulator, native or device. No source outside this explicitly granted pull module/strategy/integration/report was changed. No Git refs/push/PR/comments, hosted mutation, delegation or Codex handoff. GitData objects are unreferenced and Root owns import plus consolidated proof.

**T053 SOURCE RELEASED — OWNERSHIP FROZEN — STOP.**
