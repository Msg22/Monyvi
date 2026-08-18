# Phase 0 Research: Premium Budget Detail

## Decision 1: Preserve bounded service-owned aggregation

**Decision**: Extend `budget-detail-read-model-service.ts` and add a focused
observation service. The observer emits one current-user-owned period
transaction/accessible-category snapshot and the read-model service derives all
metrics, pace buckets, counts, exclusions, and recent rows from that snapshot.
One-shot reads use the same builder after one fetch of each input; observation
MUST NOT trigger a second recomputation fetch.

**Rationale**: Preserves issue #99 query bounds and keeps raw WatermelonDB access
outside hooks and components.

**Alternatives considered**: Per-row category queries, component context
lookups, hook-owned Watermelon queries, or repeated weekly reads.

## Decision 2: Add pure elapsed-budget-pace logic

**Decision**: Add app-independent helpers in `packages/logic/src/budget/` for
inclusive elapsed allowance, proportional weekly-bucket allowance, and
below/on/above classification at displayed currency precision.

**Rationale**: The approved insight and dashed pace bars require deterministic
math, while shared calculations belong in the logic package.

**Alternatives considered**: Reusing overall health status, component
arithmetic, equal full-week allocation for partial weeks, or omitting insight.

## Decision 3: Inject one reference time

**Decision**: Every read-model build receives one optional `now` value, with a
single production default captured at entry.

**Rationale**: Period bounds, days, expiry, and pace cannot disagree during one
render; tests remain deterministic.

**Alternatives considered**: Calling `new Date()` from several helpers or
freezing time globally.

## Decision 4: Shape immutable presentation DTOs

**Decision**: Return semantic identity icons, weekly rows, breakdown counts,
recent transaction rows, and pause-exclusion state from the read-model boundary.
Presentational components receive no raw DB models or category context.

**Rationale**: Satisfies service-layer separation and prevents deleted-category
lookups from crashing UI.

**Alternatives considered**: Keep raw DB models in props or move formatting into
DB models.

## Decision 5: Observe dependencies and refresh lifecycle boundaries

**Decision**: The service owns scoped budget-detail dependency observables. The
hook combines their revisions with focus, foreground, explicit Retry, and local
day rollover, cancels stale generations, and retains the last valid model.

**Rationale**: Transaction/category edits and period rollover must update without
restart while hooks remain lifecycle facades.

**Alternatives considered**: Budget-record observation only, route-local raw
queries, unconditional polling, or focus-only refresh.

## Decision 6: Isolate command state in an action hook

**Decision**: `useBudgetDetailActions` invokes existing `pauseBudget`,
`resumeBudget`, and `deleteBudget`, suppresses duplicates, logs structured
failures, and returns stable results/error keys. The route owns modal visibility,
navigation, and translated feedback.

**Rationale**: Commands remain local-first and scoped while async UI state does
not bloat the route or leak raw errors.

**Alternatives considered**: Direct route commands, service-owned alerts, or a
god hook combining reads and writes.

## Decision 7: Reuse the shared confirmation modal

**Decision**: Pause, Resume, and Delete use `ConfirmationModal` with
`dismissOnConfirm={false}` and `isConfirming`; only success or explicit cancel
closes it.

**Rationale**: Provides consistent pending/disabled/safe-area behavior and keeps
failed actions recoverable.

**Alternatives considered**: Native alerts, obsolete action sheet overlays, or
immediate lifecycle writes.

## Decision 8: Extend PageHeader compatibly

**Decision**: Allow `rightAction` to render an icon and label together with an
explicit icon color while preserving existing icon-only and label-only callers.
Make Back a labelled 44dp button.

**Rationale**: The approved pencil-plus-Edit action must use the shared header.

**Alternatives considered**: Custom detail header or a second header primitive.

## Decision 9: Use a fixed-axis, horizontally scrolling chart

**Decision**: Keep the y-axis outside a nested horizontal scroller. Render every
chronological bucket as an equal-width actual/pace pair with localized date
labels and an accessibility summary. Use system reduced-motion behavior and
cleanup for animations.

**Rationale**: Long custom periods remain readable without changing weekly
resolution or clipping labels.

**Alternatives considered**: Compress all weeks, show only four, aggregate
weeks, or add unapproved paging dots.

## Decision 10: Keep empty applicable sections visible

**Decision**: Category budgets retain an empty Category breakdown card; all
budgets retain an empty Recent transactions card. Global budgets omit Category
breakdown because it is not applicable.

**Rationale**: Matches clarification and distinguishes “none” from “not loaded.”

**Alternatives considered**: Hide empty sections or merge both states.

## Decision 11: Match skeleton geometry and reduced motion

**Decision**: Compose a dedicated detail skeleton for identity, overview, chart,
conditional breakdown, recent rows, and Danger zone. Update the shared Skeleton
primitive to stop shimmer under reduced motion and cancel its repeat on cleanup.

**Rationale**: Final geometry and accessibility requirements apply during
loading too.

**Alternatives considered**: Generic blocks, ActivityIndicator, or accepting the
existing infinite-animation debt.

## Decision 12: Preserve honest navigation semantics

**Decision**: Transaction rows open `/edit-transaction?id=<id>`. Breakdown rows
have no chevrons or action. Recent transactions has no View all until a
budget-scoped destination exists.

**Rationale**: Every visible navigation affordance must have a truthful target.

**Alternatives considered**: Decorative chevrons, unfiltered View all, or a new
category-detail flow.

## Decision 13: Keep stabilization work separate

**Decision**: #228, #229, and #230 remain separate PRs and release gates. The
#223 branch adds only its own Budgets E2E coverage and dependency verification.

**Rationale**: Auth lifecycle, Android runner focus, and Live SMS notification
logic are unrelated failure domains.

**Alternatives considered**: One broad PR or weakening/skipping failing suites.
