# Quickstart: Premium Budgets Dashboard

## Preconditions

- Branch: `385-budget-dashboard-redesign`.
- Issue #224 spec and approved mockups remain the source of truth.
- Rebase/merge issue #219 PR #222 before final safe-area QA.
- Child #225 must consume the `renewFrom` contract before full Renew E2E
  acceptance.
- Do not install dependencies in a secondary worktree; link the main
  `node_modules` junction when applicable.

## TDD order

1. Extend fixture assertions and add the missing deterministic budget states.
2. Make read-model tests fail for the new mutually exclusive contract.
3. Implement the service contract and retain financial regression coverage.
4. Make hook tests fail for last-valid state/cancellation behavior, then
   implement.
5. Make carousel/layout tests fail at width and anchor boundaries, then
   implement.
6. Make dashboard/action tests fail for the approved UI and safe actions, then
   implement.
7. Add and run deterministic Maestro journeys.
8. Complete the manual-only accessibility and physical safe-area matrix.

Do not implement production code before its focused test fails for the intended
reason.

## Focused automated checks

From the repository root:

```powershell
npm test -w @monyvi/mobile -- --runInBand budget-list-read-model-service useBudgets useBudgetDashboardActions BudgetDashboard GlobalBudgetCarousel budget-service manual-qa-seed e2e-seed run-ci-e2e resolve-ci-e2e-scope budget-screens-style
npm test -w @monyvi/logic -- --runInBand budget-spending
npm run typecheck -w @monyvi/mobile
npm run lint -w @monyvi/mobile
```

If logic production code is touched, also run its package typecheck/lint. The
current plan does not require that change.

## Expected Jest coverage

### Read model

- all five derived lifecycle states;
- expiry-over-manual-pause precedence;
- exactly one section per matching ID;
- All/Weekly/Monthly/Custom across every section;
- every matching global retained;
- trimmed-name `Intl.Collator` ordering for EN/AR plus code-point ID tie-break;
- spend-only changes do not reorder;
- zero spend;
- missing/deleted category fallback;
- financial helper rejection propagation;
- no mutation of input.

### Hook

- authenticated user-scoped observation;
- resolving and signed-out clearing/no-op;
- accessible-category readiness;
- period filter recomputation;
- stale async completion cancellation;
- initial failure versus post-success recoverable failure;
- last valid model retained;
- retry/refresh;
- cleanup after unmount.

### Dashboard/carousel/actions

- approved section order and empty-section omission;
- initial Skeleton and no `ActivityIndicator`;
- no-budget, filtered-empty, and recoverable-error states;
- PageHeader Add action; no FAB and no fixed summary footer;
- complete/equal cards at exact-fit and ±1 dp boundaries using 320 dp minimum
  width and 16 dp gap;
- page count, dots, uneven final page, rotation, anchor preservation/reset;
- every global card visibly renders period, spent, limit, percentage, remaining,
  and remaining time;
- accessibility labels and page announcements;
- EN/AR/RTL, long text, font scale, light/dark, and reduced motion;
- bottom content inset included exactly once;
- Resume modal open/cancel/confirm/injected-failure/duplicate-tap protection;
- second/non-paused Resume service rejection appends no interval;
- Renew emits `renewFrom` and never calls update on the historical budget.

## Manual-QA data

Target user: `manual-qa@monyvi.test`.

Before seeding:

1. Inspect the current local Supabase/fixture-owned data for this user.
2. Compare it against the matrix below.
3. Add only missing deterministic records.
4. Do not fully reset/reseed when existing records already satisfy the
   scenarios.
5. Keep fixture creation idempotent and update
   `apps/mobile/__tests__/scripts/manual-qa-seed.test.ts`.

Required matrix:

- healthy active GLOBAL weekly, monthly, and custom budgets;
- enough eligible globals to exercise one-card and multi-card responsive pages;
- warning and over-budget global/category budgets with deterministic
  transactions;
- healthy and zero-spend category budgets;
- manually paused global/category budgets;
- expired custom active budget;
- manually paused custom budget whose end date has passed;
- deleted-category historical budget;
- long budget/category name and large formatted amount;
- at least one filter with no matching result if the fixture can preserve the
  other required states.

Local preparation:

```powershell
npm run supabase:start:local
$env:MANUAL_QA_PASSWORD = "<local-password>"
npm run manual:seed-user -w @monyvi/mobile
npm run mobile:local-supabase
```

