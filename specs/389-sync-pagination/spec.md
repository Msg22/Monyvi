# Feature Specification: Fix Issue #255 Sync Pagination and Checkpoint

**Feature Branch**: `codex/issue255-historical-recovery` **Feature Directory**:
`specs/389-sync-pagination` **Created**: 2026-10-07 **Continuation
base/governance**: `b2ec0fd4bc81cf2bf504f86d3bb781f605b355fc` **Status**: PR381
core implemented and locally validated as historically recorded in
quickstart.md. The bounded #255/#367/#377 continuation is approved; approval
does not establish Green, deployment or installed-build upgrade completion.
**Input**: Complete required historical delivery without losing pending local
work or replaying financial effects.

The original baseline, T001–T019 results and dated environment statements are
historical evidence. The continuation below supersedes only the explicitly
identified scope exclusions; it does not retroactively expand earlier PASS.

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
- **FR-005**: Paging rejects missing/invalid count, empty-with-positive-count,
  malformed/non-advancing cursor and query errors. Failed pulls surface errors
  and advance no checkpoint. Existing auth/record validation and the strict
  effect/identity validation in FR-015–FR-016 also remain fail-closed.
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
  unchanged. FR-017 adds only bounded local pre-journal cleanup, not a server
  timestamp rewrite, journal backfill or new retention policy.
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
- PR381 did not implement #367/#377. Only US4–US6 and FR-013–FR-018 below extend
  this feature for their approved coordination. #368/#376/#380, #382
  frozen-clock work, broader #339 liveness and repair of already-corrupted
  terminal local actions remain outside this continuation. If a deferred-class
  defect appears, obtain lead classification and user direction rather than
  silently expanding this repair.
- No new UI/copy/navigation; no duplication of `specs/005` or `specs/007`.
- No schema bump, new SQL migration, data reset, server timestamp rewrite,
  financial-effect replay or global `handle_updated_at` replacement.

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

## Approved continuation — historical delivery and local recovery safety

### User Story 4 — Recover previously missed history (Priority: P1)

Given the same owner, schema and an already-advanced checkpoint, ordinary sync
recovers required older records and their original values without a reset, owner
change or caller-forced-full workaround. After actual successful repair, that
owner's fixed receipt prevents unnecessary repeated repair.

Acceptance: failed page/apply/push/receipt storage leaves repair retryable.
Restart before receipt repeats safely; restart after receipt retains completion.
A's receipt never completes B's repair. No unchanged-schema installation is
excluded merely because SQLite migrations have already run.

### User Story 5 — Deliver effects without bypassing local undo (Priority: P1)

Fresh and existing devices receive owned accounts, action roots and required
account effects with stable links, exact strings and valid compensation times.
Downloaded evidence never posts its amount to the account again.

Acceptance: a same-owner/action/hash terminal server root cannot make an
unresolved optimistic local action terminal by merge alone. In the reproduced
fixture, terminal local reconciliation requires balance 110, an inactive effect
and a deleted losing transaction, not balance 125/effective/undeleted. Original
local root ID, action ID, payload/hash and effect identity remain preserved.

### User Story 6 — Remove bounded pre-journal snapshot ghosts (Priority: P1)

A complete repair replaces an eligible stale local snapshot identity with the
remote replacement without duplicate visible totals. Absence is actionable only
inside the same frozen retention/delivery window after complete reads.

Acceptance: clean owned S-old absent remotely is removed; S-new appears once.
Dirty, foreign and out-of-window records survive. Page/apply failure performs no
partial cleanup, and a local edit before apply prevents stale clean-state
assumptions from deleting that row.

### Continuation functional requirements

- **FR-013 — Complete historical hydration:** Reuse the complete normal pull
  without its lower checkpoint bound when the current owner's fixed repair is
  due. Preserve the checkpoint until actual application; do not clear it.
  Include required ordinary/child/shared/dedicated/snapshot streams under their
  existing ownership and retention rules. Restore existing historical values,
  not defaults, synthetic actions or current-for-historical substitutions.
