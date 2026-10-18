# Tasks: Fix Issue #255 Sync Pagination and Checkpoint

**Input**: Design documents from `specs/389-sync-pagination/` **Prerequisites**:
plan.md, spec.md, research.md, data-model.md, contracts/sync-pull.md,
quickstart.md

**Tests**: T001–T019 and their T018-only execution exception describe the
historical PR381 core. For the continuation, reuse the executed b2 Red, author
supplemental behavior tests before production, then run Mohamed’s single final
batch. No additional per-file Red runs or response-only execution claims.

**Organization**: Historical US1–US3 and continuation US4–US6. No MVP-only
closure of the approved continuation. Lead retains orchestration.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Genuinely parallelizable (different files, no dependencies)
- **[Story]**: US1–US6 for story phases only

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm approved inputs before any implementation

- [x] T001 Verify spec/plan/contracts/research/data-model/quickstart/ checklists
      consistency inside `specs/389-sync-pagination/`; record deltas as doc-only
      edits (no code) — DONE wave A (F1–F9 applied)
- [x] T002 [P] Confirm pinned base `2095ec061d531854603e8415122231f1cbf4c1a0`,
      branch `codex/issue255-sync-pagination`, active
      `specs/389-sync-pagination`, owned backend identity (meta check;
      independent of T001) — DONE wave A

---

## Phase 2: Foundational — SQL fence/journal/seal (BLOCKING)

**Purpose**: Server barrier + hooks that ALL stories depend on

**⚠️ CRITICAL**: No story work begins until this phase is complete

- [x] T003 Author SQL concurrency probes in
      `scripts/testing/issue255-sync-reproduction/sql-fence-contract.test.js`
      (docker/psql child sessions: fence-holds-through-commit with Lock proof,
      post-seal stamp after S, older-M unchanged, journal page-RPC, auth/ACL
      scoping; transactional producer DELETE durability stays in focused SQL
      tests). Executed in the final batch; the earlier real-path Red is reused,
      with no new genuine Red claim. Authoring may start once contracts are
      approved (production edges below still govern implementation order)
- [x] T004 Implement `supabase/migrations/082_sync_writer_fence_foundation.sql`
      (barrier table, fence + write-time helpers, RLS/revokes, fixed
      `search_path`); FIRST confirm the direct private-access GRANT
      classification (resolved: existing entry ACLs retained; only new private
      helpers revoked) (depends on T003)
- [x] T005 Implement four copied hooks with early fence `PERFORM`s (split `083+`
      only if size requires) in `supabase/migrations/`; verify existing trigger
      names/order/guards per contracts §9 before any rename (depends on T004)
- [x] T006 Final bindings/seal/journal migration LAST in `supabase/migrations/`
      (seal RPC, journal table + index + RLS, journal page RPC, explicit trigger
      rebindings per contracts §9) (depends on T005)

**Checkpoint**: Foundation authored — structural checkpoint only (no runtime
validation until T018); old migrations untouched; WatermelonDB schema unchanged

---

## Phase 3: User Story 1 — Large history syncs completely (P1) 🎯 MVP

**Goal**: Count-aware pager + fence/seal wiring pulls any collection to EOF

**Independent Test**: Existing Red journeys 1–2 turn green plus new pager
contract tests (all in `apps/mobile/__tests__/services/`)

### Tests for User Story 1 (author FIRST; T018 executes)

- [x] T007 [P] [US1] Author
      `apps/mobile/__tests__/services/sync/issue255-paged-pull-contract.test.ts`
      (server cap 3 and cap-independent EOF, exact multiples, valid zero, raw
      microseconds + UUID tie order, later-page failure, empty-positive-count,
      missing/invalid-count, non-advancing cursor, dedicated count EOF).
      Precision assertions stay diagnostic (no CAS-scope creep)

### Implementation for User Story 1

- [x] T008 [US1] Implement shared pager + PostgREST data/count/error adapter in
      `apps/mobile/services/sync/pull-pagination.ts` (NO generic ordinary JSON
      RPCs) (depends on T007)
- [x] T009 [US1] Implement seal acquisition + H handling in
      `apps/mobile/services/sync/pull-fence.ts` (depends on T008)
