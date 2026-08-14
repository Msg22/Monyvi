# Feature Specification: Unified Budgets Dashboard

**Feature Branch**: `385-budget-dashboard-redesign`  
**Created**: 2026-08-13  
**Revised**: 2026-08-14 **Status**: Approved for planning **Input**: User
description: "Replace the sectioned Budgets dashboard and global carousel with
one unified budget list. Let users filter by scope, period, and derived status
while preserving approved compact rows, lifecycle labels, icons, Resume/Renew
actions, financial calculations, and existing module behavior."

## Clarifications

### Session 2026-08-13

- Q: A custom budget was manually paused, then its end date passed. Which state
  wins? → A: Expired wins and exposes Renew, not Resume.
- Q: How is alphabetical order deterministic across English and Arabic? → A:
  Compare trimmed display names with the active `en` or `ar` locale using base
  sensitivity and numeric sorting, then use budget ID as final tie-break.

### Session 2026-08-14

- Q: Which primary dashboard organization is approved? → A: One unified list
  controlled by `All`, `Category`, and `Global` scope tabs; lifecycle sections
  and special global cards are removed.
- Q: Which filters remain visible? → A: Period and Status controls always show
  their current values. Period supports `All`, `Weekly`, `Monthly`, `Custom`.
  Status supports `All`, `Active`, `Paused`, `Expired`.
- Q: What are the initial filters? → A: Scope `All`, Period `All`, Status
  `Active`.
- Q: How are active results ordered? → A: Over-budget first, near-limit second,
  healthy third, alphabetically within each group.
- Q: How long do selections persist? → A: Preserve them while navigating away
  and back during the current signed-in app session; reset to defaults after
  fresh launch or authenticated-user change.
- Q: How do paused and expired rows show spending? → A: They show no percentage
  and no progress bar.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Browse One Unified Budget List (Priority: P1)

As a user, I want global and category budgets presented with one consistent row
design so I can scan them without learning different sections and card types.

**Why this priority**: The previous section hierarchy and special global cards
made the dashboard harder to understand and caused layout inconsistency.

**Independent Test**: Open the dashboard with active global and category
budgets, keep the default filters, and verify every active budget appears once
in one continuous list using the approved compact row design.

**Acceptance Scenarios**:

1. **Given** active global and category budgets exist, **When** the dashboard
   opens, **Then** one continuous list shows every matching active budget once.
2. **Given** budgets have different scopes or periods, **When** rows render,
   **Then** every row uses the same compact visual structure and communicates
   its scope/category and period without a special global card.
3. **Given** the result list is long, **When** the user scrolls to the end,
   **Then** all matching budgets and actions remain reachable without clipped
   content.
4. **Given** a budget changes spending state, **When** observed data updates,
   **Then** its row updates without duplicating or hiding the budget.

---

### User Story 2 - Combine Scope, Period, and Status Filters (Priority: P1)

As a user, I want scope tabs and visible Period and Status values so I can focus
on the exact budgets I need and always understand the active filter context.

**Why this priority**: Filtering replaces the removed lifecycle sections and is
the dashboard's primary navigation model.

**Independent Test**: Exercise every scope tab with every period and status
option and verify results satisfy all selected values simultaneously.

**Acceptance Scenarios**:

1. **Given** a fresh app launch, **When** the dashboard opens, **Then** `All`
   scope, `All` period, and `Active` status are selected and visible.
2. **Given** the user chooses `Category`, `Monthly`, and `Paused`, **When** the
   filters settle, **Then** only non-expired paused monthly category budgets
   appear.
3. **Given** the user chooses `Global`, `Custom`, and `Expired`, **When** the
   filters settle, **Then** only expired custom global budgets appear.
4. **Given** `All` status is selected, **When** matching data exists, **Then**
   active, paused, and expired rows appear in one ordered list.
5. **Given** no budgets match a combination, **When** it is applied, **Then** a
   filtered-empty state explains that no budgets match and offers a clear reset.
6. **Given** the user opens a budget and returns, **When** the current signed-in
   app session is still active, **Then** prior scope, period, and status
   selections remain selected.
7. **Given** the app starts fresh, **When** the dashboard opens, **Then** filter
   selections reset to `All / All / Active`.
8. **Given** the authenticated user changes, **When** the next user's dashboard
   opens, **Then** filters reset to `All / All / Active` and no prior user's
   results appear.

---

