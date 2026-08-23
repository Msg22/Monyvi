# Feature Specification: Premium Budget Detail

**Feature Branch**: `387-budget-detail-redesign`  
**Created**: 2026-08-18  
**Status**: Ready for planning  
**Input**: User description: "Redesign Budget Detail for issue #223 using the
approved mockup and direct lifecycle actions. Include the valid remaining P2
from merged PR #226 and plan restoration of the failing Budgets, Live SMS, and
SMS Sync end-to-end suites on main."

## Scope and delivery coordination

This specification covers the user-facing Budget Detail redesign in issue
#223. The approved issue mockup and the decisions recorded in issue #223 are the
visual and product source of truth.

The sprint audit also found three valid delivery problems that must be planned
with this feature but must not be mixed into its visual implementation:

- #228 owns the valid PR #226 P2: dashboard filters must reset whenever the
  authenticated session ends, including expiry or revocation.
- #229 owns the shared Android end-to-end runner/focus failure affecting the
  Budgets and SMS Sync suites on main.
- #230 owns the distinct Live SMS auto-confirm notification failure on main.

These stabilization items may run in parallel with #223, but all three are
release-readiness dependencies and must be resolved before the final #223 merge
unless current evidence proves that a linked issue is already fixed by another
merged change. The #223 feature pull request remains limited to Budget Detail
behavior, presentation, and its own coverage.

### Approved mockup contract

The approved image attached in issue #223 defines this top-to-bottom visual
structure:

1. A Budget Detail header with Back and a labelled Edit action.
2. A budget identity region containing the applicable leading icon, budget name,
   lifecycle state, period, date range, and the eligible Pause or Resume action.
3. A spending overview card containing spent amount, limit context, percentage,
   horizontal progress, remaining amount, daily average spent, and days left.
4. A Weekly spending trend card comparing actual spending with budget pace and
   showing the date range represented by each week.
5. A Category breakdown card for category budgets.
6. A Recent transactions card.
7. A visually isolated Danger zone with an outlined Delete budget action.

The mockup's example amounts are illustrative. Existing calculation and data
semantics remain authoritative unless a requirement below explicitly states an
approved change.

## Clarifications

### Session 2026-08-18

- Q: How should the app decide whether spending is below, on, or above budget
  pace? → A: Compare cumulative eligible spending with the budget allowance
  elapsed by today.
- Q: How should percentage, progress, and pace appear for paused or expired
  budgets? → A: Keep historical percentage and progress visible, but hide the
  active pace message.
- Q: What should appear when Category breakdown or Recent transactions has no
  matching data? → A: Keep each applicable section visible with its own compact
  empty explanation.
- Q: How should the weekly trend handle more weekly columns than fit in its
  card? → A: Keep every chronological week and make the columns horizontally
  scrollable at a consistent readable width.
- Q: What identity icon should appear when no category icon is available? → A:
  Use a wallet/overall-spending icon for global budgets and a neutral category
  fallback for budgets whose category was deleted.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Understand budget health at a glance (Priority: P1)

As a user, I can open any budget and immediately understand its current
spending, limit, remaining amount, period progress, and lifecycle state in a
premium, readable hierarchy.

**Why this priority**: Understanding the budget is the primary reason to open
the detail screen; actions and supporting analysis depend on this context.

**Independent Test**: Open active, near-limit, over-budget, paused, expired,
and zero-spend budgets and verify that each state is clear without opening an
action menu or relying on color alone.

**Acceptance Scenarios**:

1. **Given** an active healthy budget, **When** the user opens its detail,
   **Then** the screen shows its name, lifecycle/health context, spending,
   limit, remaining amount, daily average spent, and remaining time in the
   approved hierarchy.
2. **Given** a near-limit or over-budget budget, **When** detail opens, **Then**
   the warning or over-budget meaning is stated with text and supporting visual
   treatment.
3. **Given** a paused budget, **When** detail opens, **Then** the paused state is
   explicit and no active-state action is implied.
4. **Given** an expired custom budget, **When** detail opens, **Then** its
   expired state is explicit and an invalid Pause or Resume action is absent.
5. **Given** a zero-spend budget, **When** detail opens, **Then** the overview
   remains meaningful and does not show invalid or missing numeric values.

---

