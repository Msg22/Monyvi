# Quickstart: Premium Budget Detail

## Preconditions

- Worktree: `E:/Work/My Projects/Monyvi-issue223`.
- Branch: `387-budget-detail-redesign`.
- Approved issue #223 mockup, [spec.md](./spec.md), and clarification session
  are source of truth.
- Secondary worktree must use the main workspace `node_modules` junction; never
  run `npm install` or `npm ci` here.

## Strict TDD order

1. Document finalized Budget Detail business decisions.
2. Write failing pace and shared primitive tests.
3. Implement pure pace logic and compatible PageHeader/Skeleton changes.
4. Write failing read-model and dependency-observation tests.
5. Implement bounded shaped read model and observations.
6. Write failing hook/action tests; implement lifecycle state and cancellation.
7. Write failing component and route tests against the approved contract.
8. Implement the final UI and localized copy.
9. Extend fixtures and Maestro contracts, then run the complete verification
   matrix.

Production code changes begin only after the focused test fails for the intended
reason.

## Focused automated checks

```powershell
npm test -w @monyvi/logic -- --runInBand budget-spending budget-period-utils budget-pace
npm test -w @monyvi/mobile -- --runInBand budget-detail-read-model-service budget-detail-observation useBudgetDetail useBudgetDetailActions BudgetDetailIdentity BudgetDetailOverview BudgetSpendingTrendChart SubcategoryBreakdown BudgetRecentTransactions BudgetDetailDangerZone BudgetDetailSkeleton budget-detail PageHeader Skeleton budget-screens-style budget-detail-deleted-category budget-maestro-flows e2e-seed manual-qa-seed run-ci-e2e resolve-ci-e2e-scope
npm run typecheck -w @monyvi/logic
npm run typecheck -w @monyvi/mobile
npm run lint -w @monyvi/logic
npm run lint -w @monyvi/mobile
npm run i18n:check -w @monyvi/mobile
```

### Pre-change baseline — main at `f1f75ea`

- Budget logic: 53/53 focused tests passed.
- Mobile Budget Detail/service/seed/runner baseline: 135/135 pre-existing tests
  passed. Two newly written PageHeader RED tests then failed for the intended
  missing 44dp labelled Back and icon-plus-label behavior.
- Logic typecheck passed.
- Mobile lint passed.
- i18n coverage passed.
- Mobile typecheck had two unrelated pre-existing generated-router errors in
  `app/auth.tsx` for `/privacy-policy` and `/terms`; these are baseline debt
  outside issue #223.
- `@monyvi/logic` has no package lint script, so final logic lint uses the
  repository ESLint entry point or its existing package gate rather than
  claiming a nonexistent command.

## Fixture inspection

Target manual user: `manual-qa@monyvi.test`.

Before changing data:

1. Inspect current local Supabase rows for the user.
2. Compare them with the final manual matrix.
3. Add only missing idempotent categories, budgets, transactions, and pause
   intervals.
4. Preserve existing rows; do not reset or fully reseed unless Mohamed asks.
5. Update seed assertions with every new deterministic record.

Required evidence:

- active healthy, near-limit, over-budget, paused, expired, and zero-spend;
- global, category, and deleted-category identities;
- L2/L3 descendant transactions with deterministic counts and percentages;
- multiple weeks, a partial final week, and a long custom period over four
  weeks;
- more than six matching recent transactions;
- completed pause window with transactions both inside and outside it;
- long Arabic/English name, large currency values, and no-data sections;
- disposable delete target whose transactions can be verified afterward.

### Inspection evidence — 2026-08-18

Read-only local Supabase inspection confirmed the user already exists with 13
non-deleted budgets, 5 custom categories, and 10 transactions. Existing rows
already cover healthy, near-limit, over-budget, paused, expired, zero-spend,
global, category, deleted-category, long-name, large-limit, and weekly/monthly/
custom states. No reset or full reseed is needed.

Only these deterministic gaps may be added:

- an accessible L2/L3 category hierarchy with descendant spending, exact counts,
  and percentages;
- more than six matching transactions distributed across multiple weekly
  buckets, including a partial final bucket;
- one completed pause interval with matching transactions both inside and
  outside the excluded window;
- one long custom-period detail fixture whose spending spans more than four
  weeks;
- one disposable delete budget with a retained historical transaction;
- one long Arabic identity fixture if existing localized system categories do
  not exercise the same layout.

The fixture update must remain idempotent and preserve all existing rows.

## Maestro

Use dedicated idempotent E2E profiles; destructive Delete uses its own
resettable profile.

```powershell
$env:E2E_CI_SUITES = "budgets"
npm run e2e:local -w @monyvi/mobile
Remove-Item Env:E2E_CI_SUITES
```

Journeys:

- Active detail hierarchy, Edit header, horizontal chart, transaction Edit and
  return refresh.
- Pause cancel/confirm, paused historical progress, Resume cancel/confirm.
- Expired state without lifecycle action and empty-section treatments.
- Delete cancel, Delete confirm, dashboard removal, and transaction retention.

## Manual-only device matrix