### User Story 3 - Understand State and Take Safe Action (Priority: P1)

As a user, I want each row to clearly show budget state and the correct direct
action so I can understand spending health or recover a paused/expired budget.

**Why this priority**: Removing lifecycle sections must not remove state clarity
or safe Resume/Renew journeys.

**Independent Test**: Prepare healthy, near-limit, over-budget, paused, expired,
zero-spend, and deleted-category budgets, then verify content, indicators,
ordering, and actions for each row.

**Acceptance Scenarios**:

1. **Given** an active budget, **When** its row renders, **Then** it shows its
   spending label, percentage, progress, spent amount, and limit.
2. **Given** a paused budget, **When** its row renders, **Then** it shows Paused
   and Resume but no percentage or progress bar.
3. **Given** an expired custom budget, including one previously paused, **When**
   its row renders, **Then** it shows Expired, expiry context, and Renew but no
   percentage or progress bar.
4. **Given** a paused budget, **When** Resume is tapped, **Then** the shared
   confirmation appears; cancel writes nothing and confirm submits once.
5. **Given** an expired budget, **When** Renew is tapped, **Then** a new-budget
   form opens with reusable source data prefilled and the historical budget is
   unchanged.
6. **Given** an active result set, **When** rows render, **Then** over-budget
   rows appear before near-limit rows, which appear before healthy rows;
   alphabetical order is stable within each group.
7. **Given** `All` status is selected, **When** all lifecycle states exist,
   **Then** order is Expired, Over Budget, Near Limit, Paused, Healthy, with
   stable alphabetical order inside each group.
8. **Given** a historical budget references a deleted category, **When** its row
   or detail is opened, **Then** it remains understandable and does not fail
   because the category record is missing.

---

### User Story 4 - See Trustworthy Loading and Recovery States (Priority: P2)

As a user, I want loading and failure states to preserve the dashboard's shape
and my last trustworthy data so temporary work does not look like deletion.

**Why this priority**: Financial data must not appear missing because of a
loading mismatch or recoverable read/action failure.

**Independent Test**: Exercise initial loading, no budgets, filtered empty,
refresh failure, action failure, and retry while comparing the skeleton with the
approved final layout.

**Acceptance Scenarios**:

1. **Given** initial data is loading, **When** the dashboard renders, **Then** a
   skeleton mirrors the scope tabs, two visible filter controls, and compact
   list rows without an indeterminate content spinner.
2. **Given** no budgets exist, **When** loading completes, **Then** a no-budget
   state provides the approved Create route.
3. **Given** filters produce no match, **When** loading completes, **Then** a
   distinct filtered-empty state keeps current selections visible.
4. **Given** a valid list has rendered, **When** refresh or metric calculation
   fails, **Then** the last valid list remains visible with friendly retry
   feedback.
5. **Given** Resume or Renew navigation fails, **When** failure is reported,
   **Then** the affected row remains visible and actionable.

---

### User Story 5 - Use the Dashboard Across Supported Devices (Priority: P2)

As a user, I want the unified dashboard to remain readable and operable across
themes, languages, text sizes, orientations, and system navigation modes.

**Why this priority**: Budget state and actions must remain trustworthy for all
supported presentation modes.

**Independent Test**: Run the approved matrix in English and Arabic, light and
dark themes, portrait and landscape, supported font scales, screen reader mode,
and Android gesture/three-button navigation.

**Acceptance Scenarios**:

1. **Given** English or Arabic is active, **When** the dashboard renders,
   **Then** tabs, filters, rows, status, amounts, and actions remain readable in
   correct layout direction.
2. **Given** a screen reader is active, **When** focus moves through controls
   and rows, **Then** selected filters, budget identity, scope, period, amount,
   state, and available action are announced.
3. **Given** light or dark theme, **When** any supported row state renders,
   **Then** text, icons, progress, labels, and actions retain sufficient
   contrast without relying on color alone.
4. **Given** gesture or button navigation, **When** the user reaches the final
   row, **Then** content and actions are unobscured and fully reachable.
5. **Given** the window size changes, **When** layout settles, **Then** rows
   remain full-width, readable, and uncropped without carousel state.

### Edge Cases