For an emulator, additionally reverse Metro and open the dev-client/deep link:

```powershell
adb -s emulator-5554 reverse tcp:8081 tcp:8081
adb -s emulator-5554 shell am start -a android.intent.action.VIEW -d "monyvi://budgets" com.monyvi.app
```

Use `manual:reset-user` only when Mohamed explicitly wants a clean fixture or
the existing data is irreparably inconsistent.

## Maestro

Use the dedicated profiles from `contracts/budget-e2e-profiles.md`; never depend
on the manual-QA account. `dashboard-full` drives carousel and lifecycle flows.
`dashboard-filter-empty` contains no CUSTOM budgets and drives the
visibility/filter flow. The registered suite resets and reseeds the E2E user
with the mapped profile before every flow; an unset profile preserves other
suites' existing fixture.

Run individual flows with an explicit reset/profile each time:

```powershell
$env:E2E_SUPABASE_MODE = "local"
$env:E2E_BUDGET_PROFILE = "dashboard-filter-empty"
npm run e2e:reset -w @monyvi/mobile
npm run e2e:seed -w @monyvi/mobile
npm run e2e:flow:local -w @monyvi/mobile -- e2e/maestro/budgets/dashboard-visibility-filters.yaml

$env:E2E_BUDGET_PROFILE = "dashboard-full"
npm run e2e:reset -w @monyvi/mobile
npm run e2e:seed -w @monyvi/mobile
npm run e2e:flow:local -w @monyvi/mobile -- e2e/maestro/budgets/dashboard-lifecycle-actions.yaml

npm run e2e:reset -w @monyvi/mobile
npm run e2e:seed -w @monyvi/mobile
npm run e2e:flow:local -w @monyvi/mobile -- e2e/maestro/budgets/dashboard-carousel.yaml
Remove-Item Env:E2E_BUDGET_PROFILE
Remove-Item Env:E2E_SUPABASE_MODE
```

After wiring the `budgets` suite:

```powershell
$env:E2E_CI_SUITES = "budgets"
npm run e2e:local -w @monyvi/mobile
Remove-Item Env:E2E_CI_SUITES
```

Maestro verifies only honest user-visible behavior: open Budgets, switch
filters, reach every section/card, swipe page groups, cancel/confirm Resume, and
open Renew prefill. Injected Resume failure stays in Jest/RNTL because no
approved user-level failure harness exists. Geometry algorithms remain Jest
responsibilities.

## Timed acceptance evidence

### SC-006 filter commit

1. Seed the production-like manual-QA matrix and run a development or release
   build on the supported Android target.
2. Add a temporary development-only `performance.now()` timestamp in the filter
   press handler and a post-commit effect for the correct filtered sections.
   Report through the structured development logger or an injected test
   callback; never use `console.*`.
3. Run five consecutive transitions for each All/Weekly/Monthly/Custom path.
4. Require every result to be `<= 1000 ms`; record device, OS, build SHA, all
   values, and the maximum below.
5. Remove the probes before the PR and verify the diff contains no
   instrumentation.

Result: _pending implementation/device run_.

### SC-010 first Create journey

1. Reset only the dedicated test user to a fresh no-budget state.
2. Start the timer when the dashboard first becomes interactive.
3. Stop when the Create Budget form is visible after using the visible header or
   empty state Create action.
4. Run three trials on the supported phone; require each to be `<= 10 seconds`.
5. Record device, OS, build SHA, path used, and all three values below.

Result: _pending implementation/device run_.

## Manual-only device matrix

Record device, OS, build/commit, language, theme, navigation mode, and evidence.

| Dimension          | Required checks                                                                   |
| ------------------ | --------------------------------------------------------------------------------- |
| Android navigation | Gesture and three-button; final card/action remains clear                         |
| Orientation/width  | Small portrait, landscape, and a width that fits 2+ full cards                    |
| Compact rows       | Full-width attention/category/paused rows; no grid, giant cards, or crushed names |
| Overall card       | Icon beside title; percentage at progress edge; compact height retained           |
| Language           | English and Arabic/RTL; no clipped status/action/currency                         |
| Theme              | Light and dark; readable status/progress/action contrast                          |
| Font               | Default and maximum supported app/device scale                                    |
| Screen reader      | TalkBack reading order, card content, status, action, page X/Y                    |
| Motion             | Reduced-motion setting; no decorative forced animation                            |
| Carousel race      | Rotate or filter during/after swipe; stable eligible anchor retained              |
| Renew integration  | Prefilled Create form after #225; expired source unchanged on back/create         |

