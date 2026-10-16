# #395 T043/T053 — real SQLite Jest mock-registration repair

**Scope:** TEST-HYGIENE ONLY. The source of truth is immutable parent `f7c27fcaf51ff56dc5229f42f2222464ea3e1048`. The owner has explicitly prohibited production, generator, schema, migration, hosted, native, or test execution changes in this wave.

## Root-observed issue, not a product Red

Root's grouped admission before this repair:
- Private schema **40/40 PASS**; generator **20/20 PASS**; hook **37/37 PASS**.
- Both newly authored physical suites failed **before executing any assertions** while loading `NativeModules.WMDatabaseBridge`.
- Root identified a **Jest setup/import-order defect**: the test files imported financial-action foundation and Save services before the child harness's `jest.mock("@monyvi/db")` registered its replacement. This allowed `@monyvi/db`'s native singleton to load instead of the real **Node SQLiteAdapter** fixture. This is not missing runtime installation, proof of a product bug, nor Green/Red of physical behavior.

## Exact changed-only source

| Exclusively owned file | Before blob at parent | New blob |
| --- | --- | --- |
| `apps/mobile/__tests__/services/account-review-local-recovery-test-harness.ts` | `0bd89c57a096612dfdbfc654d1d51c29aec6379d` | `8046311ef4aae5d938e8fbc2076c91ac6a5c0caf` |
| `apps/mobile/__tests__/services/account-review-local-recovery.sqlite.integration.test.ts` | `63e2c0214f8dd3a58d8b8be3096a2e329f947fb9` | `59a46e15c9826b90ce42fe119fa0b43a5f86c25d` |
| `apps/mobile/__tests__/services/account-review-local-pull.sqlite.integration.test.ts` | `392a5a916d3c59f9f2c12d3e278d4676a9d78512` | `469844d8d70cd577a8cd1897477f9ff240b26e0f` |
| `specs/395-shared-account-review/validation/t043-t053-sqlite-harness-repair.md` | NEW | Commit tree |

Each **test file** now uses the known-working per-suite hoisted `jest.mock` registration pattern from `account-review-save-service.sqlite.integration.test.ts`, ensuring registration before Jest evaluates static imports of the actual Save, foundation, and other services. It redirects only Watermelon's native dispatcher to the actual Node SQLite dispatcher; constructs the actual `SQLiteAdapter({ schema })`, `Database`, and real `LEDGER_MODEL_CLASSES`; and provides only the current-user Supabase test transport boundary. No fake database, stubbed `NativeModules`, mock Save/foundation/pull SUT, package installation, or invented module is used.

The shared test harness now **consumes** the already-registered `@monyvi/db` test database through `jest.requireMock<ActualTestDb>`. Its previously too-late `jest.mock` declarations were removed. The two suite-local mock factories intentionally duplicate the proven minimal registration shape: moving them to the imported helper would lose Jest file-scope hoisting and reproduce the exact defect.

The existing **11 T043/T053 physical Save/migration/clone/rollback scenarios** and **7 dedicated-pull scenarios**, including their bodies, tests, real SQLite assertions and missing-production expectations, remain untouched. The separate **40/40** pure private-schema suite, existing Save106, T04424, and all other suites remain untouched.

## Next Root dependency admission

1. First confirm both files **load with Node SQLite**, rather than `NativeModules.WMDatabaseBridge`. Only then classify actual failures.
2. Capture tests should now reach **behavioral Red** for absent optional `FinancialActionLinkedOperationPlan` snapshot builder and atomic private root capture. Existing passing scenarios do not imply private persistence.
3. Pull tests should progress to the intentional **future dedicated-root-pull-module creation Red**. The expected import `../../services/sync/financial-action-root-pull` is deliberately absent; no module was manufactured and no assertion about real pull/upsert has executed.
4. Keep root-owned consolidated TypeScript/lint and future physical pull/capture source-grant checks separate. No author Green or device/hosted evidence is claimed.

**NOT RUN by this worker:** Jest, SQLite, tests, TypeScript, ESLint, formatter, generator, SQL, pgTAP, CI, provider, emulator, hosted Supabase, native workers or any deployment. No ref/branch/PR/push/comment mutation, delegation, or Codex handoff. Only unreferenced GitData blob/tree/commit authoring.

**TEST-HYGIENE SOURCE RELEASED — STOP.**
