# Quickstart: Issue #255 Sync Pagination and Checkpoint

The approved core was validated locally on 2026-10-07. The historical genuine
Red evidence remains unchanged.

## Environment and execution boundary

Use only the owned monyvi-issue255-repro backend on API 54341 / database 54342.
Docker SQL uses internal port 5432 after checking external 54342. Never target
shared 54321/54322 or remote services. Reuse the main checkout's dependency
junction; do not install dependencies.

The user-authorized final batch ran after implementation. Only checks affected
by reported fixture/type corrections were rerun. No commit hooks, commits or
remote writes were executed.

## Manual scenarios and automated coverage

| Scenario                                                                                                                                                                 | Automated evidence                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Initial 2,501 rows, unchanged second sync, full ID/value manifests, 1,001 parents and children                                                                           | apps/mobile/**tests**/services/sync-pull-cap.local.integration.test.ts; real local Supabase + Watermelon SDK/SQLite      |
| Empty, short, capped, exact-multiple/remainder pages; raw microseconds and UUID ties; invalid counts/cursors and later-page errors                                       | apps/mobile/**tests**/services/sync/issue255-paged-pull-contract.test.ts                                                 |
| Current-owner/shared categories, exact text, parent joins including soft-deleted parents and deleted children, snapshot retention, tied journal pages                    | apps/mobile/**tests**/services/sync/issue255-owner-snapshot-pull-contract.test.ts                                        |
| Failed ordinary page leaves baseline and checkpoint unchanged                                                                                                            | apps/mobile/**tests**/services/sync/issue255-sync-checkpoint.sqlite.integration.test.ts; real SDK/SQLite, network mocked |
| Failed later journal page leaves baseline and checkpoint unchanged                                                                                                       | Same real SDK/SQLite checkpoint file; journal paging also covered by owner/snapshot contracts                            |
| Good pull followed by failed push retains new checkpoint, applied rows and dirty deletion                                                                                | Same real SDK/SQLite checkpoint file; existing sync-push-service.test.ts retains separate push diagnostics               |
| Auth loss and user scoping                                                                                                                                               | Existing sync-auth-scope-lifecycle.test.ts and sync-multi-user.sqlite.integration.test.ts                                |
| Writer transaction blocks seal, post-seal publication, older M returned unchanged, ACL/auth refusal, real snapshot DELETE/rollback, owner-scoped tied journal pagination | scripts/testing/issue255-sync-reproduction/sql-fence-contract.test.js via node --test                                    |
| Financial guards, roles and unchanged business behavior                                                                                                                  | 101 existing financial SQL regression assertions across three suites; independent SQL/client review                      |

The snapshot SQL probe creates valid current-schema total_assets_usd fixtures.
Its tied journal timestamps are a separate controlled pagination fixture; real
DELETE/rollback assertions prove the producer path.

## Final local results

- 23/23 Jest suites, 176/176 tests across the initial batch and affected reruns:
  20 unchanged initial passing suites plus three affected passing suites (14
  tests). Do not describe this as one clean uninterrupted run.
- Original real-path cap/control/unchanged/parent-child cases passed.
- 101 financial SQL assertions and all three fence/journal probes passed.
- Owned migration chain replay, generated public Supabase types, mobile
  TypeScript, scoped TypeScript lint and formatting passed.
- Independent Gemini SQL/client review passed. Existing trigger bindings and
  static hook-body equivalence were verified.
- Database-package TypeScript has a pre-existing TS2416 at
  packages/db/src/models/base/base-market-rate-observation.ts:35, reproduced
  unchanged on the pinned base. It is excluded from this fix.

## Remaining manual boundaries

Device/emulator E2E, restart/device recovery, killed-app/HeadlessJS and visual
variants were not executed; no emulator was available. No remote delivery or
merge readiness is claimed. Historical repair, #367/#377 and #368/#376/#380
remain separate.

Additive migrations are 082–085. Do not rerun a Watermelon schema/model
generator: only public Supabase types changed. The original Red archive
run-1791353499634 remains the genuine failure evidence; no new genuine Red claim
is made for subsequently authored contracts.

The owned backend was stopped after validation (exit 0), with its backup
preserved.
