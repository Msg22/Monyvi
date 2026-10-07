# Feature Specification: Fix Issue #255 Sync Pagination and Checkpoint

**Feature Branch**: `codex/issue255-sync-pagination` **Feature Directory**:
`specs/389-sync-pagination` **Created**: 2026-10-07 **Status**: Implemented and
locally validated; manual/device and pre-existing DB typecheck exclusions
recorded in quickstart.md **Input**: User description: "Fix issue255 sync
pagination and checkpoint"

## Baseline (proven Red, reused not rerun)

Real-path run `run-1791353499634` (production Supabase/client routers, marketV2
RPC, Watermelon `synchronize`/SQLite, no mocked pull): 37-row control PASS;
three above-cap journeys FAIL (2501 remote → 1000 applied/1501 missing;
unchanged second sync repairs nothing; 1001 parents/children → 1000 each).
Evidence: `docs/testing/issue255-sync-reproduction.md` plus the owned Red suite.
The original Red is reused; final local results are recorded in quickstart.md.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Large history syncs completely (Priority: P1)

A user with more than one response-cap of server rows syncs; every server row
arrives locally with no silent truncation.

**Why this priority**: The reported #255 data-loss shape; all else depends on
it.

**Independent Test**: Seed >cap rows remotely, pull to EOF, compare full
ID/value manifests remote vs local.

**Acceptance Scenarios**:

1. **Given** 2,501 remote rows, **When** pull runs to EOF, **Then** local holds
   all 2,501 with zero mismatch, zero omissions, zero duplicates.
2. **Given** a completed full pull, **When** an unchanged second sync runs,
   **Then** data is identical (stable manifest, no omissions/duplicates); the
   checkpoint MAY advance a valid server watermark.

---

### User Story 2 - Capped child lookups lose nothing (Priority: P1)

A user whose parent table exceeds the cap syncs; every child arrives, including
children of soft-deleted parents the user still owns.

**Why this priority**: Proven Red shape (1000/1001 each side); dropped children
corrupt history. No new orphan-handling UX is promised.

**Independent Test**: Seed cap+1 parents each with a child (one parent
soft-deleted but owned, one child deleted); sync; count both sides.

**Acceptance Scenarios**:

1. **Given** 1001 parents each with one child, **When** pull runs, **Then**
   local holds 1001 parents and 1001 children.
2. **Given** an owned soft-deleted parent, **When** pull runs, **Then** its
   children (including deleted ones) arrive as tombstones/records, never
   silently dropped.

---

### User Story 3 - Failed sync never lies about state (Priority: P2)

A user on a flaky network hits a mid-sync failure; the app reports failure,
keeps prior good state, and never marks unapplied rows synced.

**Why this priority**: Advance-while-omitting turned a transport cap into
permanent silent loss.

**Acceptance Scenarios**:

1. **Given** a pull fails on any page, **When** it aborts, **Then** sync
   metadata does not advance past applied rows and the error surfaces.
2. **Given** a good pull and a later push failure, **When** push fails, **Then**
   the pull stands and local dirty groups remain retryable.

---

### Edge Cases

- Valid empty (count 0), short (<cap), and exact-multiple pages succeed; EOF
  rule only: count>rows → continue, count==rows → done.
- Fail only on: missing/invalid count, empty page with positive count, malformed
  or non-advancing cursor, query error.
- Equal timestamps: exact UUID tie-break, never a `Date` microsecond round-trip.
  Concurrent writers: post-seal writes stamp strictly after H.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Pull MUST page every syncable collection to completion with keyset
  pagination and an exact remaining count per page.
- **FR-002**: Cursors MUST use the raw PostgreSQL timestamp plus UUID tie; the
  client MUST NEVER round-trip timestamps through `Date`.
- **FR-003**: Pulls MUST share one upper delivery watermark H with the existing
  marketV2 watermark. H is an eventual-convergence boundary, not an immutable
  snapshot view.
- **FR-004**: EOF is decided ONLY by exact count==rows (continue while
  count>rows), cap-independent. Page-size heuristics MUST NOT signal EOF.
- **FR-005**: Only missing/invalid count, empty-with-positive-count,
  malformed/non-advancing cursor, or query error fail; failures advance nothing
  and surface the error.
- **FR-006**: Child pulls MUST use owner relational joins including owned
  soft-deleted parents (especially deleted children); fetched-ID giant
  `.in(...)` lists are forbidden.
- **FR-007**: One ordinary server writer fence; publication timestamps are
  assigned AFTER fence acquisition and BEFORE commit; post-seal writes stamp
  strictly after H; no guessed future clock. Fence hooks run before existing RPC
  domain/advisory locks, whose order MUST NOT change.
