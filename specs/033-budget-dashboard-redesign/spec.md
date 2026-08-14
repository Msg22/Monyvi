# Feature Specification: Premium Budgets Dashboard

**Feature Branch**: `385-budget-dashboard-redesign`  
**Created**: 2026-08-13  
**Status**: Draft  
**Input**: User description: "Implement issue #224, the approved Budgets
dashboard redesign under parent issue #218, with a responsive whole-card global
budget carousel, deterministic lifecycle sections, complete state visibility,
accessibility, themes, RTL, and safe-area behavior while preserving financial
calculations and business rules."

## Clarifications

### Session 2026-08-13

- Q: A custom budget was manually paused, then its end date passed. Which state
  wins? → A: Expired wins; show it in Needs attention with Renew.
- Q: When filtering, rotation, or lifecycle changes regroup the global carousel,
  what should remain visible? → A: Preserve the first currently visible eligible
  budget; if it is no longer eligible, move to page one.
- Q: What exact card width determines how many global budgets fit? → A: Use
  `GLOBAL_BUDGET_MIN_CARD_WIDTH = 320` dp and `GLOBAL_BUDGET_CARD_GAP = 16` dp;
  show the maximum whole count whose cards remain at least 320 dp wide.
- Q: How is alphabetical order made deterministic across English and Arabic? →
  A: Compare trimmed display names with `Intl.Collator` for the active `en` or
  `ar` locale using base sensitivity and numeric sorting, then use budget ID as
  the final tie-break.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - See Every Global Budget (Priority: P1)

As a user with global budgets for different periods, I want every matching
global budget to be visible and reachable in its single lifecycle section so I
can understand each spending limit without another valid budget being hidden.

**Why this priority**: The current dashboard can silently hide valid global
budgets. Correcting that visibility gap is the primary reason for this redesign.

**Independent Test**: Create healthy, attention-required, paused, and expired
global budgets across the supported periods, open the All filter, and verify
every budget is reachable exactly once; healthy active globals use the
responsive carousel with complete, readable cards.

**Acceptance Scenarios**:

1. **Given** a user has healthy active weekly, monthly, and custom global
   budgets, **When** the All filter is selected, **Then** every matching budget
   is reachable through the Overall budgets carousel.
2. **Given** the available width fits one readable global card, **When** the
   carousel is displayed, **Then** exactly one complete card is visible and no
   adjacent card is cropped.
3. **Given** the available width fits two or more complete equal-width cards,
   **When** the carousel is displayed, **Then** the maximum whole number that
   fits is visible and all visible cards have equal width and height.
4. **Given** the window width or orientation changes, **When** the dashboard
   settles into the new size, **Then** the visible-card count and pages are
   recalculated without cropped cards or unreachable budgets.
5. **Given** not all matching global budgets fit in one viewport, **When** the
   user views or swipes the carousel, **Then** restrained pagination indicators
   communicate the current page and the carousel rests on complete card groups.
6. **Given** every matching global budget fits in one viewport, **When** the
   carousel is displayed, **Then** pagination indicators are not shown.
7. **Given** filtering, rotation, or lifecycle changes regroup the carousel,
   **When** the first currently visible budget remains eligible, **Then** its
   new page stays visible; otherwise the carousel moves to page one.

---

### User Story 2 - Understand Budget Health at a Glance (Priority: P1)

As a user, I want active, attention-required, paused, and expired budgets placed
in clear sections so I can understand their state and next action without
opening each budget.

**Why this priority**: Paused and expired budgets currently look missing or
ambiguous, which damages trust in the dashboard.

**Independent Test**: Prepare healthy, warning, over-budget, paused, expired,
and zero-spend budgets and verify each appears once in the correct section with
an understandable status.

**Acceptance Scenarios**:

1. **Given** the dashboard contains multiple lifecycle and spending states,
   **When** the dashboard is displayed, **Then** it presents Overall budgets,
   Needs attention, Category budgets, and Paused sections in that order when
   each section has content.
2. **Given** a category budget is near its limit, over budget, or expired,
   **When** the dashboard is displayed, **Then** it appears in Needs attention
   with a text status that does not rely on color alone.
3. **Given** a healthy active category budget, **When** the dashboard is
   displayed, **Then** it appears in Category budgets.
4. **Given** a manually paused budget, **When** the dashboard is displayed,
   **Then** it remains visible in Paused with a clear Paused status and Resume
   action.
