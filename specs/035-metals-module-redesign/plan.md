# Implementation Plan: Metals Module Redesign

**Branch**: `codex/035-metals-module-redesign` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)
**Input**: Approved feature specification at `specs/035-metals-module-redesign/spec.md`
**Planning status**: Phase 0 research, Phase 1 architecture/data design, and the normal-flow visual approval gate are complete. Eight approved canonical visuals are promoted. Tasks have been generated and remain under remediation and independent analysis; implementation has not started.

## Planning Setup

`.specify/scripts/bash/setup-plan.sh --json` identified the correct feature spec,
plan, and specs directory. Its reported branch and Git status were WSL/worktree
detection drift; the checked-out feature worktree is
`codex/035-metals-module-redesign`.

`.specify/extensions.yml` defines optional Git hooks. No optional commit hook
was run.

## Summary

Redesign Metals as one connected Gold/Silver, offline-first system spanning the
existing Home and Live Rates compositions, My Metals, holding detail, permanent
History, Add, Edit, whole-holding Sell, No Longer, Delete, Undo, and automatic
cross-device reconciliation.

WatermelonDB remains the immediate user-facing source of truth. Ordinary
name/notes-only changes use partial Last Write Wins metadata synchronization.
Add, material correction, Sell, No Longer, Delete, Undo, and linked account
effects use the generic owner-scoped financial-action root/outbox for stable
`action_id`, immutable payload hash, durable state/outcome, and replay. Metals domain
evidence linked by `action_id` owns the expected holding revision. Only actions with
an account effect add the root's optional expected-account-revision guard. One domain
RPC validates and commits the complete group atomically. Rejected optimistic groups
reconcile exactly once.

Sale account credit directly changes `accounts.balance` and records immutable
linked evidence. This path is not safe until issue #242 satisfies the complete
revision/CAS, writer-guard, sync, cutover, and regression contract. #242 gates only
sale credit, credited Undo, and account compensation/replacement credit; it is not
current behavior.

## Technical Context

**Language/Version**: TypeScript 5.9 strict; React 19.2; React Native 0.83.6
**Primary Dependencies**: Expo 55, Expo Router 55, WatermelonDB 0.28,
Supabase JS 2.106, NativeWind 4.2.6, Zod 4.3.6, i18next/react-i18next,
Reanimated 4.2, Gesture Handler, React Native SVG, and Decimal.js through one
shared `@monyvi/logic` primitive
**Storage**: WatermelonDB/SQLite local source of truth; Supabase PostgreSQL
background synchronization target; canonical decimals stored as text locally
and `numeric` remotely; posted account money represented as integer minor units
**Testing**: Jest/jest-expo, React Native Testing Library, real SQLite
integration, deterministic local Supabase RPC harness, Maestro, and manual
device/accessibility validation
**Target Platform**: Expo-managed iOS/Android; phone/tablet; portrait/landscape;
English/Arabic LTR/RTL; light/dark; 200% text
**Performance Goals**: Immediate local completion without network wait; one
Watermelon writer boundary per grouped action; bounded indexed read models; no
N+1 queries; reproducible holding/history list thresholds defined below
**Constraints**: Fully usable offline after safe startup; stale cached rates
remain usable with warning; missing rates preserve holdings; Decimal.js precision
50 with `ROUND_HALF_EVEN`; no intermediate rounding; no partial or duplicate
lifecycle/account effect; no identity leak; no historical snapshot rewrite
**Scope**: Gold and Silver only. Whole-holding sale/disposal only. Screen 19,
manual conflict choice, partial sales, purchase-time account deduction, Zakat,
and other metals remain backlog.

## Constitution Check

_Pre-design and post-design result: PASS, with issue #242 as an explicit
implementation dependency._