- [x] T010 [P] [US1] Wire ordinary/categories/dedicated/snapshot-active
      strategies INCLUDING the active-row owner joins in
      `apps/mobile/services/sync/pull-strategies.ts` (depends on T008; parallel
      with T009 — different files, no interdependency)
- [x] T011 [US1] Implement buffered single-apply unit in
      `apps/mobile/services/sync/atomic-pull-strategies.ts` (depends on T009,
      T010)
- [x] T012 [US1] Extend `apps/mobile/services/sync/types.ts` ONLY if needed —
      minimal (depends on T008–T011)

**Checkpoint**: US1 authored and independently revievable at T018 (no interim
execution)

---

## Phase 4: User Story 2 — Capped child lookups lose nothing (P1)

**Goal**: Owner joins + journal tombstones complete the pull

**Independent Test**: New owner/snapshot contract tests + existing Red journey 3
turns green

### Tests for User Story 2 (author FIRST; T018 executes)

- [x] T013 [P] [US2] Author
      `apps/mobile/__tests__/services/sync/issue255-owner-snapshot-pull-contract.test.ts`
      (owner join without parent fetch, owned SOFT-DELETED parent children
      INCLUDING deleted children — not `deleted=false` only, snapshot active + 2
      journal pages, fail second journal → no advance)

### Implementation for User Story 2

- [x] T014 [US2] Implement JOURNAL-ONLY pull + embedded typed-projection strip +
      canonical typed projections in
      `apps/mobile/services/sync/snapshot-deletion-pull.ts` (active-row owner
      joins live in T010, not here) (depends on T013)
- [x] T015 [US2] Integrate journal pages + tombstones into the buffered apply in
      `apps/mobile/services/sync/atomic-pull-strategies.ts` (depends on T011,
      T014)

**Checkpoint**: US1 AND US2 authored; structural checkpoint (no interim
execution)

---

## Phase 5: User Story 3 — Failed sync never lies about state (P2)

**Goal**: Fail-closed guards on checkpoint and dirty groups

**Independent Test**: New T007/T013 injection tests + existing push-service
diagnostic (`apps/mobile/__tests__/services/sync-push-service.test.ts`) as the
failure basis. NOTE: the proven Red suite covers truncation/omission only — it
is NOT a failure/dirty-group proof and must not be cited as one.

- [x] T016 [US3] Harden fail-closed guards (pull failure advances nothing; push
      failure keeps good pull, dirty stays retryable) in
      `apps/mobile/services/sync/pull-fence.ts` and
      `apps/mobile/services/sync/atomic-pull-strategies.ts` (depends on T011,
      T015). PRODUCTION CHANGES ONLY IF a focused new test (covered in
      `apps/mobile/__tests__/services/sync/issue255-sync-checkpoint.sqlite.integration.test.ts`)
      proves an in-scope defect; otherwise the diagnostic regression tests
      suffice. No generic hardening without defect proof; no #368 repair.

**Checkpoint**: All stories authored; structural checkpoint (no interim
execution)

---

## Phase 6: Final — Types, validation batch, independent review

**Purpose**: Single-owner generated types, ONE batched validation, review

- [x] T017 Generate `packages/db/src/supabase-types.ts` against the owned local
      backend (single owner; NO blind model/schema/config transform; depends on
      all implementation)
- [x] T018 Final validation batch ONCE (user-authorized): real cap Green + SQL
      concurrency/security + financial regressions + lint/types (depends on
      T017)
- [x] T019 Independent reviewer pass (different worker); after fixes rerun ONLY
      affected checks if needed (depends on T018)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — starts immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all stories
- **User Stories (Phases 3–5)**: Depend on Foundational; run sequentially (US1 →
  US2 → US3) or in parallel if staffed — US2 needs T011's apply unit, US3 needs
  T011 + T015, so parallel lanes must respect those edges
- **Final (Phase 6)**: Depends on all stories complete

### Requirement Coverage

| Requirement                                      | Tasks                       |
| ------------------------------------------------ | --------------------------- |
| FR-001–FR-005 (pager, cursor, H, EOF, fail-only) | T003–T004, T007–T012, T018  |
| FR-006 (owner joins, strip projection)           | T013–T014, T018             |
| FR-007–FR-008 (fence, seal, trigger rebinding)   | T003–T006, T009, T018       |
| FR-009 (journal + page RPC)                      | T003, T006, T013–T015, T018 |
| FR-010 (single buffered apply)                   | T011, T015, T018            |
| FR-011 (financial no-drift)                      | T016, T018–T019             |
| FR-012 / DEP-01 (business-decisions record)      | Done at plan stage          |
| SC-001–SC-005                                    | T007, T013, T016, T018      |

