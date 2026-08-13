# Implementation Plan: Premium Budgets Dashboard

**Branch**: `385-budget-dashboard-redesign` | **Date**: 2026-08-13 | **Spec**:
[spec.md](./spec.md)  
**Input**: Feature specification for GitHub issue #224 under parent issue #218

## Summary

Redesign the Budgets dashboard around one user-scoped, offline-first read model
that classifies every matching budget exactly once into Overall budgets, Needs
attention, Category budgets, or Paused. Replace the single global hero with a
responsive whole-card page carousel, move Create to the shared `PageHeader`,
expose safe Resume and Renew actions, and remove the ambiguous fixed summary
footer and floating action button.

The implementation preserves all existing spending calculations and persistence
rules. It evolves the existing budget list service, passes accessible category
data into that service once, keeps lifecycle/error/cancellation state in the
hook, and renders shaped data through focused presentational components. No
database, sync, or financial-calculation changes are required.

## Technical Context

**Language/Version**: TypeScript 5.9 strict mode, React 19.2, React Native
0.83.6, Expo SDK 55  
**Primary Dependencies**: Expo Router, React Navigation, NativeWind v4,
WatermelonDB 0.28, react-i18next, React Native `FlatList`,
`useWindowDimensions`, and `AccessibilityInfo`  
**Storage**: Existing user-scoped WatermelonDB budgets, transactions,
categories, and pause intervals; synchronized Supabase schema unchanged  
**Testing**: Jest, jest-expo, React Native Testing Library `renderHook`, package
financial-regression tests, Maestro, and physical Android QA  
**Target Platform**: Expo-managed Android and iOS; required physical regression
target includes Android 16 with gesture and three-button navigation  
**Project Type**: Offline-first mobile app in an Nx monorepo  
**Performance Goals**: Period changes and observed-data recomputation settle
within one second for the manual-QA fixture; carousel regrouping remains
deterministic and does not trigger database reads; vertical budget content
remains virtualized  
**Constraints**: Preserve totals, thresholds, pause exclusions, category
descendants, user scoping, and input order; never crop carousel cards; support
EN/AR, RTL, light/dark, font scaling, reduced motion, and screen readers; apply
bottom inset exactly once  
**Scale/Scope**: One dashboard route, four conditional sections, at most one
healthy global budget per period and therefore at most three in All, with an
unbounded category-budget list that must remain virtualized

## Constitution Check

_GATE: Passed before Phase 0 and re-checked after Phase 1 design._

| Gate                           | Status               | Design response                                                                                                                                                                                     |
| ------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline-first source of truth  | PASS                 | Continue observing and mutating WatermelonDB first; no network dependency is added.                                                                                                                 |
| Documented budget rules        | PASS                 | The approved lifecycle precedence, renewal preservation, global filtering, and stable ordering are recorded in `docs/business/business-decisions.md` and the feature spec.                          |
| User-scoped data               | PASS                 | Retain `queryOwned` for budgets and reuse the already user-accessible Categories provider input; no raw component queries.                                                                          |
| Layer boundaries               | PASS                 | The service owns metric enrichment, category label resolution, lifecycle classification, and sorting; the hook owns subscription/loading/error/cancellation; UI renders shaped props and callbacks. |
| Shared financial logic         | PASS                 | Existing `@monyvi/logic` spending calculations and status thresholds remain unchanged.                                                                                                              |
| Type safety and null semantics | PASS                 | New dashboard DTOs use discriminated unions and nullable IDs only where the domain permits them.                                                                                                    |
| UI approval                    | PASS                 | Dashboard, Detail, and Create/Edit mockups are approved; this branch implements dashboard issue #224 only.                                                                                          |
| Design-system compliance       | PASS                 | Use `PageHeader`, `Skeleton`, shared confirmation UI, NativeWind tokens, theme variants, and accessible text status.                                                                                |
| Safe areas                     | PASS WITH DEPENDENCY | Consume issue #219 / PR #222 ownership rules after it lands: no global padding; dashboard list content owns `base + insets.bottom` once.                                                            |
| TDD and complete QA            | PASS                 | Add failing service, hook, component, seed, and Maestro coverage before production changes; retain explicit manual-only device/a11y checks.                                                         |
| Schema and sync safety         | PASS                 | No migration, backfill, sync-contract, or persisted enum change. Expiry remains a derived presentation state.                                                                                       |

