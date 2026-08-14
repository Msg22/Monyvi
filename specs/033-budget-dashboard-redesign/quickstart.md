# Quickstart: Unified Budgets Dashboard

## Preconditions

- Branch: `385-budget-dashboard-redesign`.
- Revised issue #224, [spec.md](./spec.md), and 2026-08-14 approved Active,
  Paused, and Expired mockups are source of truth.
- Earlier lifecycle-section/carousel mockup is superseded.
- PR #222 is merged; preserve its safe-area ownership.
- Preserve current branch UI edits unless final approved mockup replaces them.
- In secondary worktree, link main `node_modules`; never install there.

## TDD order

1. Update fixture assertions for required scope/period/status combinations.
2. Make read-model tests fail for unified items, status derivation, AND filters,
   and priority ordering.
3. Implement read-model contract without touching financial helpers.
4. Make filter-session and hook tests fail for defaults, restore, reset, races,
   and last-valid state.
5. Implement hook/session contract.
6. Make filter, row, dashboard, and skeleton tests fail against final mockup.
7. Implement presentation and remove obsolete carousel/section code.
8. Update Maestro journeys and physical/manual QA.

Production code changes begin only after focused test fails for intended reason.

## Preserved dashboard baseline audit (2026-08-14)

- Keep current compact row density, rounded grouped-list shell, status colors,
  direct Resume/Renew actions, shared PageHeader Add action, and exactly-once
  bottom safe-area spacing.
- Keep user-authored row typography and spacing where approved mockups do not
  specify a replacement.
- Replace only superseded hierarchy: section headings, global hero/carousel,
  page dots, period chips, and lifecycle-specific row variants.
- Final approved mockups require one grouped list, scope tabs, two visible-value
  filter cards, and one row structure for global and category budgets.

## Focused automated checks

From repository root:

```powershell
npm test -w @monyvi/mobile -- --runInBand budget-list-read-model-service useBudgets budget-dashboard-filter-session useBudgetDashboardActions BudgetDashboard BudgetDashboardFilters BudgetDashboardRow BudgetDashboardSkeleton budget-service budget-renew-integration budget-detail-read-model-service manual-qa-seed e2e-seed run-ci-e2e resolve-ci-e2e-scope budget-screens-style
npm test -w @monyvi/logic -- --runInBand budget-spending
npm run typecheck -w @monyvi/mobile
npm run lint -w @monyvi/mobile
```

Run i18n validation through existing repository command used by PR CI. If logic
production code changes, also run logic typecheck/lint; this plan should not
require that change.

## Expected Jest/RNTL coverage

### Read model

- expiry-first lifecycle derivation;
- Active includes healthy, warning, danger only;
- Paused excludes expired-paused; Expired includes active/paused custom expiry;
- exhaustive pure 3 x 4 x 4 filter predicate matrix;
- every matching ID once, every nonmatching ID absent;
- priority order and EN/AR name/ID tie-break;
- spend-only changes stay inside same priority order;
- zero spend and missing category;
- financial helper rejection propagation and input immutability.

### Filter session and hook

- fresh-runtime defaults `All / All / Active`;
- each setter preserves other two values;
- navigation/unmount remount for same user reads session value;
- authenticated-user change resets defaults and clears prior rows;
- explicit reset restores defaults;
- auth resolving/signed-out/current-user transitions;
- rapid filter changes ignore stale completion;
- observation change, refresh, retry, cleanup;
- initial failure versus post-success error;
- last valid rows and current filters retained.

### Dashboard, filters, rows, skeleton

- All/Category/Global order, selected state, and default;
- Period and Status current values always visible;
- every option and filtered reset;
- one virtualized list; no lifecycle section headings, hero/global card,
  carousel, dots, View all, FAB, or fixed summary;
- active rows show label, percentage, and progress;
- paused/expired rows show no percentage/progress;
- Resume/Renew visibility, confirmation, duplicate protection, and prefill;
- row detail navigation and deleted-category recovery;
- skeleton has tabs, two filter controls, compact rows, and no content spinner;
- no-budget, filtered-empty, retained-error states;
- long text/large amounts, EN/AR, RTL, light/dark, text scaling, reduced motion;
- accessible roles, selected/value states, row descriptions;
- bottom inset included exactly once.

## Manual-QA data

Target: `manual-qa@monyvi.test`.

Before seeding:

1. Inspect existing local Supabase/fixture data for this user.
2. Compare against matrix below.
3. Add only missing deterministic records.
4. Do not reset or fully reseed when existing data covers scenarios.
5. Keep fixture idempotent and update seed tests.

Required matrix:

- GLOBAL and CATEGORY across WEEKLY, MONTHLY, CUSTOM;
- healthy, near-limit, over-budget, zero-spend active;
- paused global/category and expired active/paused custom;
- deleted-category history;
- long name, long translated context, and large amount;
- combinations proving each scope/period/status option;
- at least one deterministic no-match combination.

### Local inspection evidence (2026-08-14)

- Inspected `manual-qa@monyvi.test` directly in local Supabase; 11 non-deleted
  budgets already cover GLOBAL/CATEGORY, WEEKLY/MONTHLY/CUSTOM,
  ACTIVE/PAUSED/derived EXPIRED, near-limit, over-budget, zero-spend,
  deleted-category history, long name, and large amount.