5. **Given** an expired custom budget, **When** the dashboard is displayed,
   **Then** it shows its expiry date and a Renew action instead of appearing as
   a generic paused budget.
6. **Given** a manually paused custom budget later reaches its end date,
   **When** the dashboard refreshes, **Then** it moves to Needs attention as
   Expired with Renew and no Resume action.
7. **Given** a budget qualifies for one dashboard section, **When** all sections
   are rendered, **Then** that budget appears exactly once.

---

### User Story 3 - Filter Without Losing Context (Priority: P2)

As a user, I want period filters to apply consistently to every dashboard
section so I can focus on weekly, monthly, or custom budgets without confusing
results.

**Why this priority**: Filtering is useful only if global, category, paused,
expired, and attention states obey the same rule.

**Independent Test**: Select All, Weekly, Monthly, and Custom in turn and verify
every visible section contains only budgets for the selected period.

**Acceptance Scenarios**:

1. **Given** budgets exist across all period types, **When** a period filter is
   selected, **Then** every dashboard section shows only matching budgets.
2. **Given** no budgets match a selected period, **When** the filter is applied,
   **Then** a filtered-empty state explains that no budgets match and provides a
   clear way to try another filter.
3. **Given** a user returns to All, **When** the filter is applied, **Then** all
   eligible budgets reappear in their correct sections.
4. **Given** spend values change while the selected period remains the same,
   **When** the dashboard updates, **Then** budgets retain stable alphabetical
   order within their sections unless their lifecycle classification changes.

---

### User Story 4 - Take Safe Lifecycle Actions (Priority: P2)

As a user, I want to resume a paused budget or renew an expired custom budget
from the dashboard so the next action is discoverable and safe.

**Why this priority**: State visibility without a clear recovery action leaves
paused and expired budgets stranded.

**Independent Test**: Use the direct Resume and Renew actions and verify their
approved confirmation or prefilled flow starts without changing unrelated
budgets.

**Acceptance Scenarios**:

1. **Given** a paused budget, **When** the user taps Resume, **Then** the shared
   confirmation prompt appears before the status changes.
2. **Given** the user cancels Resume, **When** the prompt closes, **Then** the
   budget remains paused.
3. **Given** an expired custom budget, **When** the user taps Renew, **Then** a
   prefilled creation flow opens and the expired historical budget remains
   unchanged.
4. **Given** an action fails, **When** the failure is reported, **Then** the
   budget remains visible in its prior section and the user receives a clear,
   friendly recovery message.

---

### User Story 5 - Use the Dashboard Across Supported Devices (Priority: P3)

As a user, I want the dashboard to remain readable and operable across themes,
languages, accessibility settings, screen sizes, and system navigation modes.

**Why this priority**: Financial state and actions must remain trustworthy and
reachable for every supported presentation mode.

**Independent Test**: Exercise the approved state matrix in light and dark
themes, English and Arabic, small and large widths, portrait and landscape,
screen-reader mode, and supported system navigation modes.

**Acceptance Scenarios**:

1. **Given** English or Arabic is active, **When** the dashboard is displayed,
   **Then** layout order, alignment, labels, actions, and carousel navigation
   remain understandable without clipped text.
2. **Given** a screen reader is active, **When** focus moves through the
   carousel, **Then** the current page, page count, budget identity, period,
   amount, progress, and lifecycle state are announced.
3. **Given** light or dark theme is active, **When** any supported budget state
   is displayed, **Then** text, progress, status, and actions retain sufficient
   contrast.
4. **Given** gesture or button system navigation, **When** the user reaches the
   end of the dashboard, **Then** the final content and actions remain fully
   reachable and unobscured.

### Edge Cases

- No budgets exist at all.
- Budgets exist, but none match the selected period.
- Only one matching global budget exists.
- All matching global budgets fit in one carousel viewport.
- The number of global budgets does not divide evenly by the visible-card count.
- The active carousel page becomes invalid after filtering, deletion, renewal,
  or a window-size change.
- A budget changes from healthy to warning, danger, paused, or expired while the
  dashboard is visible.
- A budget has zero spend or no matching transactions.
- A budget references a deleted user category.
- A budget name, translated label, amount, or currency string is longer than
  expected.
- Loading, observation, calculation, Resume, or navigation to Renew fails.
- The device rotates or changes window size during a carousel gesture.
- Reduced-motion settings are enabled.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The dashboard MUST display eligible budgets in the approved
  section order: Overall budgets, Needs attention, Category budgets, and Paused,
  omitting sections that have no content.