Post-design re-check: the contracts introduce no architecture exception.
Complexity tracking is therefore unnecessary.

## Project Structure

### Documentation (this feature)

```text
specs/033-budget-dashboard-redesign/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── checklists/
│   └── requirements.md
└── contracts/
    ├── budget-dashboard-read-model.md
    ├── global-budget-carousel.md
    ├── budget-e2e-profiles.md
    └── lifecycle-actions.md
```

`tasks.md` was generated by `/speckit-tasks` and is the executable TDD sequence.

### Source Code (repository root)

```text
apps/mobile/
├── app/(private)/
│   ├── budgets.tsx                         # PageHeader create action and route composition
│   └── create-budget.tsx                   # #225 consumes the Renew route contract
├── components/budget/
│   ├── BudgetDashboard.tsx                 # composed, shaped dashboard view
│   ├── GlobalBudgetCarousel.tsx            # responsive whole-card pages
│   ├── BudgetDashboardCard.tsx             # lifecycle-aware presentation
│   ├── BudgetDashboardSectionHeader.tsx
│   ├── BudgetDashboardSkeleton.tsx
│   └── budget-dashboard-layout.ts          # pure row/page layout helpers
├── hooks/
│   ├── useBudgets.ts                       # subscription, cancellation, last-valid state
│   └── useBudgetDashboardActions.ts        # async Resume command state only
├── services/
│   ├── budget-list-read-model-service.ts   # exclusive classifier and shaped DTOs
│   └── budget-service.ts                   # existing owned Resume command
├── scripts/seed-fixtures/
│   ├── manual-qa-fixture.js
│   └── e2e-fixture.js
├── scripts/e2e-seed.js                     # selects an explicit budget E2E profile
├── e2e/maestro/budgets/
│   ├── dashboard-visibility-filters.yaml
│   ├── dashboard-lifecycle-actions.yaml
│   └── dashboard-carousel.yaml
└── __tests__/
    ├── services/budget-list-read-model-service.test.ts
    ├── services/budget-service.test.ts
    ├── hooks/useBudgets.test.ts
    ├── hooks/useBudgetDashboardActions.test.ts
    ├── components/budget/BudgetDashboard.test.tsx
    ├── components/budget/GlobalBudgetCarousel.test.tsx
    ├── app/budget-screens-style.test.tsx
    └── scripts/manual-qa-seed.test.ts

packages/logic/src/budget/__tests__/
└── budget-spending.test.ts                 # unchanged financial regression guard

docs/business/
└── business-decisions.md
```

**Structure Decision**: Keep the existing mobile-service and hook boundaries,
split the oversized dashboard into focused presentation components, and place
only pure responsive row/page layout helpers beside those components. Do not
create a new package, persistence model, or API.

## Phase 0: Research Decisions

See [research.md](./research.md). The key decisions are:

1. Classify in one service pass using expiry-first precedence; never derive
   sections with independent filters.
2. Retain expired custom budgets in the enriched input; expiry is derived from
   dates, not represented as a persisted status.
3. Represent the global carousel as viewport-width pages using a 320 dp minimum
   card width and 16 dp gap, containing the maximum whole number of equal cards.
4. Preserve the first visible eligible budget by stable ID during regrouping;
   fall back to page one only when that ID is no longer eligible.
5. Reuse accessible category data already provided to the private runtime and
   resolve presentation labels before cards render.
6. Preserve the last valid dashboard read model through refresh or command
   failures.
7. Reuse the shared `ConfirmationModal` pattern for Resume. Current budget
   actions do not actually confirm Resume, so this behavior must be added and
   tested.
8. Treat Renew as a distinct create-flow contract, never as edit-by-`id`.
9. Rebase on issue #219 / PR #222 before final integration and own bottom
   spacing locally once.

## Phase 1: Design and Contracts

### Read model

Evolve `budget-list-read-model-service.ts` to emit immutable, display-ready
items and four mutually exclusive arrays. The service receives enriched budgets,
the accessible category map, and active `en` or `ar` locale. It derives expiry
and attention state, resolves category labels, and sorts trimmed names with
`Intl.Collator(locale, { sensitivity: "base", numeric: true, usage: "sort" })`,
then uses budget ID as a final code-point tie-break. It must not query from a
card or change metric calculations.