- No budgets exist.
- Budgets exist, but the selected combination matches none.
- Only global or only category budgets exist.
- Only one lifecycle state exists.
- An expired custom budget still has persisted `ACTIVE` status.
- A manually paused custom budget expires.
- A budget changes between healthy, near-limit, and over-budget while visible.
- A budget becomes paused or expired while its former status filter is active.
- A budget has zero spend or no matching transactions.
- A budget references a deleted user category.
- Names, category labels, amounts, currencies, or translations are long.
- Loading, observation, calculation, Resume, or Renew navigation fails.
- The user changes filters rapidly while metric calculation is pending.
- The app leaves and returns to the dashboard in-session, later cold starts, or
  changes authenticated user.
- Font scaling, RTL, reduced motion, orientation, or system navigation changes.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The dashboard MUST render all matching budgets in one continuous,
  scalable list; every matching budget MUST appear exactly once.
- **FR-002**: The dashboard MUST provide scope tabs in this order: `All`,
  `Category`, `Global`. `All` MUST be the default scope.
- **FR-003**: The Period filter MUST support `All`, `Weekly`, `Monthly`, and
  `Custom`; its current value MUST remain visible and `All` MUST be the default.
- **FR-004**: The Status filter MUST support `All`, `Active`, `Paused`, and
  derived `Expired`; its current value MUST remain visible and `Active` MUST be
  the default.
- **FR-005**: Scope, Period, and Status MUST combine using AND semantics. Every
  result MUST satisfy all three selected values.
- **FR-006**: Derived status MUST use expiry-first precedence: an expired custom
  budget is `Expired` regardless of persisted `ACTIVE` or `PAUSED`; otherwise
  persisted `PAUSED` is `Paused`; all remaining eligible budgets are `Active`.
- **FR-007**: `Active` MUST include healthy, near-limit, and over-budget
  spending states. Expired custom budgets MUST NOT appear under Active while an
  auto-pause write is pending or has failed.
- **FR-008**: All budgets MUST use the approved compact full-width row pattern.
  Scope, period, or lifecycle MUST NOT switch a result into a large global card,
  carousel card, standalone section card, or two-column grid.
- **FR-009**: Lifecycle sections, global carousel pagination, page dots,
  `View all`, and an arbitrary global summary footer MUST NOT appear.
- **FR-010**: Active rows MUST show identity, leading contextual icon,
  scope/category context, period, spent amount, limit, percentage, progress, and
  a text health label.
- **FR-011**: Paused rows MUST show identity, contextual icon, scope/category
  context, period, amount context, `Paused`, and Resume; they MUST NOT show a
  percentage or progress bar.
- **FR-012**: Expired rows MUST show identity, contextual icon, scope/category
  context, period/expiry context, amount context, `Expired`, and Renew; they
  MUST NOT show a percentage or progress bar.
- **FR-013**: Health and lifecycle meanings MUST use both text and visual
  treatment. Color alone is insufficient.
- **FR-014**: Active results MUST sort by priority: Over Budget, Near Limit,
  Healthy. With `All` status, results MUST sort by Expired, Over Budget, Near
  Limit, Paused, Healthy.
- **FR-015**: Within each priority group, results MUST sort by trimmed display
  name using the active English or Arabic locale with base sensitivity and
  numeric sorting; equal names MUST use stable budget ID as final tie-break.
  Spend-only changes MUST NOT reorder rows inside a group.
- **FR-016**: Filter selections MUST persist when the user navigates away and
  returns during the current signed-in app session. A fresh app launch or
  authenticated-user change MUST reset them to `All / All / Active`.
- **FR-017**: A filter change MUST atomically replace the visible result set and
  MUST ignore stale asynchronous results from an earlier selection.
- **FR-018**: Resume MUST use the shared confirmation pattern before invoking
  the existing user-scoped command. Cancel MUST write nothing and duplicate
  confirmation while submitting MUST be blocked.
- **FR-019**: Renew MUST open new-budget create mode with approved reusable data
  prefilled and MUST NOT mutate or edit the expired historical record.
- **FR-020**: Row presses MUST open the matching current-user-owned budget
  detail. Missing/deleted historical category data MUST NOT make the row or
  detail fail.
- **FR-021**: The primary Create action MUST use the shared page-header add
  pattern. No persistent dashboard floating create action is allowed.
- **FR-022**: Initial loading MUST use layout-matching placeholder shapes for
  tabs, both visible filter controls, and unified rows; content loading MUST NOT
  use an indeterminate spinner.
