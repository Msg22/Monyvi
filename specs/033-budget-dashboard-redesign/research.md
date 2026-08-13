# Phase 0 Research: Premium Budgets Dashboard

## Decision 1: Derive one exclusive lifecycle section

**Decision**: After the selected-period filter, classify every enriched budget
once with this precedence:

1. expired custom -> Needs attention;
2. otherwise persisted `PAUSED` -> Paused;
3. otherwise `warning` or `danger` metrics -> Needs attention;
4. otherwise `GLOBAL` -> Overall budgets;
5. otherwise `CATEGORY` -> Category budgets.

**Rationale**: The current independent filters duplicate paused category budgets
and the single `.find()` hides global budgets. A single classifier makes FR-002
provable and preserves expiry-over-pause clarification A.

**Alternatives rejected**:

- Add persisted `EXPIRED`: unnecessary schema/sync expansion for a state derived
  from custom-period dates.
- Infer expiry from `PAUSED`: auto-pause and manual pause share the same
  persisted status, so the inference is false.
- Keep independent section filters: cannot guarantee exactly-once membership.

## Decision 2: Keep expired budgets in metric enrichment

**Decision**: Remove the list service's early exclusion of active expired custom
budgets. Calculate their existing metrics, then classify them as expired before
considering persisted pause status.

**Rationale**: A budget must remain visible while auto-pause is pending, fails,
or has already changed the status. Existing spending calculations are still
useful historical display data and remain unchanged.

**Alternative rejected**: Depend on the focus-triggered auto-pause command to
make the record visible. That creates a transient disappearance and hides
failures.

## Decision 3: Evolve the existing service and inject category lookup data

**Decision**: Retain `budget-list-read-model-service.ts`. Pass the accessible
category map already maintained by the authenticated private runtime into its
pure read-model builder. Emit display-ready category label state instead of
looking up categories in a card.

**Rationale**: The Categories provider already performs one user-accessible
WatermelonDB observation. Reusing its plain map avoids a duplicate query and
removes data/presentation shaping from `BudgetCategoryCard`.

**Alternatives rejected**:

- Query categories per card: violates presentation boundaries and amplifies
  reads.
- Add another categories observation to the budget hook: duplicates existing
  private runtime state.
- Resolve labels directly in the route: route/container components must not
  shape business read models.

## Decision 4: Model the carousel as page groups

**Decision**: Use `GLOBAL_BUDGET_MIN_CARD_WIDTH = 320` dp and
`GLOBAL_BUDGET_CARD_GAP = 16` dp, compute the maximum whole visible-card count,
and build immutable viewport-width page groups. Render a horizontal `FlatList`
whose items are complete page groups. Use fixed layout metadata and stable keys.