- **FR-002**: Each eligible budget MUST appear in exactly one dashboard section.
- **FR-003**: Section ownership MUST use this precedence: expired custom budgets
  belong to Needs attention even if they were manually paused; otherwise
  manually paused budgets belong to Paused; otherwise near-limit or over-budget
  budgets belong to Needs attention; otherwise healthy active global budgets
  belong to Overall budgets; otherwise healthy active category budgets belong to
  Category budgets.
- **FR-004**: Needs attention MUST contain near-limit, over-budget, and expired
  budgets regardless of global or category scope, with status text that does not
  depend on color alone.
- **FR-005**: Category budgets MUST contain healthy active category budgets,
  including zero-spend budgets.
- **FR-006**: Paused MUST contain manually paused budgets with a direct Resume
  action.
- **FR-007**: Expired custom budgets MUST be visually distinct from manually
  paused budgets and MUST show their expiry date and a Renew action.
- **FR-008**: Resume MUST require a confirmation prompt using the existing
  shared confirmation pattern before changing budget status.
- **FR-009**: Renew MUST open a prefilled new-budget flow and MUST NOT modify
  the expired historical budget.
- **FR-010**: Period filters MUST scope every dashboard section consistently.
- **FR-011**: Within each section, budgets MUST be ordered by trimmed display
  name using
  `Intl.Collator(activeLocale, { sensitivity: "base", numeric: true, usage: "sort" })`,
  where `activeLocale` is `en` or `ar`; equal names MUST use stable budget ID as
  the final code-point tie-break. Spend-only changes MUST NOT reorder them.
- **FR-012**: The dashboard MUST make every matching global budget reachable in
  exactly one lifecycle section.
- **FR-013**: Global carousel cards MUST have equal width and height within the
  same viewport.
- **FR-014**: The carousel MUST use `GLOBAL_BUDGET_MIN_CARD_WIDTH = 320` dp and
  `GLOBAL_BUDGET_CARD_GAP = 16` dp to display the maximum whole number of
  complete, readable, equal-width cards. A viewport narrower than 320 dp MUST
  show one card at the full available width; 320 dp is the threshold for adding
  cards, never a reason to crop or horizontally overflow a card.
- **FR-015**: The carousel MUST recalculate the visible-card count and page
  structure after relevant window-width or orientation changes.
- **FR-016**: Carousel page count MUST equal the total matching global budgets
  divided into groups by the visible-card count, rounded up to the next whole
  page.
- **FR-017**: When filtering, window-size changes, orientation changes, or
  lifecycle reclassification regroup the carousel, it MUST preserve the first
  currently visible eligible budget and display its newly calculated page; if
  that budget is no longer eligible, the carousel MUST move to page one.
- **FR-018**: Pagination indicators MUST appear only when multiple carousel
  pages exist and MUST identify the current page.
- **FR-019**: Pagination indicators MUST remain informational rather than
  requiring users to target small dots as controls.
- **FR-020**: Carousel movement MUST settle on complete card groups rather than
  leaving cards partially visible.
- **FR-021**: Assistive technologies MUST receive the current carousel page and
  total page count, along with complete budget and lifecycle descriptions.
- **FR-022**: Each global card MUST visibly identify its own period, spent
  amount, limit, percentage, remaining or safe-to-spend amount, and remaining
  time; the same complete set MUST be present in its accessible description.
- **FR-023**: The dashboard MUST NOT show an ambiguous persistent summary tied
  to an arbitrary global budget.
- **FR-024**: The primary create action MUST use the same header action pattern
  as the app's Accounts and Transactions areas, and the dashboard MUST NOT add a
  second floating create action.
- **FR-025**: Loading content MUST use layout-matching skeletons and MUST NOT
  replace the entire screen with an indeterminate content spinner.
- **FR-026**: The dashboard MUST provide distinct no-budgets, filtered-empty,
  and recoverable error states.
- **FR-027**: Deleted-category budgets MUST remain visible with a neutral,
  understandable historical category label.
- **FR-028**: Warning, danger, paused, and expired meanings MUST be communicated
  with both text and visual treatment.
- **FR-029**: All content and actions MUST remain reachable in supported system
  navigation modes and MUST follow the shared safe-area behavior established by
  issue #219.
- **FR-030**: The dashboard MUST support light and dark themes, left-to-right
  and right-to-left layouts, supported text scaling, and reduced-motion
  preferences.