### Parallel Opportunities

- T002 runs parallel with T001 (meta vs docs, no shared files)
- T007 and T013 are independent files — both [P] once Foundation is done
- T009 ∥ T010 after T008 (different files, no interdependency)
- Shared-helper/migration chain (T004–T006) and generated types (T017) are
  single-owner, strictly sequential — never parallelized

---

## Implementation Strategy

### Full approved scope (US1–US3, no MVP-only STOP)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1 (authoring checkpoint)
4. Continue through US2–US3 — user-approved full core scope; no MVP-only STOP
   and no interim validation runs before T018

### Incremental Delivery

1. Setup + Foundational → barrier ready
2. Add US1 → test → MVP checkpoint
3. Add US2 → test → journal-complete checkpoint
4. Add US3 → test → fail-closed checkpoint
5. Final types + ONE validation batch + independent review

---

## Final local validation (2026-10-07)

T001–T019 are complete for the approved local core scope. T012 needed no
types.ts changes. T016 required no unrelated production hardening; the real
SDK/SQLite failure tests verify the existing single-apply behavior after paging
and journal integration.

- Owned migration replay and public Supabase type generation completed. Old
  migrations and Watermelon schema/models remain unchanged.
- Jest latest-result aggregate: **23/23 suites, 176/176 tests**, from 20
  unchanged passing suites in the initial batch and three affected passing
  reruns (14 tests). This is not one uninterrupted clean run.
- Original 2,501-row initial/unchanged sync and 1,001-parent/child real-path
  journeys passed.
- SQL: **101 financial regression assertions + three fence/journal probes
  passed**; only the snapshot probe reran after correcting its fixture column.
- Mobile TypeScript, scoped TypeScript ESLint and formatting passed. The SQL
  Node probe is repository-ignored by ESLint and is not claimed linted.
- Independent Gemini SQL/client review passed; existing trigger binding and
  static hook-body equivalence evidence resolved the withdrawn trigger concern.
- Database-package TS2416 at
  packages/db/src/models/base/base-market-rate-observation.ts:35 was reproduced
  on the untouched pinned base and remains excluded from this fix.
- Device/emulator and manual E2E runs were not executed. No commit hooks,
  commits, pushes, PRs or merges were performed; remote readiness is not
  claimed.

The genuine Red evidence is the original run-1791353499634. New contract/SQL
tests were authored before production; their first execution was in the final
batch. Fixture failures are not presented as new genuine Red evidence.

Transport-fixture extensions preserved behavioral assertions in:

- `apps/mobile/__tests__/services/sync/atomic-pull-strategies.test.ts`
- `apps/mobile/__tests__/services/sync-pull-dispatcher.test.ts`
- `apps/mobile/__tests__/services/sync.test.ts`
- `apps/mobile/__tests__/services/sync-auth-scope-lifecycle.test.ts`

See quickstart.md and checklists/acceptance-coverage.md for scenario-level
coverage and explicit manual exclusions.

## Phase 7: Approved bounded continuation — C255-S

Base/governance: b2ec0fd4bc81cf2bf504f86d3bb781f605b355fc. The current
completion state below reflects local implementation and recorded verification,
with independent QA and device/cloud exclusions kept explicit. T001–T019 must
not be renumbered or reused to claim continuation completion.

- [x] T020 Promote approved FR-013–FR-018 into spec/plan/business decisions,
      reconcile contract/data-model/manual coverage references, and perform
      read-only cross-artifact analysis before production changes. Record
      receipt/storage bindings with the production owner. Do not run hooks. The
      installed skills are read from the configured main-worktree catalog; the
      active feature remains specs/389-sync-pagination. Reuse branch setup.