- Existing rows include two expired custom budgets ending 2026-08-13 and one
  future paused custom global budget.
- No missing scenario found. Database left unchanged; no reset or reseed run.

Local preparation:

```powershell
npm run supabase:start:local
$env:MANUAL_QA_PASSWORD = "<local-password>"
npm run manual:seed-user -w @monyvi/mobile
npm run mobile:local-supabase
```

Use `manual:reset-user` only when Mohamed explicitly requests clean data or
existing fixture is irreparably inconsistent.

## Verification evidence (2026-08-14)

- Focused mobile Jest: 18 suites and 184 tests passed.
- Budget financial regression: 1 suite and 24 tests passed in `@monyvi/logic`.
- Full mobile lint and i18n coverage checks passed.
- Mobile typecheck reached only the pre-existing Expo typed-route errors for
  `/privacy-policy` and `/terms` in `apps/mobile/app/auth.tsx`; no dashboard
  type error remains.
- Architecture, correctness, style, security, and QA coverage review found no
  remaining implementation issue. Dashboard presentation contracts now live in
  `apps/mobile/contracts`, outside the read-model service.
- Maestro and the physical-device matrix were not run because `adb devices -l`
  reported no connected Android target. They remain required manual handoff
  checks, not claimed as passed.

## Maestro

Profiles remain `dashboard-full` and `dashboard-filter-empty`. Budget suite
resets/reseeds dedicated E2E user before every flow.

```powershell
$env:E2E_SUPABASE_MODE = "local"
$env:E2E_BUDGET_PROFILE = "dashboard-full"
npm run e2e:reset -w @monyvi/mobile
npm run e2e:seed -w @monyvi/mobile
npm run e2e:flow:local -w @monyvi/mobile -- e2e/maestro/budgets/dashboard-filtering.yaml

npm run e2e:reset -w @monyvi/mobile
npm run e2e:seed -w @monyvi/mobile
npm run e2e:flow:local -w @monyvi/mobile -- e2e/maestro/budgets/dashboard-lifecycle-actions.yaml

$env:E2E_BUDGET_PROFILE = "dashboard-filter-empty"
npm run e2e:reset -w @monyvi/mobile
npm run e2e:seed -w @monyvi/mobile
npm run e2e:flow:local -w @monyvi/mobile -- e2e/maestro/budgets/dashboard-filtering.yaml

Remove-Item Env:E2E_BUDGET_PROFILE
Remove-Item Env:E2E_SUPABASE_MODE
```

Suite run:

```powershell
$env:E2E_CI_SUITES = "budgets"
npm run e2e:local -w @monyvi/mobile
Remove-Item Env:E2E_CI_SUITES
```

Maestro covers visible defaults, representative combined filters, reset, detail,
Resume cancel/confirm, and Renew prefill. Injected failures, exhaustive 48
combinations, accessibility semantics, and exact geometry remain Jest/RNTL or
manual evidence.

## Timed acceptance

### SC-006 filter commit

- Supported Android device/build.
- Temporary development-only `performance.now()` probes.
- Measure five consecutive transitions across scope, period, and status.
- Every value at most 1,000 ms.
- Record all values and maximum; remove probes before PR.

### SC-011 first Create journey

- Fresh no-budget state.
- Measure first interactive dashboard frame to visible Create Budget form.
- Three trials, each at most 10 seconds.
- Record device/build/results.

## Manual-only device matrix

- EN/AR and LTR/RTL.
- Light/dark.
- Portrait/landscape and available large-width target.
- Standard and maximum supported font scale.
- TalkBack reading order and selected filter/value announcements.
- Reduced motion.
- Android gesture and three-button navigation.
- Final row reachability and filter-selector bottom clearance.
- Pixel comparison against approved Active, Paused, and Expired mockups.
- In-session navigation restore and true cold-launch defaults.

## PR coverage matrix

| Scenario                                            | Automated coverage           | Maestro                      | Manual-only                   |
| --------------------------------------------------- | ---------------------------- | ---------------------------- | ----------------------------- |
| Derived status, AND filters, ordering, exactly once | Service/hook Jest            | Representative combinations  | Full visual scan              |
| Defaults, session restore, fresh reset              | Session/hook/component Jest  | Defaults and navigation back | True process cold start       |
| Unified row and removed old hierarchy               | Dashboard/row Jest           | Visible list                 | Pixel comparison              |
| Active progress; paused/expired omission            | Row Jest                     | Lifecycle flow               | Theme/font matrix             |
| Resume/Renew/detail/deleted category                | Service/route/component Jest | Lifecycle flow               | Device confirmation/prefill   |
| Skeleton, empty, retained error                     | Component/hook Jest          | Filtered empty               | Transition quality            |
| EN/AR, RTL, accessibility, safe area                | Component assertions         | Basic reachability           | TalkBack, contrast, nav modes |
| Financial and ownership invariants                  | Logic/service regressions    | Not duplicated               | Offline/device smoke          |
| Filter timing and Create timing                     | Deterministic correctness    | Not performance harness      | Timed evidence                |
