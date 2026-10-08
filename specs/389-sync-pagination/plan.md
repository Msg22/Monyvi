# Implementation Plan: Fix Issue #255 Sync Pagination and Checkpoint

**Branch**: `codex/issue255-historical-recovery` | **Continuation**: C255-S
**Base/governance**: `b2ec0fd4bc81cf2bf504f86d3bb781f605b355fc` **Spec**:
`specs/389-sync-pagination/spec.md`

The original sections below describe the delivered PR381 core. Their migration
plans, PASS statements and execution rules are historical, not continuation
completion evidence. The approved continuation follows at the end of this file.

## Summary

Sync pull becomes complete and honest: a shared count-aware keyset pager drives
ordinary, category, dedicated, and snapshot-active pulls to EOF by exact
remaining count; an ordinary server writer fence plus seal rows give one
delivery watermark H; a narrow deleted-ID journal carries snapshot tombstones;
the client buffers all pages into one apply with one checkpoint and fails
closed. Financial behavior, RPC guards, and marketV2 are unchanged.

## Technical Context

**Language/Version**: TypeScript 5.9.2 strict (explicit return types, no `any`)
**Primary Dependencies**: Supabase JS 2.106 (PostgREST + RPC), WatermelonDB 0.28
(`synchronize`), Expo 55 / React Native 0.83 **Storage**: PostgreSQL (server) +
SQLite via WatermelonDB (client source of truth); exact `numeric` server-side,
text client-side for financials **Testing**: Jest local integration on the real
path (existing harness already implemented: Red suite +
`scripts/testing/issue255-sync-reproduction/`; new contract tests authored
before code; proven Red baseline reused, never rebuilt) **Target Platform**:
Android client + local Supabase backend (owned 54341/54342 only; NEVER shared
54321/remote) **Project Type**: Mobile offline-first + PostgreSQL backend
**Performance Goals**: Complete pulls for 2500+ row datasets at observed cap
1000; no new latency budget (no perf-tuning scope) **Constraints**:
Offline-first; fail-closed sync; cap-agnostic rules; user-scoped pulls/push; NO
WatermelonDB row/schema change; additive migrations only (next 082 candidate);
node_modules junction, no installs **Scale/Scope**: Single-user datasets in the
low thousands of rows per collection; 4 pull surfaces + 1 journal + fence/seal +
4 early hooks

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- I. Offline-first: pulls complete locally first; sync stays background,
  non-blocking. PASS.
- II. Business logic documented: DEP-01 records sync rules in business-decisions
  §10 BEFORE production (done in this plan stage as approved). PASS.
- III. Type safety: strict TS, zod boundaries, no `any`. PASS.
- IV. Service separation: pull/pager/apply logic lives in
  `apps/mobile/services/` (sync services); no hook/component writes. PASS.
- VI. Package boundaries: `apps → logic → db` preserved; no reverse imports. New
  client types generated from owned backend later. PASS.
- VII. Migrations: additive only, sequential numbers, never edit old files;
  WatermelonDB untouched by this feature. PASS.
- VIII. Scope + fail-closed: user-scoped queries + RLS; failed PULL advances no
  metadata; failed PUSH leaves dirty unacknowledged and the valid pull
  checkpoint stands. PASS.

Post-design re-check: no new violations. Complexity Tracking: none (no
violations to justify).

## Project Structure

### Documentation (this feature)

```text
specs/389-sync-pagination/
├── plan.md              # This file
├── research.md          # Phase 0 decisions
├── data-model.md        # Phase 1 entities
├── quickstart.md        # Phase 1 manual/automation matrix
├── contracts/
│   └── sync-pull.md     # Phase 1 client/server contracts
└── checklists/
    ├── requirements.md      # Formal quality checklist
    └── acceptance-coverage.md  # Planned coverage (UNVERIFIED)
```

### Source Code (repository root, planned touch points, NOT edited here)

```text
apps/mobile/services/sync/pull-pagination.ts   # shared count-aware pager
apps/mobile/services/sync/pull-fence.ts        # seal acquisition + H handling
apps/mobile/services/sync/snapshot-deletion-pull.ts  # journal pull
apps/mobile/services/sync/pull-strategies.ts   # per-surface strategy wiring
apps/mobile/services/sync/atomic-pull-strategies.ts   # buffered apply unit
apps/mobile/services/sync/types.ts             # ONLY if needed (minimal)
packages/db/src/supabase-types.ts              # GENERATED later; NO blind
                                               # model/schema/config transform
supabase/migrations/                           # 082 fence foundation first,
                                               # then 4 copied hooks (split
                                               # 083+ only if size requires),
                                               # final bindings/seal/journal
                                               # migration last; prefix NOT
                                               # reserved until verified
```

**Structure Decision**: Mobile + API shape; server change is migration-only,
client change is service-layer only.

## HOW moved here from spec (CHK001 resolution)