## PR evidence

The PR description must include:

- source issue/spec and approved mockup link;
- exact test commands/results;
- a coverage matrix mapping every manual scenario to Jest, Maestro, or
  manual-only;
- screenshots for small/large width, light/dark, and EN/AR;
- physical Android gesture/three-button results after PR #222 integration;
- confirmation that existing financial totals and pause exclusions did not
  change;
- confirmation that local QA data was inspected and only missing records were
  seeded.

## Implementation evidence (2026-08-14)

Validation ran from `385-budget-dashboard-redesign`, based on merged PR #222 at
`ef32414`.

- Focused mobile Jest: 16 suites and 164 tests passed after the final route
  recovery case was added.
- Financial regression: `budget-spending` passed 24 tests; dashboard code did
  not change the shared spending calculations or pause-window exclusions.
- Feature-scoped ESLint passed for every changed TypeScript/TSX file.
- Full mobile typecheck reached compilation and reported only seven existing
  errors outside this feature: `AppReadyGate.test.tsx`, tabs `_layout.tsx`,
  `CustomBottomTabBar.tsx`, and `SyncProvider.tsx`.
- Full mobile lint reported only 25 existing errors in `CustomBottomTabBar.tsx`
  and `useDeferredRouterReplace.ts`; no feature file failed the scoped gate.
- Budget E2E runner tests passed, including suite/profile/reset ordering. A real
  `E2E_CI_SUITES=budgets` run seeded the mapped E2E data, then timed out after
  180 seconds at `adb -s emulator-5554 wait-for-device` because no emulator was
  connected. The three Maestro flows remain device-blocked, not claimed as run.
- Local Supabase inspection initially found only four legacy budget fixtures for
  `manual-qa@monyvi.test`. The missing redesign matrix was added without
  deleting existing user rows. Post-seed inspection found 12 budget scenarios,
  including healthy weekly/monthly/custom globals, paused, expired-active,
  expired-paused, near-limit, over-budget, zero-spend, and deleted-category
  history. `manual-qa-seed` passed eight tests and now proves zero delete calls.
  The near-limit fixture is 220 EGP spent against a 250 EGP limit (88%, above
  its 80% warning threshold); post-seed local Supabase verification confirmed
  the 250 EGP limit.
- Renew emits `renewFrom` and never an edit `id`. Full prefilled Create behavior
  remains correctly blocked on child issue #225.

### Final coverage matrix

| Scenario                                                                            | Jest/integration                              | Maestro                                     | Manual-only status                              |
| ----------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| Exclusive lifecycle classification, ordering, filters, zero spend, deleted category | Green: read-model and hook suites             | Visibility flow authored; device blocked    | Fixture ready                                   |
| Whole-card responsive carousel, dots, regrouping, RTL offset, announcements         | Green: layout and carousel suites             | Carousel flow authored; device blocked      | Width/orientation/TalkBack pending              |
| Section order, Skeleton, empty/error states, header Create, no footer/FAB           | Green: dashboard and route suites             | Visibility flow authored; device blocked    | Visual screenshots pending                      |
| Compact grouped rows and Overall icon/percentage placement                          | Green: row, card, and dashboard suites        | Visibility flow authored; device blocked    | Physical screenshot rerun pending               |
| Resume confirmation, cancel, submit-once, failure retention                         | Green: service, hook, modal, and route suites | Lifecycle flow authored; device blocked     | Physical confirmation pending                   |
| Renew route contract and navigation failure recovery                                | Green: route suite                            | Route-opening step authored; device blocked | Prefill/source preservation waits for #225      |
| Light/dark, EN/AR, long text, font scale, reduced motion                            | Green: component/style assertions             | Not honestly controllable by current flow   | Physical matrix pending                         |
| Bottom inset included once and final-row reachability                               | Green: zero/gesture/button inset assertions   | Not honestly switchable in runner           | Samsung Android 16 gesture/button rerun pending |
| Filter commit within 1,000 ms                                                       | Deterministic correctness green               | Not a geometry/performance assertion        | SC-006 device probes pending                    |
| Fresh no-budget to Create within 10 seconds                                         | Navigation path green                         | Not run without device                      | SC-010 three timed trials pending               |