| Gate | Result | Design evidence |
| --- | --- | --- |
| Offline-first source of truth | Pass | Each action commits one complete local WatermelonDB group before network work and survives restart. |
| LWW versus financial CAS | Pass | Constitution 1.6 scopes LWW to independent metadata and requires stable-ID, expected-revision CAS for grouped financial actions. |
| Documented business rules | Pass | `business-decisions.md` records Gold/Silver scope, purity catalog, lifecycle, rate trust, exact arithmetic, account credit, and reversal rules. |
| Ownership | Pass | `assets` and new root records carry `user_id`; `asset_metals` retains strict inherited ownership through its immutable parent. |
| Exact arithmetic | Pass | Shared Decimal.js clone uses precision 50 and half-even final rounding; authoritative boundaries use canonical strings or minor units. |
| Account credit integrity | Conditional pass | Direct balance mutation is approved only after #242 passes its revision/CAS, writer-guard, sync, cutover, and regression contract. Metals validates expected holding and account revisions in one RPC. |
| Sync failure safety | Pass by design | RPC, pull, or push failure remains failure; no watermark advances and no local work becomes synchronized falsely. |
| Package boundaries | Pass by design | Pure calculations live in `packages/logic`; DB schema/models in `packages/db`; commands/read models/sync orchestration in `apps/mobile/services`. |
| Visible design approval | Pass | Eight approved canonical visuals are promoted: Home Concept C, 02, 03, 05 Add, 08 Edit, 14 Delete, 15 History, and 17 Disposed detail. |
| Test-first delivery | Pass by plan | Tests precede each production slice; deterministic CAS/compensation tests precede UI automation. |

## Architecture Decisions

### Existing holding projection

- Keep `assets` as holding identity, owner, name/notes, and purchase facts.
- Keep `asset_metals` as the strict child for Gold/Silver physical facts.
- Add one `metal_holding_states` root row per holding for lifecycle status,
  effective event, and current financial revision.
- Add exact text shadow columns instead of changing existing WatermelonDB numeric
  column types in place.
- Persist stable purity catalog code, catalog version, and exact factor as one current
  projection tuple. Only accepted material correction may replace it; immutable
  before/after/catalog snapshots remain in append-only action evidence.
- Treat old numeric fields as migration compatibility only after exact fields are
  populated; new authoritative calculations never read them.

### Immutable lifecycle and action evidence

Add user-owned `metal_holding_states`, `metal_lifecycle_events`, and
`metal_rate_references` with standard sync columns in `068_metals_domain`. Reuse the
generic owner-scoped `financial_action_groups` root/outbox frozen by
`067_financial_action_foundation` at T024. Full #242 later adds generic
`account_financial_effects` in `069_account_financial_effects` and reaches its enablement
gate at T033; do not add a competing Metals-only account outbox. Add shared pull-only
exact `market_rate_observations`. Metals events and references are append-only domain
evidence linked to the generic action ID; state changes come from deterministic reduction.
Current acquisition facts link to the Add/correction action that produced their
projection; only an accepted action retains that link canonically. Its role-unique
references independently preserve `acquisition_metal` and
`acquisition_purchase_currency`; no single purchase-rate ID represents both inputs.

### Account balance

Sale with account credit, credited Undo, and account compensation/replacement credit
update the selected account balance in the same local writer and server RPC as the
holding transition.
Generic `account_financial_effects` stores immutable linked evidence and unique effect
identity; it is not an ordinary income transaction. Server acceptance requires
matching expected holding and account revisions.

Full #242 completion at T033 must:

1. add and backfill account `financial_revision = 0` without fabricated history;
2. inventory and guard every account balance writer, including transaction, transfer,
   recurring, SMS, debt, account, fixture/repair, and sync paths;
3. commit local action root, immutable effect/evidence, outbox state, balance, and
   incremented revision atomically;
4. provide an idempotent owner-scoped CAS RPC and dedicated action synchronizer;
5. whitelist mutable account metadata while protecting `balance` and
   `financial_revision` from generic upsert/pull overwrite;
6. reconcile or compensate each losing account effect exactly once;
7. fail closed during mixed-version cutover: drain, migrate, or quarantine legacy
   unsynced financial rows before enforcement and reject legacy protected-field writes;
8. pass regression, replay/restart, multi-device, migration, and cutover gates.

Only sale account credit, credited Undo, and account compensation/replacement-credit
tasks wait for T033. T024 is sufficient generic-foundation readiness for
`068_metals_domain`, non-account lifecycle persistence, sale without credit, uncredited
Undo, and unrelated Metals work to develop and stack. Merge/cutover order remains
`067` then `068` then `069`; account-credit UI remains disabled until T033 passes.