### User Story 2 - Edit or change lifecycle directly (Priority: P1)

As a user, I can edit a budget from the header and pause or resume it from a
clearly labelled action beside its lifecycle status, without discovering a
three-dot menu or actions sheet.

**Why this priority**: The redesign specifically removes hidden actions and
makes the most common safe actions immediately discoverable.

**Independent Test**: From eligible active and paused details, exercise Edit,
Pause, Resume, cancellation, confirmation, duplicate taps, and command failure
without using an overflow menu.

**Acceptance Scenarios**:

1. **Given** any owned budget that can be edited, **When** the user selects Edit
   in the header, **Then** the existing edit journey opens for that budget.
2. **Given** an eligible active budget, **When** the user selects Pause, **Then**
   a confirmation prompt appears before any change is made.
3. **Given** a paused budget, **When** the user selects Resume, **Then** a
   confirmation prompt appears before any change is made.
4. **Given** a Pause or Resume confirmation, **When** the user cancels, **Then**
   no budget data changes and the detail remains open.
5. **Given** a confirmed Pause or Resume, **When** the command succeeds,
   **Then** the detail updates to the new lifecycle state without requiring an
   app restart.
6. **Given** a confirmed lifecycle command, **When** it fails, **Then** the
   prior trustworthy state remains visible and a friendly recovery message is
   shown.

---

### User Story 3 - Review spending evidence (Priority: P2)

As a user, I can inspect weekly spending, category distribution, and recent
matching transactions below the overview so I can understand what produced the
budget result.

**Why this priority**: Supporting detail makes the overview trustworthy while
remaining secondary to current status and actions.

**Independent Test**: Open global and category budgets with populated and
empty supporting data and verify the approved section order, values, and empty
states.

**Acceptance Scenarios**:

1. **Given** matching spending across the period, **When** detail opens,
   **Then** weekly trend values match the budget's existing calculation rules.
2. **Given** a category budget with descendant-category spending, **When**
   detail opens, **Then** its approved category breakdown remains accurate.
3. **Given** matching recent transactions, **When** detail opens, **Then** the
   newest eligible items appear in their existing order.
4. **Given** no breakdown or recent items, **When** detail opens, **Then** the
   applicable section remains in its approved position with a compact,
   section-specific empty explanation.
5. **Given** spending excluded by completed pause windows, **When** detail
   opens, **Then** an explanation appears only when excluded pause history
   actually affects the displayed period.

---

### User Story 4 - Delete deliberately and safely (Priority: P2)

As a user, I can find Delete in a visually separated Danger zone at the bottom
of the detail, understand its consequence, and confirm it deliberately.

**Why this priority**: Deletion is necessary but destructive and must not
compete visually with routine actions.

**Independent Test**: Scroll to the Danger zone, cancel once, then confirm once
and verify that the budget disappears while its historical transactions remain.

**Acceptance Scenarios**:

1. **Given** an owned budget, **When** the user reaches the bottom of detail,
   **Then** a separated Danger zone explains that deletion removes the budget
   from the dashboard but keeps its transactions.
2. **Given** the Danger zone, **When** the user selects Delete, **Then** a
   destructive confirmation prompt appears before any change.
3. **Given** the delete prompt, **When** the user cancels, **Then** no data
   changes and the detail remains open.
4. **Given** confirmed deletion, **When** deletion succeeds, **Then** the user
   leaves the deleted detail, the budget is absent from the dashboard, and
   existing transactions remain.
5. **Given** confirmed deletion, **When** deletion fails, **Then** the detail
   remains available and a friendly recovery message is shown.

---

### User Story 5 - Reach every state safely (Priority: P2)

As a user, I can read and operate Budget Detail in supported themes,
directions, text sizes, and system-navigation modes without content or actions
being hidden.

**Why this priority**: A premium screen is incomplete if actions become
unreachable or ambiguous on supported devices.

**Independent Test**: Verify the state matrix in English and Arabic, light and
dark themes, enlarged text, left-to-right and right-to-left layout, and gesture
and button navigation.

**Acceptance Scenarios**:

1. **Given** any supported system-navigation mode, **When** the user scrolls to
   the end, **Then** the Danger zone and its action clear the system boundary.
2. **Given** Arabic or right-to-left layout, **When** detail opens, **Then**
   reading order and logical action placement remain correct.
