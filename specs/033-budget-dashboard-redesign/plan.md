# Implementation Plan: Unified Budgets Dashboard

**Branch**: `385-budget-dashboard-redesign` | **Date**: 2026-08-14 | **Spec**:
[spec.md](./spec.md)  
**Input**: Revised feature specification for GitHub issue #224 under parent
issue #218

## Summary

Replace lifecycle sections and global-budget carousel with one continuous,
virtualized list of compact, full-width budget rows. Add scope tabs (`All`,
`Category`, `Global`) and visible Period and Status selectors. Filters combine
with AND semantics, default to `All / All / Active`, persist only for current
app session, and reset after fresh launch.

Keep lifecycle meaning inside each row. Active rows show health, percentage, and
progress. Paused and expired rows keep label, icon, amount context, and
Resume/Renew action but omit percentage and progress. Preserve current financial
calculations, renewal, confirmation, deleted-category recovery, local-first
observation, user scope, error retention, header Create, and safe-area behavior.

## Technical Context

**Language/Version**: TypeScript 5.9 strict mode, React 19.2, React Native
0.83.6, Expo SDK 55  
**Primary Dependencies**: Expo Router, React Navigation, NativeWind v4,
WatermelonDB 0.28, react-i18next, React Native `FlatList`, shared modal and
selector primitives **Storage**: Existing user-scoped WatermelonDB budgets,
transactions, categories, and pause intervals; Supabase schema unchanged
**Testing**: Jest, jest-expo, React Native Testing Library `renderHook`, logic
financial regressions, Maestro, and physical Android QA **Target Platform**:
Expo-managed Android and iOS; Android 16 gesture and three-button navigation
remain required physical targets **Project Type**: Offline-first mobile app in
Nx monorepo **Performance Goals**: Combined filter updates settle within one
second for manual-QA fixture; filtering and ordering trigger no extra database
query; unbounded list remains virtualized **Constraints**: Preserve totals,
thresholds, pause exclusions, descendant category aggregation, ownership,
current branch styling not superseded by approved mockup, EN/AR, RTL,
light/dark, text scaling, reduced motion, screen readers, and exactly-once
bottom inset **Scale/Scope**: One dashboard route, one list, three scope
choices, four period choices, four status choices, unbounded user budget count

## Constitution Check

_GATE: Passed before research and re-checked after design._

| Gate                          | Status | Design response                                                                                                                   |
| ----------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Offline-first source of truth | PASS   | Continue observing and mutating WatermelonDB first; no network dependency added.                                                  |
| Documented budget rules       | PASS   | Revised filtering, derived status, ordering, and row rules are recorded in business decisions and spec.                           |
| User-scoped data              | PASS   | Retain owned budget queries and accessible category input; cards perform no query.                                                |
| Layer boundaries              | PASS   | Service derives display items/filtering/order; hook owns subscription/session filter/error/cancellation; UI renders shaped props. |
| Shared financial logic        | PASS   | Existing spending helpers and thresholds remain unchanged.                                                                        |
| Type/null safety              | PASS   | Filters and presentation states use closed unions; category IDs retain domain null semantics.                                     |
| UI approval                   | PASS   | Active, Paused, and Expired unified-list mockups approved on 2026-08-14.                                                          |
| Design system                 | PASS   | Preserve `PageHeader`, `Skeleton`, shared confirmation, selectors, tokens, and NativeWind.                                        |
| Safe areas                    | PASS   | PR #222 is merged; unified list owns bottom content spacing exactly once.                                                         |
| TDD and QA                    | PASS   | Tests change before production; deterministic fixtures and honest device/E2E matrix remain required.                              |
| Schema/sync safety            | PASS   | No migration, backfill, persisted status, or sync change.                                                                         |

Post-design re-check: no constitution exception or complexity waiver required.

## Project Structure

### Documentation

```text
specs/033-budget-dashboard-redesign/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── checklists/requirements.md
└── contracts/
    ├── budget-dashboard-read-model.md
    ├── budget-dashboard-filtering.md
    ├── budget-e2e-profiles.md
    └── lifecycle-actions.md
```

Obsolete `global-budget-carousel.md` contract is removed because approved
dashboard has no carousel, page grouping, or page indicators.

### Source Code

```text
apps/mobile/
├── app/(private)/
│   ├── budgets.tsx
│   └── create-budget.tsx
├── components/budget/
│   ├── BudgetDashboard.tsx
│   ├── BudgetDashboardFilters.tsx
│   ├── BudgetDashboardRow.tsx
│   ├── BudgetDashboardSkeleton.tsx
│   └── budget-dashboard-layout.ts
├── hooks/
│   ├── budget-dashboard-filter-session.ts
│   ├── useBudgets.ts
│   └── useBudgetDashboardActions.ts
├── services/
│   ├── budget-list-read-model-service.ts
│   └── budget-service.ts
├── scripts/seed-fixtures/
│   ├── manual-qa-fixture.js
│   └── e2e-fixture.js
├── e2e/maestro/budgets/
│   ├── dashboard-filtering.yaml
│   └── dashboard-lifecycle-actions.yaml
└── __tests__/
    ├── services/budget-list-read-model-service.test.ts
    ├── hooks/useBudgets.test.ts
    ├── hooks/budget-dashboard-filter-session.test.ts
    ├── components/budget/BudgetDashboard.test.tsx
    ├── components/budget/BudgetDashboardFilters.test.tsx
    ├── components/budget/BudgetDashboardRow.test.tsx
    ├── components/budget/BudgetDashboardSkeleton.test.tsx
    ├── app/budget-screens-style.test.tsx
    └── scripts/manual-qa-seed.test.ts

packages/logic/src/budget/__tests__/
└── budget-spending.test.ts
```

