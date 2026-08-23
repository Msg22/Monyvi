# Implementation Plan: Premium Budget Detail

**Branch**: `387-budget-detail-redesign` | **Date**: 2026-08-18 | **Spec**:
[spec.md](./spec.md)  
**Input**: Clarified feature specification for GitHub issue #223 under parent
issue #218

## Summary

Replace the legacy Budget Detail overflow sheet and circular-card hierarchy with
the approved premium detail screen: direct Edit and lifecycle actions, a shaped
identity region, linear overview, accessible weekly actual-versus-pace chart,
compact category and transaction rows, and a bottom Danger zone.

Preserve WatermelonDB ownership, bounded transaction aggregation, financial
totals, pause exclusions, daily-average semantics, category descendants, recent
transaction ordering, and schema/sync contracts. Add pure elapsed-budget-pace
logic, service-shaped presentation DTOs, lifecycle action state, scoped detail
dependency observation, deterministic refresh behavior, mockup-parity skeletons,
and complete Jest/Maestro/manual coverage.

## Technical Context

**Language/Version**: TypeScript 5.9 strict mode, React 19.2, React Native
0.83.6, Expo SDK 55  
**Primary Dependencies**: Expo Router, React Navigation, NativeWind v4,
WatermelonDB 0.28, react-i18next, React Native Reanimated 4, Safe Area Context,
shared `PageHeader`, `ConfirmationModal`, `Skeleton`, and category icon
primitives  
**Storage**: Existing current-user-scoped WatermelonDB budgets, transactions,
categories, and serialized pause intervals; Supabase schema unchanged  
**Testing**: Jest, jest-expo, React Native Testing Library `renderHook`, logic
unit tests, Maestro, local Supabase fixtures, and physical Android QA  
**Target Platform**: Expo-managed Android and iOS; Android 16 gesture and
three-button navigation remain required physical targets  
**Project Type**: Offline-first mobile app in an npm-workspaces/Nx monorepo  
**Performance Goals**: At most one owned period-transaction query and one
accessible-category query per emitted detail input snapshot; the snapshot is
reused for all in-memory derivation with no duplicate recomputation fetch or
per-week/per-row reads; every long-period bucket retains a fixed readable slot
and complete labels  
**Constraints**: TDD; no schema/sync/financial-total changes; current-user scope;
last-valid state retention; EN/AR, RTL, light/dark, enlarged text, reduced motion,
screen-reader semantics, and exactly-once bottom inset  
**Scale/Scope**: One detail route, all weekly buckets in a custom period, all
direct-child breakdown rows, and six newest matching transactions; linked #228,
#229, and #230 remain separate delivery dependencies

## Constitution Check

_GATE: Passed before research and re-checked after design._

| Gate | Status | Design response |
| --- | --- | --- |
| Offline-first source of truth | PASS | Existing scoped WatermelonDB reads and command services remain authoritative; no network dependency is added. |
| Documented business logic | PASS | Final pace, lifecycle, empty-state, icon, and navigation decisions are added to `docs/business/business-decisions.md` before production code. |
| Type safety | PASS | New contracts use immutable interfaces and closed unions; no `any`, non-null assertions, or empty-ID sentinels. |
| Service-layer separation | PASS | Pure pace math lives in logic; queries/read shaping live in services; hooks own subscriptions/action state; UI receives shaped props. |
| Premium approved UI | PASS | The issue #223 mockup and clarification log define hierarchy, density, actions, states, and responsive behavior. |
| Package boundaries | PASS | `apps/mobile` consumes logic and DB; `packages/logic` remains app-independent and runtime-DB independent. |
| Local migrations | PASS | No schema, migration, backfill, or sync change is planned. |
| Authenticated user scope | PASS | Every detail observation, aggregation, and command retains current-user ownership checks and clears on session loss. |
| Skeleton policy | PASS | Content loading uses a mockup-shaped `Skeleton` composition; the shared shimmer gains reduced-motion and cleanup coverage. |
| Safe-area ownership | PASS | `PageHeader` owns top inset; route scroll content owns bottom inset exactly once, including Danger zone reachability. |
| Strict TDD | PASS | Every production task follows a named failing unit/RNTL/Maestro contract task. |

## Phase 0 Research

Research decisions are recorded in [research.md](./research.md). No unresolved
clarification or constitution exception remains.