The spec states outcomes and testable rules. All mechanism lives here: keyset
pager algorithm and page envelope (`contracts/sync-pull.md`), seal RPC
validation order, journal shape and cursor, trigger rebinding rules, the four
early-hook placements, and the buffered-apply/checkpoint unit.

## Approved bounded continuation — #255/#367/#377

### Ownership and boundaries

Production patch owner: Monyvi #255 Sync Reproduction. The documentation/test
proposal lane is response-only; one trusted local successor integrates its
artifacts and executes checks. The lead alone dispatches and accepts work.
Worktree: E:/Work/My Projects/Monyvi-issue255-historical-recovery. Branch setup
was already authorized/completed; do not repeat it. No commit, push, merge,
deployment, device write or remote data authorization.

No schema bump, SQL migration, reset, financial replay, generic conflict/feed/
backfill framework, or compensation during pull. Preserve offline-first. #382
frozen-clock and broader #339 liveness remain deferred.

### Minimal integration boundaries

1. sync.ts: decide whether the captured owner needs the fixed repair; invoke the
   existing complete pull without a lower checkpoint for that attempt. Do not
   erase the persisted checkpoint. Persist the owner-local receipt only after
   actual successful synchronization/application and owner checks.
2. sync/atomic-pull-strategies.ts: include account_financial_effects in the
   active dedicated traversal. Complete every required stream before return;
   preserve the market watermark and all current retention rules.
3. sync/pull-strategies.ts and a focused helper only if necessary: strict
   compensated_at conversion, existing-root identity/remapping validation, and
   whole-record protection of existing unresolved roots/colliding effects.
   Preserve the existing command/RPC/outcome/reconciliation pathway.
4. Snapshot repair: use one frozen cutoff with H across all three snapshot pulls
   and cleanup candidates. After complete remote enumeration, use the installed
   SDK per-table replacement option only for snapshots. Its scoped candidate
   query runs inside the SDK apply writer: owner, (cutoff,H], and synced status.
   Ordinary/financial tables stay incremental; explicit journal IDs retain
   existing authoritative deletion behavior.

No new public production API is required by this plan. The production owner
binds the exact fixed receipt key/value and any private plumbing before
dependent test authoring; this proposal does not guess those names. Do not
change package schemas/generated models for this client-only repair.

### Receipt safety

Successful synchronization is necessary but not sufficient: withheld required
canonical evidence must not be stranded behind the receipt. Keep repair due
until safe application is established. A successful pull followed by failed push
keeps its checkpoint and dirty work but does not complete the repair.
Receipt-storage failure remains an error with idempotent retry. Do not persist
completion from an unauthenticated/concurrent-sync skip or finally block. Crash
before receipt may repeat reads, never financial effects.

Preserving reconciliation_incomplete is not proof that its broader recovery
liveness is solved. Do not claim successful repair for that case while evidence
remains withheld. Report the specific blocker rather than expanding #339.

### Test and interface intake

H:
apps/mobile/**tests**/services/sync/issue255-historical-recovery.sqlite.integration.test.ts
E:
apps/mobile/**tests**/services/sync/issue367-effect-delivery.sqlite.integration.test.ts
K:
apps/mobile/**tests**/services/sync/issue255-sync-checkpoint.sqlite.integration.test.ts

Reuse the local joint b2 batch: 17 tests, nine genuine failures, eight passes,
zero harness failures. K's three controls and the actual direct rejected-action
reconciliation control passed. This is lead-supplied execution evidence. Do not
substitute the earlier mocked five-call composition test for routing proof or
describe scripted network tests as live Supabase/device execution.

Before binding missing H snippets, the local successor supplies/uses:

- the production owner's exact fixed receipt key and serialized value;
- the corrected H fixture's real-checkpoint setup, auth-switch control and
  persistent-database reopen mechanism;
- its actual SQLite apply-failure injection boundary.

These are narrow technical bindings, not new product decisions or permission to
introduce a helper framework. Preserve unpublished fixture corrections.
Integrate snippets by replacement/refactoring as needed to respect AGENTS.md's
file-size limit; do not duplicate an entire fixture or collision suite.

### Verification and acceptance

Map every deterministic case in quickstart.md to an existing or supplemental
test. Reuse the observed genuine Red; author supplemental tests before
production. Run them in Mohamed’s single final batch with affected Green,
TypeScript, lint and formatting checks; no additional per-file Red runs. Record
actual commands, source/test revisions, results and exclusions.

Then run the owned-backend-085 plan in quickstart.md. Reuse the original cap
harness and synthetic fixtures; no benchmark framework or shared-stack reset.
Independent review must cover financial state/identity, owner/receipt safety,
snapshot candidate scope and failure/retry behavior.

Code verification, owned-backend verification, live deployment and supported
installed-build upgrade evidence are separate dispositions. Unknown physical
JS/build/backend origin and live migration 081 remain explicit blockers to
deployment/upgrade claims, not reasons to erase installed data.