- Pixel comparison with approved mockup.
- English/Arabic, LTR/RTL, light/dark.
- 320–360dp phone, landscape/tablet where available, standard/max font scale.
- TalkBack reading order, chart summaries, action names, busy/disabled states.
- Reduced motion and animation cleanup quality.
- Horizontal chart gesture nested in vertical page scrolling.
- Android gesture and three-button navigation bottom clearance.
- Offline Pause/Resume/Delete and local observation updates.

## Delivery gates

- #228, #229, and #230 remain separate PRs.
- PR #223 must not weaken or skip any failing suite.
- Before merge, verify green Budget Detail coverage and green Budgets, Live SMS,
  and SMS Sync suites on current main or the exact combined candidate commit.

## Implementation verification — 2026-08-18

### Automated evidence

- Focused budget logic Jest: 3 suites, 67 tests passed.
- Focused mobile Jest: 23 suites, 190 tests passed.
- Budget Detail route coverage: 94.25% statements, 88.88% branches, 100%
  functions, and 97.5% lines.
- Manual fixture coverage: 100% statements, branches, functions, and lines.
- Logic typecheck passed.
- i18n key parity, Arabic sanity, and hardcoded-copy checks passed.
- Mobile typecheck reaches only the pre-change generated-router errors in
  `app/auth.tsx` for `/privacy-policy` and `/terms`; no issue #223 file fails.
- Focused logic ESLint, custom ESLint-rule tests, and the full mobile lint
  command passed.

### Inspection-led local QA fixture

The second idempotent seed run preserved existing rows and added only the
verified gaps. A direct local Supabase read confirmed:

- `QA Detail Long Custom`, `QA Disposable Detail Budget`, and the long Arabic
  detail budget all exist;
- four accessible `QA Detail` hierarchy categories exist;
- ten deterministic detail/delete transactions exist;
- the completed pause interval uses finite numeric boundaries; and
- `QA Retained After Budget Delete` exists independently of the disposable
  budget.

The optional linked market-rate import was skipped because this checkout is not
linked to a remote Supabase project. That warning does not affect Budget Detail
fixtures or local user data.

### Coverage matrix

| Manual scenario                                                                 | Automated coverage                                                                          | Device-only remainder                              |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Active, warning, over-budget, zero, paused, expired, deleted-category detail    | Read-model, hook, route, overview, identity Jest                                            | Pixel comparison in final device matrix            |
| Edit header and observation-driven changed name/limit/date/status               | Route Jest; active Maestro Edit/back and transaction edit to `777 EGP`                      | Physical navigation feel                           |
| Pause/Resume cancel, confirm, failure, duplicate, stale lifecycle/session/route | Action-hook + route Jest; lifecycle Maestro cancel/confirm with observed-state waits        | Offline physical-device latency                    |
| Weekly buckets, partial week, pace precision, >100%, pause exclusion            | Logic/read-model/chart Jest; active Maestro visible chart/exclusion                         | Horizontal nested gesture and TalkBack exploration |
| Category hierarchy, counts, percentages, empty category/global rules            | Read-model + breakdown Jest; seeded L1/L2/L3 fixture                                        | Max-font visual inspection                         |
| Newest six recent transactions and Edit Transaction refresh                     | Read-model/recent/route Jest; active Maestro edit and refreshed amount                      | TalkBack row reading order                         |
| Delete cancel/failure/success and transaction retention                         | Service/action/route Jest; isolated delete Maestro dashboard absence + retained transaction | Destructive-copy visual inspection                 |
| Loading, initial/refresh errors, retry, missing/inaccessible/sign-out           | Hook/route/skeleton Jest                                                                    | Transient animation quality                        |
| English/Arabic, LTR/RTL, light/dark, large text, reduced motion                 | Component/route/style/Skeleton Jest                                                         | Physical font-scale, theme, and RTL pixel QA       |
| Android gesture/three-button bottom clearance                                   | Focused safe-area Jest                                                                      | Physical navigation-mode overlap check             |

### Local Maestro attempt

- The `Pixel_7` emulator booted and the app produced a complete Android bundle
  from the main checkout after the secondary-worktree Metro junction could not
  resolve `react-native-url-polyfill/auto`.
- The Budgets suite seeded its local Supabase profile successfully, but the
  shared `ci-auth-bootstrap.yaml` failed after 7m 57s because none of the
  expected post-onboarding home/currency controls became visible.
- No Budget Detail feature flow ran, so this attempt is recorded as an
  infrastructure/bootstrap blocker, not passing E2E coverage. Maestro artifacts:
  `C:\\Users\\Mohamed\\.maestro\\tests\\2026-08-18_215024`.
- Physical-device pixel comparison, TalkBack, maximum font scale, RTL,
  gesture-navigation, and three-button-navigation checks remain manual-only and
  were not executed in this unattended run.

### Delivery dependency snapshot

- #228, #229, and #230 remain open and have no pull request attached.
- Current main `f1f75ea` has green Android Build Verification, E2E scope, Code
  Quality, Accounts, Transactions, and Recurring Payments jobs.
- Current main still fails Android E2E for Budgets, Live SMS, and SMS Sync.
  These remain separate delivery gates and are not changed or skipped by #223.
