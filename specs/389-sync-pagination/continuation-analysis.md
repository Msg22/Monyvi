# Continuation consistency analysis — 2026-10-08

Read-only analysis completed before production integration against base
b2ec0fd4bc81cf2bf504f86d3bb781f605b355fc and the approved Normal-authored
continuation. No runtime test, lint or typecheck result is implied.

Prerequisite script exited 0 with SPECIFY_FEATURE=389-sync-pagination and
SPECIFY_FEATURE_DIRECTORY=specs/389-sync-pagination. It resolved the existing
feature and all required artifacts. Actual Git branch remains
codex/issue255-historical-recovery. Installed specify/plan/tasks/analyze skill
guidance was read from the configured main-worktree catalog. Existing feature
continuation preserved completed branch setup; optional commit hooks were
skipped under explicit instruction.

## Findings

No remaining critical/high contradiction in the approved four-part
implementation contract. No constitution conflict, unresolved product decision,
schema change or unmapped continuation requirement.

Resolved intake discrepancies:

- Reused the genuine 17-test baseline (nine behavioral failures/eight passes),
  with supplemental tests authored before production and a single final
  verification batch. No additional Red execution mandated or claimed.
- Independent review found pre-return inferred IDs could become dirty before
  apply. The installed SDK per-table replacement query now checks captured
  owner, the frozen (cutoff,H] window and synced status inside its writer. Only
  receipt-due snapshot repair uses it; explicit journal deletion and ordinary
  incremental merge behavior remain unchanged. Narrow local typing matches the
  installed Flow API omitted by its distributed TypeScript declaration.
- SQL 076 also freezes server created_at, but server RPC inserts omit it and
  local optimistic effect identity does not bind that timestamp. No
  optimistic/server timestamp parity rejection is introduced. Canonical
  monetary/owner/action identity follows the approved production correction.
- Semantic envelope equality uses existing parsing/canonical serialization and
  immutable hash; raw jsonb formatting differences are not collisions.
- At this pre-production analysis stage, historical PR381 results remained dated
  records and the new runner/supplemental tests were unexecuted. Final execution
  is recorded below; device/build-origin/cloud gaps remain blocked.

## Continuation coverage

| Requirement                                      | Implementation task | Authored coverage / final evidence task                                                |
| ------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------- |
| FR-013 historical hydration                      | T023                | Original H Red, H continuation, owned live runner; T024–T025                           |
| FR-014 receipt/retry/owner/withheld evidence     | T023                | H continuation receipt/snapshot cases plus E continuation; T024                        |
| FR-015 effect route/exact strings/time/no replay | T022                | Original E Red, shaping, owned live runner; T024–T025                                  |
| FR-016 unresolved canonical identity/real undo   | T022                | Six shaping cases, original real reconciliation/collision, E continuation; T024/T026   |
| FR-017 scoped one-time snapshot absence          | T023                | H boundary vector, production one-time path, final-page edit, apply failure; T024–T025 |
| FR-018 compatibility/evidence boundaries         | T027                | C12 manual/device/cloud BLOCKED; no code-only upgrade claim                            |

Metrics: 18 total functional requirements, 27 total tasks (T001–T019
historical). Six continuation requirements mapped to eight continuation tasks
T020–T027, coverage 100%. No unmapped continuation task. Critical/high/ambiguity
findings: 0.

## Authored test inventory

- Original H/E/K: 17-test recorded baseline preserved; H/E setup extracted into
  two minimal same-directory fixture modules without changing assertions.
- financial-pull-shaping.test.ts: seven new cases, including six canonical
  states, synced-state independence, semantic JSON equality/mismatch, effect
  identity, missing/resolved hydration and owner rejection.
- issue255-historical-recovery-continuation.sqlite.integration.test.ts: eleven
  new cases: success/reopen, push failure/reopen, per-owner completion,
  receipt-storage failure, actual SDK batch apply failure/reopen, snapshot
  bounds/tombstone vector, production one-time cleanup, final-page dirty edit,
  post-apply owner loss.
- issue367-effect-delivery-continuation.sqlite.integration.test.ts: one new case
  proving actual compensation before terminal state, receipt withheld and
  subsequent full pull with no second financial RPC.
- Four existing owner/auth/legacy unit fixtures receive exact-key
  pre-completed-repair metadata; original assertions remain. Unknown metadata
  keys do not return complete.
- Two owned live runner files were authored before implementation; their final
  execution passed. Retained immutable synthetic financial fixtures were
  explicitly approved.

All 19 supplemental tests were authored before implementation; final local
execution is now recorded in quickstart.md. T021 completion is authorship only.
No production code was changed during this analysis. T022–T023 integration was
released after this analysis. T024–T027 now have recorded local verification,
independent review and coverage-disposition handoff.

## Final batch scope

Installed mobile Jest with explicit affected paths: H, E, K, both continuation
suites, shaping; sync/atomic-pull-strategies,
sync/issue255-owner-snapshot-pull-contract, sync/issue255-paged-pull-contract,
sync/pull-market-rate-snapshots, sync/financial-action-generic-sync-exclusion;
service sync, sync-auth-scope-lifecycle, sync-owner-watermark-lifecycle,
sync-multi-user.sqlite.integration, sync-legacy-chain-abort, sync-config,
sync-pull-dispatcher, sync-transforms, sync-push-service,
sync-dedicated-rejection, sync-ownership-guards,
financial-action-sync-reconciliation,
metals-reconciliation-sync-rate.integration.

Use installed tsc with apps/mobile/tsconfig.json --noEmit (the actual mobile
typecheck target). Scoped installed ESLint with --rulesdir scripts/eslint-rules
and explicit changed TS paths; Prettier on explicit changed TS/JS/docs; Node
syntax on owned CJS/JS if repository lint ignores scripts; final whitespace
check. No root-wide Nx affected suite or unsafe db:sync-local. Database-package
TS2416 in untouched base-market-rate-observation.ts is a previously reproduced
exclusion, not an excuse for touched mobile errors.

Owned backend stage: guarded new live runner plus original real-cap companion on
current source. No migrations, model generation, reset, shared backend or cloud
operations. Run once after implementation/review; retain sequential stage logs
and rerun only affected failures after justified fixes. Actual lower configured
cap, full route concurrent movement, device/manual and deployment gaps remain
explicit.

## Post-integration evidence

Normal independent source reviews accepted the corrected Metals validation
context and SDK-writer snapshot adapter. Runtime evidence now shows 24/24
suites, 218/218 tests by combined initial/focused results; mobile types and
scoped lint PASS; owned live 2/2 and original cap 4/4 PASS. Independent G255-QA
accepted the bounded core and evidence after the Normal source-review passes.
Historical failures and fixture corrections remain retained; no new genuine Red
is claimed for supplemental cases. See quickstart.md for scenario-level
PASS/BLOCKED dispositions and all device, cloud, lower-cap and route-concurrency
limitations.