- **FR-023**: The dashboard MUST provide distinct no-budgets, filtered-empty,
  and recoverable error states. Reset from filtered-empty MUST restore
  `All / All / Active`.
- **FR-024**: After a valid model exists, refresh, computation, or direct-action
  failure MUST preserve the last valid visible rows and current filters while
  presenting friendly recovery feedback.
- **FR-025**: Elements not redesigned by the final mockup—the page header, add
  action, outer page spacing, typography scale, and color system—MUST retain
  their current approved appearance and behavior.
- **FR-026**: All rows and controls MUST support light/dark themes, LTR/RTL,
  supported text scaling, reduced motion, and complete accessible labels, roles,
  values, and selected states.
- **FR-027**: Bottom content spacing MUST consume the established issue #219
  safe-area ownership contract exactly once, keeping the final row/action clear
  of gesture and three-button navigation.
- **FR-028**: The redesign MUST NOT alter budget totals, percentages, threshold
  calculations, period calculations, pause-window exclusions, descendant
  category aggregation, currency behavior, uniqueness, ownership, offline
  availability, stored data shape, or cross-device consistency behavior.

### Key Entities

- **Budget**: Existing user-owned global or category spending limit with period,
  amount, lifecycle status, optional category, optional custom dates, and
  calculated spending metrics.
- **Scope Selection**: `All`, `Category`, or `Global` dashboard view.
- **Period Selection**: `All`, `Weekly`, `Monthly`, or `Custom` filter value.
- **Status Selection**: `All`, `Active`, `Paused`, or derived `Expired` filter
  value.
- **Budget Presentation State**: `Healthy`, `Near Limit`, `Over Budget`,
  `Paused`, or `Expired`, derived without adding a persisted status.
- **Unified Budget Row**: Display-ready, scope-neutral representation of one
  budget and its optional direct lifecycle action.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: For every tested filter combination, 100% of visible budgets
  satisfy selected scope, period, and status and no matching budget is omitted.
- **SC-002**: Every matching budget appears exactly once in the unified list.
- **SC-003**: On fresh launch, `All / All / Active` is visible and selected in
  100% of test runs; in-session navigation preserves changed selections.
- **SC-004**: Users can identify scope, period, and lifecycle/spending state for
  every visible budget without opening detail.
- **SC-005**: Across paused and expired test rows, 100% show no percentage and
  no progress bar while keeping Resume or Renew reachable in one tap.
- **SC-006**: Each of five consecutive scope, period, or status changes commits
  the correct combined result within 1,000 ms on the supported manual-QA device.
- **SC-007**: Across supported phone, tablet/large-window, portrait, and
  landscape states, 100% of resting rows are full-width, uncropped, and keep
  their text and actions reachable.
- **SC-008**: Screen-reader output identifies selected filters and complete
  budget state/action for every row in the accessibility matrix.
- **SC-009**: Initial loading skeleton geometry contains the same major layout
  regions as the final dashboard: scope tabs, two filters, and compact rows.
- **SC-010**: No existing verified total, percentage, pause exclusion, category
  aggregation, currency, ownership, uniqueness, offline, or cross-device result
  changes.
- **SC-011**: In a fresh no-budget state, users reach Create Budget within 10
  seconds in each of three timed trials on the supported phone target.

### Success-Criteria Measurement Rules

- SC-006 uses temporary development-only timing probes from selection input to
  committed matching rows, reports through structured development logging or an
  injected test callback, records device/build/all values/maximum, and removes
  probes before PR completion.
- SC-011 is measured from the first interactive dashboard frame until Create
  Budget is visible. Run three trials and record device/build/results.

## Assumptions

- The final approved Active, Paused, and Expired unified-list mockups from the
  2026-08-14 design session supersede the earlier section/carousel mockup
  attached to issue #224.
- Detail and Create/Edit visual redesigns remain covered by child issues #223
  and #225; existing Renew prefill integration remains in this dashboard
  journey.
- Existing domain and storage rules remain unchanged. `Expired` remains a
  derived dashboard status, not a stored status value.
- One current global budget per user and period and one current category budget
  per user/category/period remain the governing uniqueness rules. Expired custom
  history does not occupy the replacement slot.
- Existing warning and danger thresholds define Near Limit and Over Budget.
- Existing approved Resume confirmation and Renew create-source behavior are
  reused.
- Issue #219 / PR #222 safe-area ownership is already merged and is the layout
  contract; this feature adds no global padding workaround.