- **FR-031**: Dashboard presentation changes MUST NOT alter budget totals,
  percentages, period calculation, pause-window exclusion, category aggregation,
  user ownership, currency behavior, uniqueness, or offline availability.
- **FR-032**: The dashboard MUST preserve the last valid visible state when a
  refresh or direct lifecycle action fails, while presenting a friendly recovery
  message.
- **FR-033**: Overall cards MUST keep the approved compact implementation, place
  the budget icon directly beside the title, and place the percentage at the
  progress bar's trailing edge.
- **FR-034**: Needs attention, Category budgets, and Paused MUST render as
  full-width compact rows grouped by section with separators, chevrons, readable
  names, inline metrics/status, and direct inline lifecycle actions; they MUST
  NOT render as large standalone cards or a two-column grid.

### Key Entities

- **Budget**: A user-owned global or category spending limit with a name,
  period, amount, currency, lifecycle status, optional category, optional custom
  date range, and calculated spending progress.
- **Dashboard Section**: A mutually exclusive presentation group determined by
  budget scope, lifecycle, and spending health.
- **Global Budget Page**: A responsive group of complete equal-size global
  budget cards visible in one carousel viewport.
- **Budget Presentation State**: The user-facing interpretation of a budget as
  healthy, near limit, over budget, manually paused, expired custom, zero spend,
  or linked to a deleted category.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In the supported QA dataset, 100% of eligible budgets are visible
  or reachable under All and their matching period filter.
- **SC-002**: Across tested viewport widths and orientations, 100% of carousel
  resting states show only complete equal-size cards with no clipped card.
- **SC-003**: For every tested dataset, each eligible budget appears exactly
  once across dashboard sections.
- **SC-004**: Users can identify whether a displayed budget is healthy, near
  limit, over budget, paused, or expired without opening its detail screen.
- **SC-005**: Users can reach Resume or Renew from the dashboard in no more than
  one direct action before the approved confirmation or prefilled form.
- **SC-006**: In the production-like manual-QA fixture, each of five consecutive
  All/Weekly/Monthly/Custom filter transitions MUST commit the correct filtered
  sections within 1,000 ms from the filter press handler timestamp.
- **SC-007**: All final dashboard content and actions remain fully reachable in
  the supported light/dark, English/Arabic, portrait/landscape, and gesture/
  button-navigation QA matrix.
- **SC-008**: Screen-reader users receive the correct page position and complete
  budget state for every global carousel page in the accessibility test matrix.
- **SC-009**: No existing verified budget total, percentage, pause exclusion,
  category aggregation, currency, or ownership result changes after the
  redesign.
- **SC-010**: In a fresh no-budget state, users MUST reach the visible Create
  Budget form within 10 seconds from the dashboard becoming interactive, in each
  of three timed trials on the supported phone target.

### Success-Criteria Measurement Rules

- SC-006 is measured on a supported Android target with a development or release
  build using temporary development-only `performance.now()` test probes from
  the filter press handler to a post-commit effect for the correct sections.
  Probes report through the structured development logger or injected test
  callback, never `console.*`. Run five consecutive transitions for each filter
  path, require every result to be at most 1,000 ms, record device/build/all
  values/maximum, and remove the probes before the PR.
- SC-010 is measured from the first interactive dashboard frame in a freshly
  seeded no-budget state until the Create Budget form is visible. Run three
  trials, require every result to be at most 10 seconds, and record
  device/build/results.

## Assumptions

- The approved dashboard mockup and decisions recorded in parent issue #218 are
  the visual and product source of truth.
- This specification covers dashboard redesign child issue #224 only. Budget
  detail and create/edit/renew presentation are covered by #223 and #225.
- The existing Budget domain model and persistence rules remain unchanged.
- One current global budget per user and period remains the governing uniqueness
  rule; one current category budget per user, category, and period follows the
  same rule. Expired custom budgets remain historical and do not occupy the
  uniqueness slot for their replacement; another non-expired matching custom
  budget still blocks creation.
- The existing warning and danger thresholds determine Needs attention
  membership.
- Expired custom budgets remain historical records and renewal creates a new
  budget through the child create/edit flow.
- The existing shared confirmation prompt is reused for Resume.
- The safe-area work from issue #219 is available before final dashboard device
  validation; this feature does not introduce a competing root-level workaround.
- Pagination indicators communicate state but are not direct controls in the
  first release.
- The dashboard uses the user's existing preferred currency and approved
  conversion behavior without redefining financial calculations.