### Synchronization split

- Name/notes-only changes use a partial metadata contract and LWW.
- Financial projection rows and linked evidence never use generic unconditional
  table upserts.
- A dedicated action synchronizer submits one complete command to one RPC.
- Server repeats return the recorded outcome for identical `action_id` and
  payload hash.
- Stale holding or account revision rejects the candidate and returns canonical
  revision/evidence for deterministic local reconciliation.
- Generic sync continues for unrelated records and canonical pulls, but must not
  independently activate action-owned fragments.

### Rate trust

Provider observation time—not fetch, storage, refresh, or sync time—determines
Fresh, Stale, or Unknown. Action evidence snapshots every consumed Gold/Silver
and FX input as an exact value with unit/orientation, provider observation time,
source, quality, and captured freshness. Missing inputs preserve facts and make
only affected calculations unavailable.

## Project Structure

```text
specs/035-metals-module-redesign/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── command-contract.md
│   ├── metadata-lww-contract.md
│   ├── rate-reference-contract.md
│   ├── read-model-contract.md
│   ├── reconciliation-contract.md
│   ├── rpc-contract.md
│   └── test-harness-contract.md
├── checklists/
├── design/
└── tasks.md
```

```text
packages/logic/src/metals/
├── decimal.ts
├── purity-catalog.ts
├── valuation.ts
├── attribution.ts
├── lifecycle-reducer.ts
└── action-contracts.ts

packages/db/src/
├── schema.ts
├── migrations.ts
└── models/

apps/mobile/services/
├── metal-holding-command-service.ts
├── metal-lifecycle-command-service.ts
├── metal-action-sync-service.ts
├── metal-reconciliation-service.ts
├── metal-portfolio-read-model-service.ts
├── metal-detail-read-model-service.ts
├── metal-history-read-model-service.ts
└── net-worth-read-model-service.ts

supabase/
├── migrations/
└── functions/
```

## TDD Delivery Order

Each slice is independently mergeable after its tests pass.

### Phase 1 — Exact domain and ordered persistence foundations

1. Add failing Decimal.js configuration, parsing, canonicalization, purity,
   valuation, attribution, rounding, and lifecycle-reducer tests, then the shared
   pure implementation in `@monyvi/logic`.
2. Create and verify `067_financial_action_foundation`: generic owner/action identity,
   domain type/reference, canonical serialization/hash, durable state/outcome/replay,
   storage interfaces, and the stable T024 interface milestone. It owns no expected
   holding/domain revision.
3. After T024, create and verify `068_metals_domain`: exact shadow fields, Metals
   domain tables/evidence, current acquisition-action/reference-set linkage, expected
   holding revision, non-account lifecycle RPC/CAS, matching WatermelonDB artifacts,
   and deterministic backfill. This work may develop and stack while the full #242 lane
   continues.
4. Merge/cut over `069_account_financial_effects` only after `068`: account revisions,
   generic immutable account effects, exhaustive writer protection, protected sync,
   idempotent account CAS, and exactly-once account compensation. T033 is the full #242
   completion gate.
5. Enable only credited Sale, credited Undo, and account compensation/replacement
   credit after T033. No earlier slice may bypass the disabled account-effect gate.

### Phase 2 — Local commands, sync, and read models

1. Add real-SQLite failing tests for Add, metadata Edit, material correction,
   Sell, No Longer, Delete, Undo, restart, duplicate submission, and rollback.
2. Implement minimal command services and Metals domain evidence linked to the generic financial-action root.
3. Add failing server-harness tests for competing actions and then action sync.
4. Add failing compensation/restart tests and then reconciliation.
5. Add failing read-model tests proving effective ownership, account balance,
   net worth, History, P/L, missing rates, and analytics exclusions.

### Phase 3 — UI journeys after applicable visual approval

1. Add RNTL tests for screen states, validation, live summaries, focus,
   duplicate blocking, preserved input, RTL, themes, and breakpoints.
2. Implement visuals outside the eight-candidate gate from their approved mockups.
3. Implement Add/Edit from their approved same-form live-preview mockups. The
   factual purity/value corrections for Home Concept C and Screens 02, 03, 14, 15,
   and 17 are approved and promoted, preserving their approved layouts.