- [x] T021 [US4/US5/US6] Complete deterministic coverage in H/E, preserving K.
      Reuse the recorded 17-test Red; retain exact local output and test-file
      revisions. Integrate the supplied E state-matrix/apply-retry snippets.
      Bind receipt success/failure/reopen/A-B cases in the approved continuation
      suites and minimal shared fixtures; author the snapshot vector from
      quickstart.md. Include pending_local, immutable identity mismatch, state
      protection independent of dirty status, and withheld-evidence completion.
      Author before code; execute in the single final batch using the existing
      genuine Red as baseline. Missing helper/storage contracts are explicit
      blockers, not fabricated imports. Depends on T020.

- [x] T022 [US5] Production owner implements active dedicated effect delivery,
      strict compensation-time conversion and whole existing unresolved
      root/effect protection with immutable identity checks. Preserve local
      IDs/hashes/links and existing real reconciliation; no balance replay.
      Depends on T020, T021 authoring and the reused genuine Red.

- [x] T023 [US4/US6] Production owner implements the shared complete historical
      pull, fixed owner-local post-success receipt and one-time clean snapshot
      absent-set cleanup in the identical (cutoff,H] window. No receipt while
      required canonical evidence remains withheld; preserve retry/restart
      safety and all dirty/foreign/out-of-window records. Depends on T020, T021
      authoring, reused genuine Red and T022.

- [x] T024 [US4/US5/US6] Local successor runs affected real SDK/SQLite Green, K
      controls, financial reconciliation controls, relevant existing 389
      contracts, types, lint and formatting. Record actual per-test results; do
      not carry the 17-test count forward after adding/parameterizing tests.
      Verify actual apply failure and receipt-write failure separately. Depends
      on T022–T023.

- [x] T025 Local successor executes the owned-backend-085 runner plan:
      above-effective-cap initial/incremental C/U/D, effect hydration and owner
      isolation. Lower configured cap is optional without backend restart;
      report any unexecuted route-level concurrency cases explicitly. Preserve
      the synthetic source/ID/value manifests and capture checkpoints. Report
      missing executable cases explicitly. Depends on T024.

- [x] T026 Independent review of financial identity/state/retry, owner/receipt
      safety, snapshot cleanup and evidence honesty. Route findings to the sole
      production owner; rerun affected checks. No self-approval. Depends on T024
      and available T025 evidence.

- [x] T027 Reconcile every continuation coverage row as PASS/FAIL/BLOCKED with
      evidence and source/build/backend identity. Physical upgrades/usability
      remain BLOCKED until origin is known and device execution is authorized.
      The lead’s 2026-10-08 06:05 UTC read-only cloud inventory records 78
      migrations, max081, with082–085 absent; verified owned085 remains a
      deployment gap. Code handoff is not issue closure, deployment approval or
      verified upgrade completion. Depends on T025–T026; no
      commit/push/merge/deploy action in this task.

### Continuation traceability

| Requirement                                          | Implementation                 | Tests / evidence               |
| ---------------------------------------------------- | ------------------------------ | ------------------------------ |
| FR-013 history independently of checkpoint/schema    | T023                           | T021, T024; C04                |
| FR-014 receipt/retry/restart/owner/withheld evidence | T023                           | T021, T024; C05–C08, C10       |
| FR-015 exact effect delivery and no balance replay   | T022                           | T021, T024–T025; C09           |
| FR-016 unresolved identity and actual undo safety    | T022                           | T021, T024, T026; C10          |
| FR-017 one-time scoped snapshot cleanup              | T023                           | T021, T024–T025; C11           |
| FR-018 offline/upgrade/deployment boundaries         | T027                           | C12; explicit BLOCKED evidence |
| Existing pagination/concurrency compatibility        | unchanged unless proven defect | T025; C01–C03, C13             |

H/E/K and C01–C13 are defined in quickstart.md. This is a dependency list for
the existing lead, not a second dispatch graph.

T020 consistency analysis and T021 supplemental authoring completed on
2026-10-08. See continuation-analysis.md. T021 records authorship. T022–T025 now
have implementation and local evidence: 24/24 suites and218/218 tests by
latest-per-suite aggregate, mobile types/scoped lint, owned live 2/2 and cap 4/4
PASS. See quickstart.md. T026 final independent QA and T027 coverage-disposition
handoff are complete. C02 lower configured cap is optional/unrun; C12 device
upgrade/offline usability and C13 actual route-concurrency remain BLOCKED/unrun.
Device/cloud acceptance, issue closure and deployment readiness are not claimed.