3. **Given** enlarged text or a long budget name, **When** detail opens,
   **Then** essential labels, values, and actions remain readable and reachable.
4. **Given** a loading detail, **When** data is pending, **Then** the skeleton
   matches the final screen regions and does not show an unrelated spinner.
5. **Given** a missing, deleted, or inaccessible budget, **When** detail is
   requested, **Then** a friendly not-found state appears without exposing
   another user's data.

### Edge Cases

- The budget is deleted while its detail is already open.
- The authenticated session ends while detail or a confirmation prompt is open.
- The user taps Pause, Resume, or Delete repeatedly while confirmation or the
  command is pending.
- A lifecycle observation arrives while a prior command response is still
  pending.
- The current period rolls over while detail remains mounted.
- A custom period expires while detail is open.
- Pause history exists but does not overlap the displayed period.
- Pause history overlaps only part of the displayed period.
- A category or descendant category was deleted after historical transactions
  were recorded.
- The budget has a long name, large amount, unsupported category icon, or zero
  remaining days.
- Weekly data exists while category breakdown or recent transactions is empty.
- Detail aggregation fails after a previously valid read model was displayed.
- Navigation returns from Edit with changed limit, dates, name, or status.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The screen MUST use the approved Budget Detail mockup and issue
  #223 decisions as its presentation source of truth.
- **FR-002**: The header MUST provide Back and a direct, labelled Edit action.
- **FR-003**: The header MUST NOT provide an overflow action or destructive
  action.
- **FR-004**: The screen MUST NOT render the previous actions sheet.
- **FR-005**: An eligible active budget MUST expose a labelled Pause action in
  the lifecycle-status region.
- **FR-006**: A paused, non-expired budget MUST expose a labelled Resume action
  in the lifecycle-status region.
- **FR-007**: An expired custom budget MUST show Expired and MUST NOT offer an
  invalid Pause or Resume action.
- **FR-008**: Pause and Resume MUST require confirmation before changing data.
- **FR-009**: Cancelling any lifecycle confirmation MUST perform no write.
- **FR-010**: While a lifecycle command is pending, duplicate submission MUST
  be prevented.
- **FR-011**: A successful lifecycle command MUST update the visible detail
  from the local source of truth without an app restart.
- **FR-012**: A failed lifecycle command MUST preserve the last trustworthy
  state and show friendly recovery feedback.
- **FR-013**: The screen MUST present the approved overview before supporting
  analysis sections.
- **FR-014**: The overview MUST preserve existing totals, percentages, limits,
  remaining amounts, averages, thresholds, and period calculations.
- **FR-015**: Lifecycle and health meaning MUST be communicated with text and
  accessible semantics, not color alone.
- **FR-016**: Weekly trend values and ordering MUST preserve existing budget
  calculation semantics.
- **FR-017**: Category breakdown MUST preserve descendant-category inclusion
  and existing aggregation semantics.
- **FR-018**: Recent transactions MUST preserve the current eligibility,
  newest-first ordering, and maximum item behavior.
- **FR-019**: Pause-window exclusions MUST preserve current calculation rules.
- **FR-020**: A pause-exclusion explanation MUST appear only when completed
  pause history actually excludes spending from the displayed period.
- **FR-021**: An applicable Category breakdown or Recent transactions section
  with no matching data MUST remain visible in its approved position and show a
  compact, section-specific empty explanation. The two empty states MUST NOT be
  combined into one message.
- **FR-022**: Historical budgets whose category no longer exists MUST remain
  understandable and MUST NOT fail detail loading solely because the category
  record is unavailable.
- **FR-023**: The previous footer Edit and Add transaction actions MUST be
  absent.
- **FR-024**: A visually separated Danger zone MUST appear at the bottom of
  scrollable content.
- **FR-025**: The Danger zone MUST explain that deleting the budget retains its
  transactions while removing the budget from the dashboard.
- **FR-026**: Delete MUST use the approved outlined destructive treatment and
  MUST require destructive confirmation.
- **FR-027**: Cancelling delete MUST perform no write; duplicate confirmed
  submissions MUST be prevented while deletion is pending.
- **FR-028**: Successful deletion MUST leave the deleted detail and preserve
  historical transactions.
