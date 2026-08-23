# Feature Specification: Budget Management UI & Spending Progress Tracking

**Feature Branch**: `019-budget-management` **Created**: 2026-03-19 **Status**:
Draft **Input**: GitHub Issue #39 — "Implement Budgets management UI and
spending progress tracking"

## Clarifications

### Session 2026-03-19

- Q: Should a user be limited to one global budget at a time, or can they have
  multiple? → A: One global budget per currency and period type (e.g., one EGP
  monthly global and one USD monthly global are allowed, but not two EGP monthly
  globals).
- Q: If multiple transactions cross the alert threshold, should each trigger the
  alert modal? → A: Alert fires once per threshold crossing per budget period
  (first time crossing 80%, first time crossing 100%). Subsequent transactions
  don't re-trigger until the next period.
- Q: When a budget is paused, should new transactions still count toward
  spending? → A: Spending is frozen — new transactions in the category are
  ignored until the budget is resumed.
- Q: What should be the default filter on the Budgets dashboard? → A: Default to
  "All" — show all budgets regardless of period type. An "All" chip is shown
  alongside Weekly/Monthly/Custom.
- Q: How should budget deletion be modeled? → A: Use the existing soft-delete
  pattern (`tx.deleted = true`) consistent with `transaction-service.ts` and
  `edit-account-service.ts`. The `status` column remains ACTIVE/PAUSED only — no
  custom DELETED status needed.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - View Budgets Dashboard (Priority: P1)

As a user, I want to see all my active budgets at a glance so I can understand
my spending health without navigating to each budget individually.

**Why this priority**: The dashboard is the primary entry point for the budgets
feature. Without it, no other budget interactions are possible. It provides the
core value of spending visibility.

**Independent Test**: Can be fully tested by navigating to the Budgets screen
(via app drawer) and verifying that the global budget summary card and category
budget cards render correctly with their circular progress rings, spent amounts,
and status indicators.

**Acceptance Scenarios**:

1. **Given** a user has at least one active budget, **When** they navigate to
   the Budgets screen, **Then** they see a card-based dashboard with circular
   progress rings showing spending progress for each budget.
2. **Given** a user has a global budget set, **When** they view the dashboard,
   **Then** a hero card at the top shows the total spent vs. total budget limit
   with a large circular progress ring, the percentage used, and the number of
   remaining days in the current period.
3. **Given** a user has multiple category budgets, **When** they view the
   dashboard, **Then** each category budget appears as a card in a 2-column
   grid, each with its own circular progress ring, category name, and
   spent/limit amounts.
