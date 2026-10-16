# #395 T053 — L01 raw SQLite adapter clone repair

**Exclusive TEST-FIX lease:** exact parent `22d5ef411b25f6f73503b94f1b8126cdb5939be3` (tree `9cefaa57193493130b457bd1abca257084c4cc54`). Production, migration DDL, Watermelon schema, capture, pull, test harness, other suites and cloud unchanged. No checks executed by this worker.

## Root-proven failure, not migration failure

Root's ephemeral stage trace confirmed **old v30 adapter initialized; v30 seed and legacy root committed; upgraded v31 adapter initialized successfully**. L01 hangs only **after** upgrade when using the compat-wrapped `upgraded.adapter.testClone()` as the input to another `new Database({adapter: ...})`.

Installed primary Watermelon SDK contract at `@nozbe/watermelondb/adapters/compat.js:106–111` returns a new **`DatabaseAdapterCompat`** from `Database.adapter.testClone()`. Watermelon `Database` constructor wraps any supplied adapter again (`Database/index.js:47`). This creates a double compat wrapper. The outer callback-oriented `find(table,id,callback)` passes a callback to the inner compat wrapper, which accepts two arguments and returns a Promise instead; that callback is ignored and the outer promise never resolves. The error is test-fixture SDK misuse, not a v30→v31 DDL defect, SQLite shared-memory URI proof, or inadequate Jest timeout. The earlier SDK preload stall is not used as evidence.

## Exact bounded correction

| File | Before blob | Corrected blob |
| --- | --- | --- |
| `apps/mobile/__tests__/services/account-review-local-recovery.sqlite.integration.test.ts` | `111fdae25b37bc86c97e5331a02c86feada360a5` | `4567e02a450ceb6eefdd87d3528c1e22c9f90540` |
| `specs/395-shared-account-review/validation/t053-migration-harness-fix.md` | NEW | This report |

`upgradeLegacySqlite()` now returns typed `{ readonly database: Database; readonly rawAdapter: SQLiteAdapter }`. The upgraded Watermelon database is still constructed normally with the **real** `SQLiteAdapter({ schema, migrations, dbName })`, and all existing 30→31 migration/seed operations are unchanged. L01 destructures its database and **raw upgraded adapter**. It calls `rawAdapter.testClone()` and passes that new raw SQLiteAdapter into exactly one `new Database()` wrapper, matching the already passing `reopenSqliteLedger` helper pattern.

The old nullable legacy root, preserved payload/action hash, three persisted account rows, and fresh clone/restart assertions remain byte-identical. No assertion is removed, and no timeout increased. The 9 `it`/`it.each` declarations still expand to **11 total** physical L01–L09 scenarios. All P01–P07 pull and T048 capture production files are untouched.

## Root dependency gate and limits

Root should rerun the real L01 and grouped T048/T053 SQLite suites after importing this test-fixture-only commit, observe migration/restart results, and distinguish any new failure from the resolved double-adapter wrapper. Root's stage trace is the external evidence; this author has not executed the corrected suite and claims **no Green**.

**NOT RUN:** Jest, Node, SQLite/clone/migration execution, TypeScript, lint, formatter, generator, CI, SQL/pgTAP, provider, hosted writes, emulator/native/device, or delegation. No Git branch/ref, push, PR/comment changes or Codex handoff. Only unreferenced GitData objects created.

**SOURCE RELEASED — OWNERSHIP FROZEN — STOP.**
