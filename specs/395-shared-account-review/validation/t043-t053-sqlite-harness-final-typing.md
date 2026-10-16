# #395 T043/T053 — scoped SQLite test typing and L09 RPC privacy repair

**Source parent (exact):** `a3406fe2020fe1ad318c20d09fbc506496a50a28`.  
**Scope:** TEST HYGIENE only. Two owned physical test files changed; shared harness and all production, generated, schema, migration, SQL, hook, panel and provider files remain unchanged. No test execution, formatting, migration or source-green claim in this wave.

## Root diagnostics addressed

1. **Derived envelope type / TS:** The recovery test's `createFailingPrivatePlan` now returns `NonNullable<SaveConstruction["envelope"]>` using the actual exported `SaveConstruction` from `account-review-save-plan.ts`. The service still invokes `constructReviewSave(frozen, dependencies, scope)` through its actual three-argument signature; no `ReturnType<typeof constructReviewSave()>` expression, ad-hoc DTO, `any`, or assertion cast propagates into the test.
2. **`Model["_raw"]` strict typing / TS:** The real adapter-batch witness obtains its optional private column through `Object.entries(rootOperation._raw)` and stores it as `unknown` before the string evidence assertion. The pull test constructs its public cloud row by enumerating the *real physical* `FinancialActionGroup._raw`, omitting local-only `local_recovery_snapshot_json` and Watermelon transport `_status`/`_changed`; the result is explicitly `Record<string, unknown>`. This preserves all original pull scenarios and the exact real-row provenance without unsupported generated `RawRecord` property references or unsafe casts.
3. **No-await lint:** The deliberately failing optional private-snapshot builder is a synchronous function returning `Promise.reject(new Error("intentional_private_builder_failure"))`. It still records the `"builder"` stage after the real `assertPreparedOwnership` callback, inspects actual immutable cached/prepared evidence and fails before commit.
4. **Missing L09 test actually authored:** The prior report promised RPC/privacy/classification L09 but the physical suite ended after L08. A new full L09 now Saves an actual canonical SMS Bank fixture into real SQLite, reads and validates the future private snapshot through the real root-bound parser, creates a **real `createFinancialActionFoundationRepository`** against the existing SQLite database and calls the **real `createFinancialActionSyncService`**. Only the outbound `invokeAccountFinancialActionRpc` callback is controlled to capture the exact argument and throw a transport failure. It asserts exactly `payloadHash` and `payloadJson` were sent, with neither private recovery JSON, individual raw SMS `payloadJson`, nor the local-only column name. It checks **actual** `DEDICATED_SYNC_TABLES` includes `financial_action_groups` and **actual** `SYNCABLE_TABLES` excludes it. After transport failure, the real reloaded SQLite root must be `sync_failed`, must retain the private bytes and must have no published outcome. No financial sync/foundation/Save implementation or pull module is mocked or replaced.

## Exact before and changed GitData blobs

| File | Before blob from parent | Changed blob |
| --- | --- | --- |
| `apps/mobile/__tests__/services/account-review-local-recovery.sqlite.integration.test.ts` | `59a46e15c9826b90ce42fe119fa0b43a5f86c25d` | `111fdae25b37bc86c97e5331a02c86feada360a5` |
| `apps/mobile/__tests__/services/account-review-local-pull.sqlite.integration.test.ts` | `469844d8d70cd577a8cd1897477f9ff240b26e0f` | `66b7111bae5ae94cf6e9329ef4c086bbedac3734` |
| This report `t043-t053-sqlite-harness-final-typing.md` | NEW | GitData blob in commit |

**Unchanged harness:** `apps/mobile/__tests__/services/account-review-local-recovery-test-harness.ts`, existing blob `8046311ef4aae5d938e8fbc2076c91ac6a5c0caf`. Hoisted Node SQLite mock registration remains in each test file unchanged, with the actual WatermelonDB adapter/model registry. No new database factory or helper was required.

## Physical case preservation / next Root gate

- All previous **11 parameter-expanded L01–L08** real SQLite migration, Save, same-adapter-batch, cache/rollback and clone scenarios remain; the new L09 is an **additional** RPC/privacy test, not a replacement.
- All **7 P01–P07** dedicated-pull scenarios remain. The deliberately missing future `../../services/sync/financial-action-root-pull` remains an honest **module-creation Red**. No module was fabricated, import suppressed, or case skipped.
- The private builder and durable root snapshot are not implemented in the pinned production source. L02–L07 and L09 will not prove private persistence until Root admits behavioral Red and separately grants production capture. The new L09 is meaningful but not claimed to have executed.
- Root-reported prior private-schema **40/40 PASS**, generator **20/20 PASS**, hook **37/37 PASS** remain historical Root evidence, not outcomes of this test-hygiene wave. Physical suite TypeScript/lint diagnostics are addressed in source but await Root verification.
- The optional non-null assertion cleanup in pure `review-local-recovery.ts` was not needed for this scoped test setup and was left untouched.

**NOT RUN by this worker:** Jest/Node, SQLite, strict TypeScript, lint, formatter, generator, SQL/pgTAP, CI, hosted Supabase, provider, emulator, native worker or device. No branch/ref moves, push, PR/comment edits, delegation, Codex handoff, or production mutations. Only changed-only unreferenced GitData artifacts were created.

**SOURCE RELEASED — OWNERSHIP FROZEN — STOP.**