- **FR-029**: Failed deletion MUST keep the detail available and show friendly
  recovery feedback.
- **FR-030**: Loading MUST use a skeleton whose regions and hierarchy match the
  final Budget Detail layout.
- **FR-031**: Missing, deleted, inaccessible, and initial read-failure states
  MUST be friendly, non-technical, and current-user scoped.
- **FR-032**: A refresh failure after valid data is shown MUST preserve the last
  trustworthy detail while exposing a recoverable error state.
- **FR-033**: Every visible value and action MUST remain reachable in supported
  themes, directions, text sizes, orientations, and system-navigation modes.
- **FR-034**: The bottom-most content and action MUST account for the device's
  actual safe boundary exactly once.
- **FR-035**: The redesign MUST NOT change database schema, synchronization
  contracts, budget uniqueness, currency rules, or renewal behavior.
- **FR-036**: Resume-time decisions about previously excluded transactions MUST
  remain outside this feature and continue to be tracked by issue #107.
- **FR-037**: The feature MUST retain current-user ownership checks for every
  read and command.
- **FR-038**: All user-visible additions and error messages MUST be available in
  supported languages.
- **FR-039**: The identity region MUST show a leading icon, budget name,
  lifecycle state, period, and date range as a single readable group, with the
  eligible Pause or Resume action visually adjacent but separately operable. A
  category budget MUST use its accessible category icon, a global budget MUST
  use the wallet/overall-spending icon, and a budget whose category was deleted
  MUST use a neutral category fallback icon.
- **FR-040**: The overview MUST match the approved mockup anatomy: a labelled
  spent amount, limit context, percentage with "of budget" context, horizontal
  progress with start/end anchors and current-position marker, followed by
  three divided summary values for Remaining, Daily average spent, and Days
  left.
- **FR-041**: The overview MUST preserve the existing daily-average-spent
  calculation, label it "Daily average spent", present it as a per-day value,
  and MUST NOT relabel it "Safe to spend" because that would imply a different
  financial calculation.
- **FR-042**: The Weekly spending trend MUST match the approved mockup anatomy:
  sentence-case heading, accessible legend for actual spending and budget pace,
  chronological weekly columns with currency values and represented date
  ranges, and a textual pace insight that does not rely on color alone. The
  insight MUST classify spending as below, on, or above pace by comparing
  cumulative eligible spending with the budget allowance elapsed by today over
  the same inclusive budget period; values equal at the currency's displayed
  precision are on pace. When all weekly columns do not fit, the chart MUST
  preserve every chronological bucket in a horizontally scrollable region with
  consistent readable column widths and no compressed or clipped labels. Each
  dashed bucket-pace value MUST allocate the unchanged budget limit in
  proportion to that bucket's inclusive local-calendar-day count, including a
  partial first or final bucket; actual weekly spending values remain unchanged.
- **FR-043**: Category breakdown rows MUST match the approved compact anatomy:
  category icon, name, matching-transaction count, amount, percentage, row
  separators, and accessible color-independent percentage meaning.
- **FR-044**: Recent transaction rows MUST match the approved compact anatomy:
  category icon, counterparty or fallback label, date, amount, and row
  separators, while preserving the eligibility, ordering, and maximum-item
  rules in FR-018.
- **FR-045**: A recent-transaction row MUST show a chevron and open that
  transaction in the existing Edit Transaction journey. Category-breakdown
  rows MUST NOT show chevrons or imply navigation because no category-detail
  route exists. The Recent transactions card MUST NOT show "View all" until an
  honest budget-scoped transaction-list destination exists.
- **FR-046**: Paused and expired budgets MUST retain their historical spending,
  percentage, and progress presentation. Their Weekly spending trend MUST NOT
  show the below/on/above active pace message until the budget is active again.

### Key Entities

- **Budget detail**: The current-user-owned budget plus lifecycle, period,
  currency, limit, and category context required to present one detail screen.
- **Spending overview**: Existing calculated spending, percentage, remaining
  amount, average, health state, and time remaining for the budget period.
- **Weekly trend**: Existing period spending grouped into the approved weekly
  buckets.
- **Category breakdown**: Existing direct-child grouping for an owned category
  budget, including descendant spending.
- **Recent transaction**: An eligible transaction already included by the
  budget's current calculation and pause-exclusion rules.
