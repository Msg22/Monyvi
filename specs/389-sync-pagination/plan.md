# Implementation Plan: Fix Issue #255 Sync Pagination and Checkpoint

**Branch**: `codex/issue255-sync-pagination` (helper alias `389-sync-pagination`
used only for the prerequisites script; actual Git branch unchanged) | **Date**:
2026-10-07 | **Spec**: `specs/389-sync-pagination/spec.md` **Input**: Feature
specification from `specs/389-sync-pagination/spec.md`

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