## Phase 1 Design

### Architecture

1. `packages/logic` calculates elapsed allowance, per-bucket pace, and the
   below/on/above classification from plain dates and numbers.
2. Budget Detail read-model services own scoped queries, pause filtering,
   category hierarchy, counts, icon semantics, transaction DTOs, and a bounded
   dependency-observation contract. The observer emits one scoped transaction/
   category input snapshot that the service reuses for in-memory shaping; it
   MUST NOT observe rows and then issue a duplicate fetch.
3. `useBudgetDetail` owns subscription generations, focus/foreground/day-boundary
   refresh, cancellation, initial versus retained errors, and retry.
4. `useBudgetDetailActions` invokes existing local-first command services and
   owns pending, duplicate suppression, stable error keys, and unmount safety.
5. The route owns navigation, translated toast/modal copy, and confirmation
   composition. Presentational components render immutable contracts only.
6. Shared `PageHeader` receives a backwards-compatible icon-plus-label action
   capability and a compliant Back target; no custom header is introduced.

### Refresh and concurrency

- One injected reference time is used per read-model build.
- Budget, scoped transaction, and accessible-category observations produce
  generation revisions; stale async results are ignored.
- Screen focus, app foreground, and the next local-calendar day trigger a
  recomputation without changing persisted data.
- Initial failures show a dedicated recovery state. Later failures retain the
  last trustworthy read model and expose Retry.
- Pause, Resume, and Delete reject duplicate pending confirmations. Successful
  commands wait for local observation before presenting the new trustworthy
  state; Delete navigates away only after the local write succeeds.

### Presentation

- Use 20dp screen gutters, token-derived light/dark surfaces, sentence-case
  headings, logical spacing, and no fixed card height.
- Normal-width identity stays on one row; narrow/Arabic/large-text layouts wrap
  metadata and move the lifecycle action without shrinking its 44dp target.
- Weekly y-axis stays fixed while equal-width week columns scroll horizontally.
  Partial weeks receive proportional pace allowance by inclusive local days.
- Paused/expired budgets keep historical progress but suppress the active pace
  insight. Empty applicable sections remain visible with compact explanations.
- Recent rows are single pressable targets opening Edit Transaction; category
  breakdown rows are not pressable and have no chevrons or View all.
- Reanimated work respects system reduced motion and cancels timers/repeats on
  cleanup. Decorative chart/icon elements are hidden from accessibility.

### Delivery dependencies

- #228, #229, and #230 are still open as of 2026-08-18. They remain separate
  focused PRs and must not enter the #223 visual branch.
- Main run `32060168425` remains the newest main CI run and is failing. Before
  #223 merge, verify those linked fixes on current main or the exact combined
  candidate commit; do not weaken assertions or skip suites.
- PR checks do not execute Android E2E. The Budgets suite must therefore be run
  locally before PR handoff, and the dependency suites require main/candidate
  evidence through their owning issues.

## Project Structure

### Documentation

```text
specs/034-budget-detail-redesign/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── budget-detail-ui-contract.md
└── tasks.md
```

### Source and tests

```text
packages/logic/src/budget/
├── budget-pace.ts
└── __tests__/budget-pace.test.ts

apps/mobile/
├── app/(private)/budget-detail.tsx
├── contracts/budget-detail-presentation.ts
├── services/
│   ├── budget-detail-read-model-service.ts
│   └── budget-detail-observation-service.ts
├── hooks/
│   ├── useBudgetDetail.ts
│   └── useBudgetDetailActions.ts
├── components/budget/
│   ├── BudgetDetailIdentity.tsx
│   ├── BudgetDetailOverview.tsx
│   ├── BudgetSpendingTrendChart.tsx
│   ├── SubcategoryBreakdown.tsx
│   ├── BudgetRecentTransactions.tsx
│   ├── BudgetDetailDangerZone.tsx
│   └── BudgetDetailSkeleton.tsx
├── components/navigation/PageHeader.tsx
├── components/ui/Skeleton.tsx
├── locales/{en,ar}/budgets.json
├── e2e/maestro/budgets/
├── scripts/seed-fixtures/
└── __tests__/
```

**Structure Decision**: Extend the existing mobile budget feature and shared
logic package. No new application, package, persistence model, or remote API is
introduced.

## Complexity Tracking

No constitution violation requires an exception.