- **Pause history**: Completed and current pause intervals used by existing
  calculations and by the conditional explanatory message.
- **Lifecycle action**: Edit, Pause, Resume, or Delete with eligibility,
  confirmation, pending, success, and failure states.

## Delivery Dependencies

- **DD-001 — #228**: Resolve the valid PR #226 P2 at the durable authentication
  boundary. Same-user sign-in after any sign-out must receive dashboard filter
  defaults, while ordinary in-session navigation still preserves selections.
- **DD-002 — #229**: Restore the Budgets and SMS Sync main-branch suites. The
  2026-08-17 evidence shows their first product journeys passed before a shared
  emulator-launcher focus failure stalled later preflight work.
- **DD-003 — #230**: Restore the Live SMS main-branch suite. The 2026-08-17
  evidence shows the transaction saved but the expected auto-confirm
  notification was not observed.
- **DD-004**: Each dependency MUST use a separate, focused pull request unless
  fresh evidence proves its minimum fix belongs directly to #223.
- **DD-005**: Before final #223 merge, required checks MUST include green
  Budget Detail coverage plus green Budgets, Live SMS, and SMS Sync suites on
  current main or on the exact combined candidate commit.

## Scope Boundaries

### Included

- Approved Budget Detail visual hierarchy and responsive states.
- Direct Edit, Pause, Resume, and Delete placement and confirmation behavior.
- Conditional pause-exclusion explanation.
- Detail loading, empty, missing, read-error, and action-error states.
- Focused unit, integration, end-to-end, accessibility, and device QA coverage.
- Minimal QA fixture additions only when inspection shows the final manual plan
  cannot be completed for `manual-qa@monyvi.test`.

### Excluded

- Dashboard redesign behavior completed by #224 and PR #226, except linked
  regression #228.
- Create/edit/renew redesign owned by #225.
- New financial calculations or changed pause-window semantics.
- Resume-time Include/Skip policy owned by #107.
- Database schema, backfill, sync-contract, or ownership-policy changes.
- Live SMS or SMS Sync product changes inside the #223 feature pull request.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In every supported budget lifecycle state, users can identify the
  budget's state and primary spending result without opening a secondary action
  surface.
- **SC-002**: Edit, Pause/Resume, and Delete are each discoverable in their
  approved locations; no overflow menu or actions sheet is needed.
- **SC-003**: One hundred percent of Pause, Resume, and Delete paths require
  confirmation, prevent duplicate pending submission, and preserve data on
  cancellation or failure.
- **SC-004**: Automated parity checks show no change to totals, percentages,
  thresholds, period buckets, category hierarchy, pause exclusions, or recent
  transaction eligibility.
- **SC-005**: All defined active, warning, over-budget, paused, expired,
  zero-spend, deleted-category, loading, empty, missing, and failure scenarios
  have deterministic automated coverage where the runner can control them.
- **SC-006**: English/Arabic, light/dark, left-to-right/right-to-left, enlarged
  text, and bottom-safe-area checks expose no clipped essential content or
  unreachable action.
- **SC-007**: The final coverage matrix maps every manual scenario to a focused
  automated check or marks it manual-only with a concrete harness limitation.
- **SC-008**: The Budgets, Live SMS, and SMS Sync main-branch suites are green
  under the linked stabilization acceptance criteria before final delivery.
- **SC-009**: The local QA user can exercise every final manual scenario after
  an inspection-led, minimal fixture update rather than a full reseed.
- **SC-010**: Automated query-bound checks prove that one detail input snapshot
  uses at most one current-user-owned period transaction query and one
  accessible-category query, with no per-week, per-breakdown-row, or
  per-transaction reads.

## Assumptions

- The mockup attached to issue #223 remains approved and supersedes the current
  Budget Detail presentation.
- Existing shared confirmation, header, button, typography, color, and icon
  patterns remain the design-system source unless the approved mockup shows a
  specific variation.
- Existing Budget Detail calculations and command services remain authoritative;
  this feature changes presentation and action orchestration, not financial
  policy.
- Issue #225 remains responsible for premium create/edit/renew presentation.
- The pipeline failures are current delivery blockers but are not authorization
  to weaken end-to-end assertions, skip suites, or add broad retries.