- **FR-014 — Durable completion:** Use the fixed owner-local receipt defined in
  contracts/sync-pull.md. Write it only after successful SDK synchronization,
  actual apply and owner checks. An attempt starting with ANY canonical
  unresolved owned financial root cannot write the receipt, even if push
  resolves that root during the attempt. A subsequent complete full pull must
  hydrate withheld canonical records before receipt completion. Failed/skipped
  attempts and receipt-storage failure remain retryable. A good pull followed by
  failed push retains applied rows/checkpoint and unsent dirty work.
- **FR-015 — Required effect delivery:** Include account_financial_effects in
  active dedicated pulling, never generic financial writes. Preserve exact
  minor-unit/revision strings and owner/account/action/effect links. Explicit
  null compensated_at remains null; valid server timestamps become local numeric
  timestamps; malformed values fail before apply. Raw paging cursors retain
  their existing precision. Importing an effect never reapplies money.
- **FR-016 — Unresolved local protection:** Determine unresolved state from the
  canonical action state, not SDK dirty status. Validate immutable identity with
  existing envelope/effect contracts. Preserve whole existing unresolved local
  roots and their existing colliding effects; retain their local IDs, canonical
  payload/hash, links, recovery state and compensation evidence. Missing records
  and unrelated resolved actions retain normal delivery. Existing same-hash
  RPC/outcome/reconciliation remains responsible for actual resolution; no
  compensation during pull or terminal acknowledgement shortcut. Required
  withheld evidence cannot be stranded behind a completion receipt.
- **FR-017 — Bounded snapshot cleanup:** During the one-time full repair,
  compare complete remote identities with clean current-owner local rows only in
  the identical frozen created_at interval (cutoff,H]. For the three daily
  snapshot tables, include eligible absent IDs in the buffered apply only after
  all required pages finish. Recheck ownership/cleanliness before cleanup.
  Preserve dirty/foreign/out-of-window rows and pending deletion intent. Keep
  normal deletion-journal delivery; no general absence-based deletion policy.
- **FR-018 — Compatibility and honest completion:** Preserve offline/local-first
  behavior and supported installed data. Validate actual supported same-owner
  upgrades independently of fresh installs. Code completion, owned-backend
  verification, live deployment and device/upgrade acceptance are separate.
  Unknown build/backend origins and missing live/device evidence remain BLOCKED.

### Continuation evidence and verification boundary

Lead-reported b2 joint real SDK/SQLite batch: 17 tests, nine genuine behavioral
failures, eight passes, zero harness failures. The three existing checkpoint
controls and direct rejected-action reconciliation control passed. Do not infer
other per-scenario PASS results from that aggregate.

Reuse these genuine Reds. Author supplemental deterministic tests before their
production changes; Mohamed's SINGLE final check batch governs the continuation.
Do not prescribe additional per-file Red runs. This supersedes conflicting
continuation check wording elsewhere, without changing historical T018 evidence.

H/E/K suites and the complete C01–C13 matrix are defined in quickstart.md;
T020–T027 provide continuation traceability. Scripted-network SDK/SQLite tests
do not establish live Supabase behavior or device E2E.

Lead inventory: SM-A546E Android 16, development 1.0.0/code 1, schema 29 and
owner/checkpoint present; active JS/source/OTA and historical backend origin
unknown. Emulator has no app; second physical origin is unknown. Live cloud is
at migration 081; owned isolated backend is at 085. No deployment or physical
reset/clear-data/launch/install is authorized by these documents.

FR-011 and SC-005 continue to prohibit new financial semantics or UI. The
approved protection restores local consistency; it does not solve broader #339
liveness or already-corrupted terminal records. Full issue closure remains
blocked until required live/device/upgrade gaps are actually verified.