### Hook state

Keep `useBudgets` as the React facade. It coordinates the budget observation,
accessible-category readiness, asynchronous metric calculation, selected period,
cancellation, retry, and last-valid state. After at least one success, later
failures set a recoverable error without clearing rendered budgets.

### Rendering and virtualization

Render one vertical `FlatList` of full-width dashboard rows. A pure layout
helper pairs healthy category cards into grid rows while attention and paused
entries remain full-width. The Overall carousel is a list header/section block.
This avoids nested vertical virtualized lists and preserves two-column category
presentation.

### Responsive carousel

Use measured container width and `useWindowDimensions` with
`GLOBAL_BUDGET_MIN_CARD_WIDTH = 320` dp and `GLOBAL_BUDGET_CARD_GAP = 16` dp to
select the maximum whole card count; containers below 320 dp fall back to one
card at full available width. Build page groups with
`ceil(total / visibleCount)`; each horizontal `FlatList` item occupies one
viewport and contains equal-width cards. Test 319/320 dp and the 655/656 dp
two-card threshold plus surrounding boundaries. Use stable IDs, deterministic
`getItemLayout`, and a page visibility callback. Hide dots for one page.
Announce user-driven page changes and honor reduced motion.

### Actions

The route/container owns the selected Resume target and confirmation visibility.
A focused `useBudgetDashboardActions` hook owns async submission, cancellation,
and friendly error state only. Cancel writes nothing; confirm invokes
`resumeBudget` once, disables repeat submission, and waits for the Watermelon
observation to move the record. The existing command remains paused-only: a
second/non-paused call is rejected and must not append another pause interval.
Failures retain the card.

Renew emits `/create-budget?renewFrom=<budgetId>`. Child issue #225 owns loading
that source and constructing a new prefilled form. The expired source must never
be passed as edit `id` or mutated. The dashboard contract can be tested
independently, but end-to-end renewal acceptance requires #225 in the
integration branch/release.

### Safe-area integration

Remove the fixed summary footer and FAB. Apply `contentContainerStyle` bottom
clearance as a named base spacing plus `useSafeAreaInsets().bottom` exactly
once. Rebase after PR #222; resolve its obsolete Budget footer hunk by
preserving the ownership contract, not the removed footer.

## Phase 2: Implementation Strategy

1. Extend deterministic manual-QA fixtures and add explicit `dashboard-full` and
   `dashboard-filter-empty` E2E profiles; prove selection, isolation, and
   idempotence.
2. Write failing read-model tests for all precedence, filter, ordering, deleted
   category, zero-spend, and exactly-once cases.
3. Implement the immutable dashboard read model without altering financial
   helpers.
4. Write failing hook tests for cancellation, filter changes, category
   readiness, retry, and last-valid-state preservation; then update the hook.
5. Write pure carousel/layout tests at width boundaries, rotation regrouping,
   uneven pages, stable anchor preservation, RTL, and reduced motion; then
   implement helpers and carousel.
6. Write failing dashboard/header/action tests; then implement approved
   sections, Skeleton loading, empty/error states, header Add action, Resume
   confirmation, Renew navigation, and removal of FAB/footer.
7. Add three deterministic Maestro journeys and wire a `budgets` E2E suite/scope
   that resets and selects the required profile before each flow. Maestro covers
   visible Resume cancel/confirm and Renew navigation; injected action failure
   stays in Jest/RNTL because no approved user-level failure harness exists.
8. Measure SC-006 with removable development-only commit-frame probes and SC-010
   with timed fresh no-budget trials; record device, build, and results.
9. Rebase/integrate PR #222, run focused and package gates, seed only missing
   manual-QA records for `manual-qa@monyvi.test`, and complete the
   physical-device matrix.
10. Run TypeScript, logic financial regressions, mobile Jest, lint, Maestro, and
    the PR coverage audit. Record unsupported screen-reader/contrast/nav-mode
    automation as manual-only evidence.

## Dependency and Delivery Boundaries

- **#219 / PR #222**: merge or rebase before final safe-area validation.
- **#225 Create/Edit redesign**: must consume `renewFrom` before the Renew
  journey is considered end-to-end complete.
- **#223 Detail redesign**: independent; no dashboard implementation dependency.
- **No schema work**: any proposed migration or sync change is out of scope and
  requires a new approval gate.