- **FR-008**: Market-barrier semantics MUST be preserved; the shared
  `handle_updated_at` MUST NOT be globally replaced.
- **FR-009**: Snapshot hard deletes MUST publish once via a narrow deleted-ID
  journal (publication timestamp + unique entry ID; OLD table/user/row; no
  prune). Fenced replacements carry fenced `created_at`; the 90-day policy is
  unchanged (no rewrite/backfill).
- **FR-010**: The client MUST buffer all pages/tombstones, then apply one unit
  with one checkpoint; partial application is forbidden.
- **FR-011**: RPC guards, roles, expected-`updated_at`/CAS, exact text,
  immutable evidence, revisions, idempotency MUST behave exactly as today.
- **FR-012**: Required sync rules MUST be recorded in
  `docs/business/business-decisions.md` BEFORE production (implementation owner
  writes; lead coordinates; not this slice).

### Key Entities

- **Pull page**: bounded keyset slice with exact remaining count and raw
  (`updated_at`, `id`) resume cursor.
- **Watermark H**: shared delivery/convergence boundary for one pull.
- **Fence / seal**: one ordinary server fence plus seal rows separating
  pre-fence stamps from strictly-after-H writes.
- **Journal entry**: one tombstone (publication timestamp + unique ID) for an
  actual snapshot hard delete.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Above-cap dataset fully present locally: zero missing, zero
  duplicates, zero value mismatch vs server manifest.
- **SC-002**: Repeated unchanged sync yields identical data (stable manifest, no
  omissions/duplicates).
- **SC-003**: cap+1 parents/children fully present, including
  soft-deleted-owned-parent children.
- **SC-004**: Any failed sync preserves prior good state and reports failure.
- **SC-005**: No financial-behavior change; no new UI.

## Explicit Non-Goals

- No generic immutable feed, blanket retry/validation, or framework/perf work.
- #367/#377 NOT implemented (coordinated dependencies); #368/#376/#380 deferred.
  If a #368-class defect appears, do NOT repair it inside #255 without lead
  classification and user direction.
- No new UI/copy/navigation; no duplication of `specs/005` or `specs/007`.
- No migration rewrite/backfill; no global `handle_updated_at` replacement.

## Manual Plan / Automation Boundary (requirement level)

- Planned automation (local real-path Jest integration; Normal QA proposal is
  schematic placeholders until implemented in the harness): control, above-cap,
  unchanged second sync, cap+1, cap boundaries, incremental
  create/update/delete, equal timestamps, failure injection.
- Manual-only with explicit gap: device/emulator runs (no device connected).
  Zero device-proof claims. Checks run once pre-push, not per file; none run in
  this slice.

## Assumptions

- Requirements are cap-agnostic; observed baseline cap is 1000 (PostgREST
  default). Decided; no open question.
- Pinned source `2095ec061d531854603e8415122231f1cbf4c1a0`; repro backends
  STOPPED; shared stacks untouched; `node_modules` junction intact.
- Existing repro files/evidence preserved; no reverts of other workers.
- Proposed guard fixes are diagnostic/regression-scoped, not auto-approved
  production changes.
- No commits/push/PR/issue edits/remote data changes in this slice.

## Dependencies

- DEP-01: business-decisions sync rules BEFORE production (blocks Green).
- DEP-02: marketV2 watermark + RPC/advisory-lock order (read-only, unchanged).
- DEP-03: owned Red suite/evidence as acceptance baseline.
- DEP-04: #367/#377 tracked separately by lead.

## Clarifications

### Session 2026-10-07 (lead review corrections; all decided, none open)

- Q: Must valid empty/short/exact-multiple pages fail? → A: No. They succeed;
  EOF ONLY by count==rows; fail ONLY on missing/invalid count,
  empty-with-positive-count, malformed/non-advancing, or query error.
- Q: Must a second unchanged sync freeze the checkpoint? → A: No. It MAY advance
  a valid server watermark; identical data with zero omissions/duplicates is
  required.
- Q: When are publication timestamps assigned? → A: AFTER fence acquisition,
  BEFORE commit.
- Q: Is shared H an immutable snapshot? → A: No. Delivery boundary for eventual
  convergence.
- Q: Do children include soft-deleted parents? → A: Yes, especially deleted
  children; no new orphan UX promised.
- Q: Who writes business-decisions? → A: Local implementation owner; lead is
  coordination-only; QA proposals are remote-only.
- Q: Cap-1000 vs agnostic; device status? → A: Already determined (see
  Assumptions); no user question asked.