4. **Given** a budget's spending reaches or exceeds the alert threshold,
   **When** the user views the dashboard, **Then** the progress ring changes to
   amber (#D97706) and a warning indicator ("⚠️ Near limit") is shown.
5. **Given** a budget's spending exceeds 100% of the limit, **When** the user
   views the dashboard, **Then** the progress ring turns red (#EF4444), the
   percentage text turns red, and an "Over budget!" label is shown.
6. **Given** a user has no budgets, **When** they navigate to the Budgets
   screen, **Then** they see an empty state with an illustration, heading
   ("Start Budgeting Smarter"), a description, and a "Create First Budget" CTA
   button.

---

### User Story 2 - Create a New Budget (Priority: P1)

As a user, I want to create a budget (either global or category-specific) with a
limit, period, and alert threshold so I can track and control my spending.

**Why this priority**: Without budget creation, the feature has no content. This
is a co-equal P1 with the dashboard since the dashboard is meaningless without
budgets to display.

**Independent Test**: Can be fully tested by tapping the "+" or "New Budget"
button, filling in the form, and verifying the budget is created and appears on
the dashboard.

**Acceptance Scenarios**:

1. **Given** a user is on the Budgets dashboard, **When** they tap the "+ New
   Budget" pill button in the header, **Then** the budget creation form opens.
2. **Given** the creation form is open, **When** the user selects "Global" as
   the budget type, **Then** the category selector field is hidden since global
   budgets track all spending. An info icon or tooltip near the "Global" label
   explains: "Tracks all spending across every category."
3. **Given** the creation form is open, **When** the user selects "Category" as
   the budget type, **Then** the existing category picker component is shown,
   allowing them to select one category (L1 or L2).
4. **Given** the form is filled with a name, type, amount, period, and alert
   threshold, **When** the user taps "Create Budget," **Then** the budget is
   saved and the user is returned to the dashboard where the new budget appears.
5. **Given** the user selects "Custom" as the period, **When** the custom period
   option is activated, **Then** a date range picker bottom sheet opens with a
   calendar view, start/end date inputs, and quick presets (2 Weeks, 1 Month, 3
   Months, 6 Months).
6. **Given** the user adjusts the alert threshold slider, **When** they move the
   slider, **Then** the current percentage value (between 50% and 100%) is shown
   in real-time in amber text.
7. **Given** the user leaves required fields empty (name, amount), **When** they
   tap "Create Budget," **Then** validation errors are shown inline below the
   respective fields.

---

### User Story 3 - View Budget Detail (Priority: P2)

As a user, I want to tap on a specific budget card to see a detailed breakdown
of my spending within that budget, including trends, subcategory splits, and
recent transactions.

**Why this priority**: The detail view enhances understanding but the dashboard
alone provides sufficient value. Users can manage budgets without the detail
view in an MVP.

**Independent Test**: Can be tested by tapping a category budget card on the
dashboard and verifying the detail screen shows the circular progress ring, key
stats, spending trend chart, subcategory breakdown, and recent transactions.

**Acceptance Scenarios**:

1. **Given** a user taps a category budget card on the dashboard, **When** the
   detail screen loads, **Then** it shows an overview card with: circular
   progress ring, "spent" vs. "of budget" text, and three key stats (Remaining,
   Daily Average, Days Left) separated by vertical dividers.
2. **Given** a budget detail is open for a category budget, **When** the user
   scrolls down, **Then** they see a spending trend bar chart showing weekly
   spending bars for the current period, with a horizontal dashed line for the
   weekly average.
3. **Given** a budget detail is open, **When** the user views the subcategory
   breakdown section, **Then** they see a ranked list of subcategories with
   color-coded dots, amounts, percentages, and thin progress bars.
4. **Given** a budget detail is open, **When** the user views recent
   transactions, **Then** the last 6 transactions matching the budget's category
   are shown with category icon, merchant name, timestamp, and negative amount
   in red.

---

### User Story 4 - Edit an Existing Budget (Priority: P2)

As a user, I want to modify an existing budget's name, amount, period, or alert
threshold so I can adjust my spending targets as circumstances change.

**Why this priority**: Editing is essential for long-term use but a user can
delete and re-create budgets in the interim.

**Independent Test**: Can be tested by opening a budget's three-dot menu,
selecting "Edit Budget," changing a field, saving, and verifying the updated
values appear on the dashboard.

**Acceptance Scenarios**:

1. **Given** a user is on the budget detail screen, **When** they tap the "⋮"
   three-dot menu icon, **Then** a bottom sheet appears with three options:
   "Edit Budget," "Pause Budget," and "Delete Budget."
2. **Given** the user selects "Edit Budget" from the actions sheet, **When** the
   edit form opens, **Then** it is the same form as creation but pre-filled with
   the budget's current values.
3. **Given** the user modifies budget fields and taps "Save," **When** the save
   completes, **Then** the budget is updated and the detail screen reflects the
   new values.
4. **Given** a budget is of type "Global," **When** the edit form opens,
   **Then** the budget type selector is read-only (cannot be changed from Global
   to Category or vice versa).

---

### User Story 5 - Pause and Resume a Budget (Priority: P3)

As a user, I want to temporarily pause a budget without deleting it so I can
stop tracking during exceptional periods (vacations, Ramadan, etc.) and resume
later.

**Why this priority**: Pausing is a convenience feature. Users can manually
ignore budget alerts during unusual periods.

**Independent Test**: Can be tested by pausing a budget from the three-dot menu,
verifying it disappears from the active dashboard (or shows a paused indicator),
and then resuming it.

**Acceptance Scenarios**:

1. **Given** the user selects "Pause Budget" from the actions bottom sheet,
   **When** they confirm, **Then** the budget status changes to "PAUSED," it is
   visually distinguished on the dashboard (e.g., grayed out card or moved to a
   separate "Paused" section), and spending is frozen — new transactions in the
   category are not counted toward this budget.
2. **Given** a budget is paused, **When** the user opens its three-dot menu,
   **Then** the "Pause Budget" option changes to "Resume Budget."
3. **Given** a paused budget is resumed, **When** the budget returns to "ACTIVE"
   status, **Then** spending tracking resumes from the current point.
   Transactions created during the paused window are not retroactively included.

---

### User Story 6 - Delete a Budget (Priority: P3)

As a user, I want to delete a budget I no longer need so it doesn't clutter my
dashboard.

**Why this priority**: Deletion is a housekeeping action. It's important for
long-term use but not critical for initial feature value.

**Independent Test**: Can be tested by deleting a budget and verifying it is
removed from the dashboard.

**Acceptance Scenarios**:

1. **Given** the user selects "Delete Budget" from the actions bottom sheet,
   **When** they tap it, **Then** the existing `deleteConfirmationModal`
   component is shown asking the user to confirm the deletion.
2. **Given** the user confirms deletion, **When** the delete completes, **Then**
   the budget is soft-deleted and removed from the dashboard. The user is
   navigated back to the dashboard.
3. **Given** the user cancels deletion, **When** they tap "Cancel" on the
   confirmation dialog, **Then** the dialog dismisses and the budget remains
   unchanged.

---

### User Story 7 - Receive Budget Alert Notifications (Priority: P3)

As a user, I want to be alerted when my spending reaches or exceeds the alert
threshold I set so I can take corrective action before overspending.

**Why this priority**: Alerts are the proactive value of budgeting. However, the
visual dashboard indicators (amber/red rings) already provide passive feedback.
Notifications add push-based awareness but are not essential for MVP.

**Independent Test**: Can be tested by creating a budget with an 80% threshold,
adding transactions until spending crosses 80%, and verifying an in-app alert
modal appears.

**Acceptance Scenarios**:

1. **Given** a budget has an alert threshold of 80%, **When** the user creates a
   transaction whose category matches a budget and that transaction pushes
   spending to or above 80% of the budget limit, **Then** a warning alert modal
   is shown with amber theming, the budget name, progress bar, and "View Budget"
   / "Got It" buttons.
2. **Given** a budget's spending exceeds 100% of the limit, **When** the user
   creates a transaction whose category matches the budget and that transaction
   breaches the limit, **Then** an "Over Budget!" danger alert modal is shown
   with red theming, the exceeded amount, and "View Budget" / "Dismiss" buttons.
3. **Given** the user taps "View Budget" on an alert modal, **When** the
   navigation occurs, **Then** they are taken to the budget detail screen for
   the specific budget.
4. **Given** the user taps "Got It" or "Dismiss" on an alert modal, **When**
   they dismiss it, **Then** the modal closes and they remain on their current
   screen.

---

### User Story 8 - Filter Budgets by Period (Priority: P3)

As a user, I want to filter the dashboard view by period type (Weekly, Monthly,
Custom) so I can focus on specific budget timeframes.

**Why this priority**: Filtering is a usability enhancement. The default view
showing all active budgets is sufficient without filtering.

**Independent Test**: Can be tested by tapping a period filter chip and
verifying that only budgets matching that period are shown.

**Acceptance Scenarios**:

1. **Given** the user is on the Budgets dashboard, **When** they see the period
   filter chips, **Then** "All," "Weekly," "Monthly," and "Custom" are
   available, with "All" selected by default showing every budget regardless of
   period type.
2. **Given** the user taps a filter chip, **When** the filter is applied,
   **Then** only budgets matching that period type are shown on the dashboard.

---

### Edge Cases

- What happens when a user creates a category budget for a category that already
  has a budget in the same period? → The system should prevent duplicate budgets
  for the same category and period and show an error: "A budget for this
  category already exists for the selected period."
- Can a user have multiple global budgets? → One global budget per currency and
  period type is allowed (e.g., one EGP monthly and one USD monthly). If the
  user tries to create a second global budget with the same currency and period
  type, the system shows that a matching global budget already exists.
- How does the system handle mid-period budget creation? → Spending is
  calculated from the start of the current period (e.g., if a monthly budget is
  created on March 15, spending from March 1 onward is included).
- What happens when a budget's period ends? → The budget automatically resets
  for the next period. Weekly budgets reset every Sunday. Monthly budgets reset
  on the 1st. Custom budgets with a fixed end date become inactive (status →
  PAUSED) when the end date passes. Alert deduplication state
  (`alert_fired_level`) is reset to null when the period rolls over.
- What happens when a category is deleted that has a budget linked to it? → This
  only applies to user-created custom categories (system categories cannot be
  deleted). The budget should show the category as "[Deleted Category]" and stop
  accumulating new spending, but remain visible for historical reference until a
  dedicated delete-category flow handles cascading deletions.
- How is spending calculated for category budgets with subcategories? → Spending
  aggregation includes all transactions within the budget's category AND its
  subcategories (L2 and L3).
- What if a transaction currency differs from the budget currency? → Budgets
  count only transactions with the exact same currency. They do not convert
  transactions or fetch exchange rates.
- What happens when a user has no transactions in the budget period? → The
  dashboard shows 0% progress with "EGP 0 / [limit]" and all stat values at zero
  or default.
- What if multiple transactions cross the same threshold? → The alert fires only
  on the first transaction that crosses each threshold (80% warning, 100%
  danger) per budget period. Subsequent transactions above the threshold do not
  re-trigger the alert until the period resets.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST display a budgets dashboard with a card-based layout
  using circular progress rings to show spending vs. budget limit for each
  budget.
- **FR-002**: System MUST support two budget types: Global (all spending) and
  Category (single category, including its subcategories).
- **FR-003**: System MUST allow users to create budgets with: name, type
  (Global/Category), category (for Category type), amount (limit), period
  (Weekly/Monthly/Custom), and alert threshold (percentage, 50–100%).
- **FR-004**: System MUST display a global budget hero card at the top of the
  dashboard showing total spent, budget limit, circular progress ring,
  percentage used, and remaining days.
- **FR-005**: System MUST display category budgets in a 2-column card grid, each
  with a circular progress ring, category name, and spent/limit amounts.
- **FR-006**: System MUST color-code budget progress: green (#10B981) for under
  threshold, amber (#D97706) for near threshold, and red (#EF4444) for over
  budget.
- **FR-007**: System MUST provide a budget detail screen showing: overview card
  with progress ring and key stats, spending trend bar chart, subcategory
  breakdown, and recent related transactions.
- **FR-008**: System MUST support budget editing by reusing the creation form
  pre-filled with current values, accessible via a three-dot menu on the detail
  screen.
- **FR-009**: System MUST support budget pausing (status → PAUSED) and resuming
  (status → ACTIVE) via the three-dot menu, with visual distinction for paused
  budgets. When paused, spending is frozen and new transactions are not counted
  until the budget is resumed.
- **FR-010**: System MUST support budget deletion using the existing soft-delete
  pattern (`tx.deleted = true`), consistent with `transaction-service.ts`.
  Deletion is preceded by a confirmation dialog using the existing
  `ConfirmationModal`. The `status` column is not affected — deletion is handled
  via the `deleted` boolean column.
- **FR-011**: System MUST show an in-app alert modal immediately after a
  transaction is created if that transaction's category matches a budget and the
  new spending total crosses the alert threshold (warning state) or exceeds the
  budget limit (danger state). Alerts fire **once per threshold crossing per
  budget period** — subsequent transactions in the same period that remain above
  the threshold do not re-trigger the alert.
- **FR-012**: System MUST show an empty state with illustration, heading,
  description, and CTA button when no budgets exist.
- **FR-013**: System MUST display a date range picker with calendar view,
  start/end date inputs, and quick presets when the user selects "Custom" as the
  budget period.
- **FR-014**: System MUST prevent duplicate budgets for the same category and
  overlapping period. For global budgets, the system MUST allow at most one
  global budget per period type (e.g., one weekly global and one monthly global
  are allowed, but two monthly globals are not).
- **FR-015**: System MUST aggregate spending for category budgets by including
  all transactions in the budget's category and its subcategories (L2 and L3
  levels).
- **FR-016**: System MUST automatically calculate spending for the current
  budget period and reset at the start of each new period (Weekly: Sunday,
  Monthly: 1st of month).
- **FR-017**: System MUST persist one supported currency for each new budget.
  Creation defaults to the user's preferred currency and permits another
  supported selection before save; the saved currency cannot be changed.
- **FR-018**: System MUST prevent changing the budget type (Global ↔ Category)
  when editing an existing budget.
- **FR-019**: System MUST support period filter chips (All, Weekly, Monthly,
  Custom) on the dashboard to filter displayed budgets by period type. "All" is
  the default, showing every active budget.

### Key Entities

- **Budget**: A spending limit set by the user, either global (all categories)
  or category-specific. Key attributes: name, type (Global/Category), linked
  category, amount limit, immutable currency, period
  (Weekly/Monthly/Custom), custom date range (period_start, period_end), alert
  threshold percentage, and status (Active/Paused — deletion uses WatermelonDB's
  built-in sync-aware deletion, not a status value).
- **Category**: An existing Monyvi entity (3-level hierarchy: L1 Main, L2 Sub,
  L3 User-defined). Budgets link to categories at L1 or L2 level for scoped
  spending tracking.
- **Transaction**: An existing Monyvi entity (expense/income records). Budgets
  aggregate expense transactions by category and date range to calculate
  spending progress.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can create a new budget (name, type, amount, period,
  threshold) in under 60 seconds.
- **SC-002**: The budgets dashboard loads and displays all active budgets with
  accurate spending data within 2 seconds of navigation.
- **SC-003**: Budget spending progress (percentage, amount) reflects real-time
  transaction data — any new transaction is reflected in the budget dashboard
  within 1 second when returning to the budgets screen.
- **SC-004**: 100% of budget alerts trigger correctly when spending crosses the
  configured alert threshold or exceeds the budget limit.
- **SC-005**: Users can complete the full budget management lifecycle (create →
  view → edit → pause → resume → delete) without errors.
- **SC-006**: The empty state screen results in at least 80% of first-time users
  creating their first budget (measured by conversion from empty state view to
  budget creation).
- **SC-007**: Budget data persists correctly across app restarts and
  offline/online transitions via the existing sync mechanism.
- **SC-008**: All budget UI elements render correctly in both light mode and
  dark mode.

## Assumptions

- The `budgets` table already exists in the WatermelonDB schema and Supabase;
  no migration or backfill is needed. Pre-release budgets without a currency
  are recreated.
- Spending aggregation is performed locally using WatermelonDB queries
  (offline-first).
- Budget alerts (FR-011) are in-app modal alerts triggered only after a
  transaction is created whose category matches a budget and crosses the
  threshold. Alerts are NOT shown on navigation to the budgets screen. Push
  notifications for budget alerts are out of scope (tracked in a separate GitHub
  issue).
- The category selector in the budget form reuses the existing category picker
  component or a simplified version of it.
- The spending trend chart reuses the existing `react-native-gifted-charts`
  library (BarChart) already used in `MonthlyExpenseChart.tsx` in the stats
  components.
- Quick presets in the date range picker set relative dates from today (e.g., "1
  Month" = today to today + 30 days).
- Budget periods auto-recur: Weekly resets every Sunday, Monthly resets every
  1st. Custom periods with a fixed end date do not auto-recur — they become
  PAUSED when the end date passes.

## Out of Scope

- Push notifications for budget alerts (tracked in separate GitHub issue).
- Budget sharing or collaborative budgets (tracked in separate GitHub issue).
- Budget templates or AI-suggested budgets (tracked in separate GitHub issue).
- Historical budget performance across multiple periods (tracked in separate
  GitHub issue).
- Integration with recurring payments to predict future spending (tracked in
  separate GitHub issue).