**Structure Decision**: Evolve current service/hook boundaries. Replace carousel
and section-card components with one filter component and one unified row. Keep
pure filter/order helpers testable; add no package or persistence API.

## Phase 0: Research Decisions

See [research.md](./research.md). Main decisions:

1. Derive one presentation lifecycle per budget before status filtering.
2. Build display-ready items once, then apply scope, period, and status using
   pure AND predicates.
3. Sort with explicit presentation priority, then locale-aware name and stable
   ID.
4. Use one outer vertical `FlatList`; remove horizontal carousel state and all
   lifecycle section grouping.
5. Keep filter selections in an in-memory session boundary owned by hook; never
   persist them to WatermelonDB, Supabase, or device preferences.
6. Preserve last-valid data and reject stale async completions after filters or
   observations change.
7. Keep existing Resume confirmation and Renew create-source contracts.
8. Reuse merged #219/#222 safe-area ownership without global padding.

## Phase 1: Design and Contracts

### Read model

`budget-list-read-model-service.ts` emits one immutable `items` array plus
counts and selected filters. It receives enriched owned budgets, accessible
category data, one clock value, locale, and three filters. It derives display
status first, applies AND filters, ranks results, resolves historical category
labels, and sorts without recalculating metrics or querying per row.

Status derivation:

1. expired CUSTOM: `EXPIRED`;
2. otherwise persisted `PAUSED`: `PAUSED`;
3. otherwise metric danger: `OVER_BUDGET`;
4. otherwise metric warning: `NEAR_LIMIT`;
5. otherwise: `HEALTHY`.

Status filter mapping:

- `ALL`: every derived presentation state;
- `ACTIVE`: `HEALTHY`, `NEAR_LIMIT`, `OVER_BUDGET`;
- `PAUSED`: `PAUSED` only;
- `EXPIRED`: `EXPIRED` only.

### Filter and session state

`useBudgets` owns scope, period, and status selections and exposes setters plus
one reset action. A small in-memory filter-session module stores only these
three values for the current authenticated user while JS app process remains
alive. Hook initialization reads that session value; each accepted selection
writes it. User change or module reload/fresh launch returns defaults. No
persistent storage is used.

Selection changes start a new read-model generation. Generation/user/observation
tokens ignore stale async completions. After first success, failures retain last
valid rows and current selections.

### Rendering and virtualization

`BudgetDashboard` renders one vertical `FlatList`. Header contains scope tabs
followed by two visible filter controls. Every item uses `BudgetDashboardRow`;
no data-dependent card type changes width or hierarchy. Row receives
display-ready state and callbacks only.

Active rows include percentage/progress and health label. Paused and expired
rows omit both percentage and progress by contract, while still showing amount
context and direct action. Long text may wrap within bounded regions; actions,
badges, and chevrons remain reachable. Preserve approved branch typography,
spacing, color tokens, header Add action, and current user styling where not
superseded by final mockup.

### Ordering

Ranking is `EXPIRED`, `OVER_BUDGET`, `NEAR_LIMIT`, `PAUSED`, `HEALTHY` when
Status is `ALL`; only applicable groups remain under narrower status filters.
Names sort with existing active-locale collator and ID tie-break. Metric amounts
never become secondary sort key.

### Actions

Resume and Renew contracts remain unchanged. Resume opens shared confirmation,
blocks duplicate submit, invokes owned command once, and waits for local
observation. Renew uses `renewFrom`, opens create mode with reusable values, and
never edits history. Opening detail uses stable budget ID and tolerates missing
historical category.

### Loading, empty, and failure states

Skeleton mirrors header-adjacent content: scope tabs, two filter controls, then
compact rows. No content spinner. No-budget and filtered-empty are distinct;
filtered reset returns `All / All / Active`. Recoverable failures retain last
model and filters.

### Safe area and accessibility

List `contentContainerStyle` uses named base spacing plus runtime bottom inset
once. Controls expose role, selected/value state, and translated labels. Each
row announces identity, scope/category, period, amount, derived state, and
available action; paused/expired descriptions do not announce hidden progress.

## Phase 2: Implementation Strategy

1. Update deterministic fixtures and write failing service tests for all filter
   combinations, status precedence, ordering, exactly-once membership, zero
   spend, and deleted categories.
2. Replace sectioned read-model output with unified items and make service tests
   green without altering spending helpers.
3. Write failing session/hook tests for defaults, in-session restore, reset,
   stale cancellation, rapid filter changes, retry, and last-valid retention;
   then update hook state.
4. Write failing component tests for tabs, visible filter values, reset, unified
   rows, active progress, paused/expired omission, long text, RTL,
   accessibility, and removed carousel/sections; then update presentation.
5. Update layout-matching skeleton tests before production skeleton changes.
6. Preserve and rerun Resume/Renew/detail regression suites, including deleted
   category and prefilled renewal behavior.
7. Replace carousel Maestro coverage with combined-filter reachability; update
   deterministic E2E profiles and manual fixture only where data is missing.
8. Run focused tests, financial regressions, typecheck, lint, i18n validation,
   Maestro, and physical device matrix. Record manual-only TalkBack, contrast,
   navigation-mode, and timing evidence.

## Dependency and Delivery Boundaries

- **#219 / PR #222**: merged; safe-area contract required and must not be
  replaced.
- **#225 Create/Edit redesign**: existing `renewFrom` integration preserved; no
  new Create/Edit visual scope added here.
- **#223 Detail redesign**: independent, except deleted-category detail must
  continue recovering safely.
- **PR #226**: remains open. Revised implementation replaces obsolete dashboard
  presentation while keeping valid correctness fixes already on branch.
- **No schema work**: migration, backfill, sync, or persisted-status changes are
  out of scope and require separate approval gate.