**Rationale**: The approved behavior is group paging, not partially revealed
card-by-card scrolling. React Native's
[FlatList](https://reactnative.dev/docs/flatlist) supports horizontal
virtualization, viewability callbacks, `getItemLayout`, and programmatic index
recovery. Page grouping directly proves `ceil(total / visibleCount)` and
prevents cropped cards. The 320 dp baseline preserves the approved phone
mockup's readable card and 16 dp is the approved inter-card rhythm. It is the
threshold for adding cards; a narrower container uses one full-available-width
card. Tests lock 319/320 dp and the 655/656 dp transition to two cards.

**Alternatives rejected**:

- Horizontal `ScrollView`: eagerly renders all content and provides a weaker
  viewability contract; React Native recommends virtualized lists for growing
  data.
- Card-by-card snap points: conflicts with page indicators that represent
  complete visible groups.
- Fixed “phone/tablet” counts: breaks foldables, split screen, landscape, and
  future widths.

## Decision 5: Measure responsive width and preserve a stable anchor

**Decision**: Combine the actual carousel container width with
[`useWindowDimensions`](https://reactnative.dev/docs/usewindowdimensions). When
filtering, lifecycle changes, or resize regroup pages, preserve the first
currently visible eligible budget ID. Find its new page; otherwise select page
zero.

**Rationale**: Window dimensions update on rotation and resizing, while
container measurement accounts for page padding. Stable IDs survive sorting and
regrouping; numeric page indices do not.

**Alternatives rejected**:

- Preserve old page index: can point at unrelated budgets after regrouping.
- Always reset to page one: violates the approved clarification and disorients
  users.
- Preserve scroll offset: offsets become invalid when page/card widths change.

## Decision 6: One virtualized vertical row model

**Decision**: Use one outer vertical `FlatList` of dashboard layout rows. Pair
healthy category budgets in a pure layout helper; render attention and paused
cards as full-width rows. Put the global carousel in the list header/first
block.

**Rationale**: Category budgets are not bounded. A single vertical list honors
the project's long-list rule, avoids nested same-axis virtualized lists, and
preserves the approved two-column category design.

**Alternative rejected**: A page-level `ScrollView` containing mapped section
lists renders every category card and will degrade as budget count grows.

## Decision 7: Preserve the last valid read model

**Decision**: `useBudgets` distinguishes initial loading from recoverable
refresh or action errors. Once a valid model exists, later
calculation/observation failures retain that model, expose friendly recovery
state, and ignore stale async completions.

**Rationale**: Clearing budgets makes a transient error look like financial data
was deleted. Hook lifecycle state is the correct boundary for cancellation and
last-success retention.

**Alternative rejected**: Cache inside the service. Services are plain
deterministic operations and should not retain React lifecycle state.

## Decision 8: Add Resume confirmation with the shared component

**Decision**: Use the existing shared `ConfirmationModal` presentation pattern.
The route owns selected-target/modal state; `useBudgetDashboardActions` owns
only async submission, cancellation, and recovery state. Cancel does nothing;
confirm submits once; failure leaves the observed paused card visible.

**Rationale**: Code inspection showed current budget Resume calls the command
directly. The reusable modal exists, but the claimed budget confirmation
behavior does not. Planning must not encode the false premise. The existing
`resumeBudget` command remains paused-only: a second or non-paused call rejects
and must not append a second pause interval. Duplicate taps are prevented at the
route/hook boundary, not redefined as service idempotence.

**Alternative rejected**: Continue direct Resume because the command is
reversible. It contradicts the approved UX and creates accidental lifecycle
changes.

## Decision 9: Renew uses a distinct create-source parameter

**Decision**: Dashboard navigation emits
`{ pathname: "/create-budget", params: { renewFrom: budgetId } }`. It never uses
the existing edit `id` parameter. Child issue #225 resolves the source, prefills
a new draft, and creates a new record.

**Rationale**: Passing the expired ID through the edit path would mutate
historical data. A distinct parameter makes create versus edit intent explicit
and testable.

**Alternative rejected**: Clone the record in the dashboard. Form defaults and
validation belong to the Create/Edit flow, and duplicating them would cross
issue boundaries.

## Decision 10: Consume, do not replace, safe-area work

**Decision**: Rebase after issue #219 / PR #222. Remove the old fixed budget
footer and FAB, then give the new vertical list one bottom content inset equal
to named base spacing plus the runtime bottom safe-area inset.

**Rationale**: Physical QA proved the old footer issue is local to the Budgets
stack, while other root/tab surfaces already work. Global root padding would
double-pad correct screens.

**Alternative rejected**: Wrap the app in global bottom padding. It regresses
Home, Accounts, Transactions, and gesture mode.

## Decision 11: Testing and seed strategy

**Decision**: Start with deterministic fixtures and failing tests. Extend the
manual-QA fixture only with missing lifecycle, period, carousel, zero-spend,
deleted-category, and long-copy scenarios; do not wipe already-valid user data.
Add two isolated budget E2E profiles selected through `E2E_BUDGET_PROFILE`:
`dashboard-full` for all periods, carousel, and lifecycle actions;
`dashboard-filter-empty` with no CUSTOM budgets for the Custom filtered-empty
journey. Reset/reseed the E2E user before each budget flow.

**Rationale**: Existing fixtures cannot prove the spec, and current tests assert
two obsolete behaviors: hidden expired customs and duplicated paused categories.
Manual data and automated E2E data have different reproducibility needs.

**Automation boundary**:

- Jest/RNTL: classifier precedence, locale-aware ordering, filters, exact
  membership, geometry, anchor reconciliation, RTL layout semantics, accessible
  labels, reduced motion, injected errors, Resume confirmation/failure, and
  Renew route payload.
- Maestro: visible sections/filters, Resume cancel/confirm, Renew navigation,
  and carousel reachability. Resume failure is excluded because no approved
  user-visible failure-injection harness exists.
- Manual-only: TalkBack announcement quality, contrast judgment, maximum device
  font, Android navigation-mode switching, rotation during an active gesture,
  timed SC-006 and SC-010 evidence, and final pixel-level safe-area
  verification.

## Decision 12: Make ordering and timed outcomes reproducible

**Decision**: The read-model builder receives active locale `en` or `ar` and
compares trimmed display names with
`Intl.Collator(locale, { sensitivity: "base", numeric: true, usage: "sort" })`;
equal names use budget ID as the final code-point tie-break. SC-006 uses
temporary development-only `performance.now()` probes for five transitions per
filter and removes them before PR. SC-010 uses three timed fresh no-budget
trials.

**Rationale**: Explicit collation removes platform/default-locale drift.
Separate timed device evidence measures user-perceived commits honestly without
turning deterministic unit tests or Maestro into a fake performance harness.