4. Preserve Live Rates layout; change only Gold/Silver scope and truthful rate-state
   behavior.

### Phase 4 — End-to-end, resilience, and optimization

1. Add deterministic fixtures and Maestro flows for complete user journeys.
2. Run offline restart, stale/unknown/missing-rate, sync failure, retry, and
   conflict recovery matrices.
3. Complete manual two-device, tablet/landscape, 200% text, TalkBack/VoiceOver,
   Arabic bidi, and physical-offline validation.
4. Profile holding/history lists and read models; optimize only measured issues.

## Verification Matrix

| Invariant | Primary automated layer | Additional evidence |
| --- | --- | --- |
| Decimal/purity/formula/rounding correctness | `packages/logic` Jest fixtures | PostgreSQL parity fixtures |
| One complete local outcome or none | Real SQLite integration | Restart/retry tests |
| One server winner and idempotent replay | Deterministic RPC harness | Manual two-device check |
| Account credit/Undo/compensation exactness | RPC + SQLite integration | #242 regression suite |
| No ordinary-income/budget pollution | Analytics/read-model tests | Account activity manual check |
| Missing/stale rates preserve holdings | Read-model tests | RNTL and Maestro |
| Ownership/RLS isolation | RPC and sync integration | Foreign-user fixture |
| Pull/push failure advances no watermark | Sync tests | Offline recovery Maestro |
| History/effective state/reversal | Reducer + read-model tests | Lifecycle Maestro |
| Responsive/RTL/a11y/theme parity | RNTL layout/state tests | Manual device matrix |

## Complexity Tracking

| Complexity | Why required | Simpler alternative rejected |
| --- | --- | --- |
| Domain-specific CAS beside generic sync | Competing lifecycle/account actions must choose one atomic winner across devices. | Per-table LWW can accept fragments or overwrite balances. |
| Holding and account revisions | One action can change both ownership and cash. | Holding-only CAS leaves account races unresolved. |
| Append-only evidence plus current projection | Corrections, terminal events, Undo, Delete audit, and compensation must stay deterministic. | Mutating only current rows destroys reversal and conflict evidence. |
| Deterministic RPC harness | Concurrency, replay, rollback, and compensation cannot be scheduled honestly through Maestro. | UI-only tests cannot prove transactional guarantees. |

## Phase 1 Outputs

- [research.md](./research.md)
- [data-model.md](./data-model.md)
- [contracts](./contracts/)
- [quickstart.md](./quickstart.md)

### Approved stacked delivery topology

1. Planning and exact pure Metals domain.
2. `067_financial_action_foundation` and T024 stable interface milestone.
3. `068_metals_domain`, Metals persistence, and non-account reconciliation after T024.
4. `069_account_financial_effects` and T033 full #242 cutover; development may proceed
   in its owned lane, but it merges after `068`.
5. Portfolio surfaces.
6. Holding experience.
7. Add/Edit.
8. Terminal lifecycle, with only account-effect tasks waiting for T033.
9. Integration and quality.

This ordering is a conflict-control and review topology only. It does not authorize
creating branches, pull requests, commits, or implementation.

### Reproducible list-performance protocol

- Seed deterministic sets of 20, 100, and 500 holdings and 100, 300, and 1,500
  History events with mixed metals/statuses and stable IDs.
- Run release-profile/Hermes builds on available emulator/simulator viewport profiles
  representing the centralized compact-phone, ordinary-phone, and tablet breakpoints;
  record viewport, OS, build, and renderer rather than promising named hardware.
- Warm for 5 seconds, then capture the longer of 30 seconds or five complete
  top-to-bottom-to-top scroll passes. Run three samples per dataset/profile and record
  median plus worst sample using React Profiler commits and platform frame metrics.
- Normal set (100 holdings/300 events): at most 5% slow frames and zero frozen frames
  over 700 ms. Stress set (500/1,500): at most 10% slow frames, zero frozen frames,
  no blank cells/crash, and no whole-list rerender for a row-only update.
- Optimize only a measured breach and retain before/after evidence.

Post-design constitution check passes conditionally. The generated task graph remains
under remediation and independent analysis; no final readiness claim is made here.
