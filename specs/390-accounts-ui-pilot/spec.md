# Feature Specification: Accounts UI Pilot

**Feature Branch**: `codex/accounts-ui-pilot`
**Created**: 2026-10-11
**Status**: Scope and immutable mockup package approved; implementation pending
**Input**: User description: "Accounts pilot specification and mockups using the existing default field style ... show me the mockups before coding."

## Clarifications

### Session 2026-10-11

- Q: Should the Accounts pilot change provider-aware nickname uniqueness to match the older business documentation? → A: The current code is correct; adjust the business documentation. Preserve its user/currency/provider identity rule in this pilot.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Create an account with familiar, consistent fields (Priority: P1)

An authenticated user adds Cash, Bank or Digital Wallet accounts using the same recognizable field surfaces, labels and validation feedback. The user can enter a grouped balance without losing what they typed.

**Why this priority**: Account creation proves that shared presentation can support existing choices and validation without changing the financial journey.

**Independent Test**: Create a valid account with a custom balance, reopen it, and compare the saved balance and details with the values entered, including while offline.

**Acceptance Scenarios**:

1. **Given** Add Account is open, **When** the user inspects the form, **Then** the starting balance is zero, required Name, Type, Currency and Initial Balance are marked, and optional provider/SMS details are unmarked.
2. **Given** a valid name and currency, **When** the user types a valid balance such as 1234.50, **Then** the visible value groups thousands without adding rounding or changing the existing accepted decimal length.
3. **Given** a negative or malformed initial balance, **When** the user edits or attempts submission, **Then** the raw text remains available for correction, the existing inline validation explains the problem, and no invalid account is saved.
4. **Given** a Bank or Wallet account, **When** the user changes provider, currency or account type and optional details, **Then** existing eligibility, reset, validation and name-uniqueness behavior is preserved.
5. **Given** a preferred currency has been selected automatically, **When** the user chooses another supported currency, **Then** later preference loading does not replace that user choice.
6. **Given** a valid form and no connectivity, **When** the user saves, **Then** the account is created locally and can be reopened after app restart without waiting for cloud synchronization.

---

### User Story 2 - Edit an account without changing financial meaning (Priority: P1)

A user edits the account name, balance and permitted metadata through fields consistent with Add Account. Type and Currency remain readable, locked attributes. Changed balances retain the existing confirmation choices.

**Why this priority**: A shared input must preserve signed balances, pristine state and the distinction between metadata edits and financial changes.

**Independent Test**: Open a seeded account, confirm that formatting and focus alone leave it unchanged, then exercise metadata-only saving, negative balance saving, both balance-change choices and dismissal independently.

**Acceptance Scenarios**:

1. **Given** an unchanged account, **When** the user opens Edit and focuses or blurs its grouped balance, **Then** formatting alone does not make the form dirty or enable an unchanged save.
2. **Given** a populated account, **When** the user reads or taps the lock explanation for Type or Currency, **Then** both values remain unchanged and readable; they are not mislabeled as editable required inputs.
3. **Given** a balance being edited, **When** the user enters a negative value, an intermediate minus sign or an invalid pasted string, **Then** the entered text is retained and existing signed validation determines whether submission is permitted.
4. **Given** a valid changed balance, **When** the user chooses the existing silent update and confirms, **Then** the balance changes without a new adjustment transaction.
5. **Given** a valid changed balance, **When** the user chooses the existing tracked adjustment and confirms, **Then** the balance changes with exactly one adjustment transaction through the existing financial workflow.
6. **Given** the balance-change sheet is open, **When** the user dismisses the backdrop or presses Android Back, **Then** no balance change is persisted and the unsaved form remains available. No new visible Cancel action or drag gesture is introduced.
7. **Given** a save fails, **When** the user corrects or retries, **Then** existing feedback and entered data are retained and repeated activation does not introduce duplicate saves.
8. **Given** only permitted metadata changed, **When** the user saves, **Then** no unnecessary balance-change sheet is shown.

---

### User Story 3 - Understand the same control in every supported presentation (Priority: P2)

Users recognize labels, values, requiredness, locked state and correction messages across English, Arabic, light/dark appearance and different screen/text sizes.

**Why this priority**: Reusable presentation is useful only if its states stay clear, accessible and usable.

**Independent Test**: Navigate Add/Edit and the balance sheet across the approved visual variants using touch, keyboard and screen-reader checks.

**Acceptance Scenarios**:

1. **Given** a required editable field in English or Arabic, **When** its accessible name is read, including with an explicit label override, **Then** localized requiredness occurs exactly once; optional fields remain unmarked.
2. **Given** an invalid focused field, **When** the user reads or corrects it, **Then** its error remains visible and necessary correction instructions remain discoverable.
3. **Given** a locked attribute or temporarily disabled control, **When** the user navigates the form, **Then** the two states are distinguishable, readable and behave according to their existing interaction rules.
4. **Given** Arabic text and a signed numeric balance, **When** the user edits or reads the value, **Then** direction, sign, grouping and currency remain understandable without changing the canonical balance.
5. **Given** compact or ordinary phones, tablet, landscape or enlarged text, **When** the form or sheet is used, **Then** controls and messages remain readable, scrolling exposes focused fields, and system bars do not cover bottom sheet actions.
6. **Given** approved feedback examples, **When** a field can show multiple messages, **Then** it follows the approved priority while retaining essential correction guidance. A warning example does not create a new financial rule.

### Edge Cases

- Zero is a valid Add balance; negative Add submission is invalid. Negative Edit balances remain valid under existing grammar.
- Empty text, a lone minus sign, trailing decimal point, letters, multiple dots and malformed comma grouping remain editable intermediate/invalid states rather than being silently repaired.
- Valid arbitrary decimal length and trailing zeros do not acquire a currency-specific input precision limit or input rounding.
- Rapid typing, external controlled updates, mid-string replacement, comma deletion and blur/refocus must not drop digits or trap corrections.
- Formatting-only changes must not alter dirty detection.
- Name checks must ignore stale answers after name, currency, type or provider changes; provider identity remains part of duplicate-name rules.
- Unselected institution identity remains absent, not an empty identifier. Other-provider and Cash behavior follow existing rules.
- Optional metadata may be invalid even if required fields are valid; type changes and section collapse retain existing reset rules.
- Repeated Save/Confirm activation, command failures, retry, backdrop dismissal and Android Back retain existing persistence boundaries.
- Loading, a missing account, current-user scoping, default-account changes and offline relaunch must retain existing behavior.
- Locked display attributes do not inherit editable required markers merely because their stored values are mandatory.
- Returning from a sheet, screen-reader focus, native keyboard variants and actual clipboard paste need evidence appropriate to those interactions.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Add and Edit Account MUST use one consistent existing default field presentation for equivalent editable controls, labels and states, while retaining their existing form composition, preview placement, icons, header Back/Save actions, unboxed Default Account row, boxed SMS section and existing Delete section below SMS.
- **FR-002**: Required editable fields MUST display a red asterisk and announce localized requiredness exactly once, including explicit accessible-name overrides. Optional fields MUST remain unmarked.
- **FR-003**: Add MUST mark Name, Type, Currency and Initial Balance as required, even when Type is preselected. Edit MUST mark its required editable Name and Balance; locked Type/Currency MUST remain display-only attributes without blanket editable-required labeling.
- **FR-004**: Valid editable balances MUST show comma-grouped thousands while keeping the existing ungrouped dot-decimal value and financial meaning. For canonical 12345.678, the input displays 12,345.678; the existing account preview retains 12345.678 rather than gaining a new formatter. Display formatting MUST NOT dirty an otherwise unchanged Edit form.
- **FR-005**: Balance editing MUST preserve raw malformed and intermediate text verbatim for correction and existing validation, without stripping signs, dropping digits, inserting grouping into invalid text or repairing pasted values. For example, abc12345 MUST remain abc12345, never abc12,345.
- **FR-006**: Add balance MUST start at zero and retain nonnegative validation; Edit MUST retain signed-balance validation. Existing Account decimal acceptance and save-time conversion MUST remain unchanged.
- **FR-007**: Text and balance entry MUST preserve existing focus, blur, controlled-update, keyboard, selection and fast-typing behavior.
- **FR-008**: Currency choice MUST retain all supported options, picker search/selection/dismissal behavior and the user's manual choice when preferred-currency loading completes.
- **FR-009**: Provider/SMS metadata MUST retain existing optionality, type eligibility, field validation, section/reset behavior and genuinely absent institution identities.
- **FR-010**: Duplicate-name validation MUST remain local and current-user scoped for active accounts, with case-insensitive, trimmed nicknames unique per currency and provider identity. A known provider identity takes precedence; otherwise a normalized manual provider name identifies the provider; accounts without either share one no-provider identity. Different manual providers may reuse a nickname in the same currency; equivalent manual names may not. Edit excludes the current account. Preserve stale-result protection and existing failure/recovery behavior without introducing network dependence.
- **FR-011**: Edit Type/Currency MUST remain readable and unchangeable with their existing lock explanation. Disabled editable controls MUST remain distinguishable from locked display attributes.
- **FR-012**: Existing Save enabled/loading/disabled states, validation timing, failure feedback and retry behavior MUST be preserved; repeated Save/Confirm activation MUST NOT introduce duplicate writes.
- **FR-013**: Changed Edit balances MUST retain silent and tracked confirmation choices, existing default choice, backdrop/Android Back dismissal and metadata-only saving without an unnecessary confirmation.
- **FR-014**: Field errors MUST remain visible while focused and separate from form/save failures. The approved immutable package specifies error-before-warning-before-helper presentation; implement it within the approved state contract. Essential correction guidance MUST remain discoverable, and presentation warnings MUST NOT introduce financial validation or disable Save.
- **FR-015**: Account reads/writes and existing default-account behavior MUST remain local and current-user scoped; valid Add/Edit MUST work offline without waiting for cloud synchronization and remain visible after restart.
- **FR-016**: English/Arabic, light/dark, compact/ordinary phone, tablet, landscape and enlarged-text use MUST preserve readable hierarchy, control usability, sign/currency meaning and the approved responsive composition.
- **FR-017**: Keyboard scrolling, bottom content clearance and any touched sheet action area MUST preserve safe-area usability; header Save MUST retain its header placement.
- **FR-018**: Screen-reader navigation MUST expose field labels, values, required/error/locked states and the existing modal focus lifecycle without misleading numeric-range semantics.
- **FR-019**: Current navigation, account loading/missing-account handling and unrelated delete behavior MUST remain unchanged; no new dirty-leave confirmation, drag-to-dismiss or balance warning threshold is introduced.
- **FR-020**: No production implementation may start before Mohamed approves the actual mockups and their immutable binding revision. Financial, navigation or field-geometry changes beyond this scoped approval require renewed direction.

### Key Entities _(include if feature involves data)_

- **Account**: A current user's Cash, Bank or Digital Wallet money container with nickname, one currency, balance and existing default status. Type and currency become locked after creation.
- **Provider metadata**: Optional known institution identity or provider display information, separate from the user's nickname.
- **SMS matching metadata**: Existing optional sender aliases and bank/card details associated with an owned account.
- **Field feedback**: Requiredness, validation correction and supplementary instructions presented without changing account rules.
- **Balance-change choice**: Existing silent update or tracked adjustment, with dismissal leaving the change uncommitted.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Across all approved Add/Edit reference states, 100% of equivalent editable controls use the same default field surface, label treatment and state colors; no additional per-screen field design is introduced.
- **SC-002**: Every required editable field is visibly marked and announces requiredness exactly once in English and Arabic, while every optional or locked display-only field retains its intended semantics.
- **SC-003**: Every valid balance fixture in the acceptance plan keeps its existing financial result; every invalid fixture remains editable and prevents invalid submission. No grouping-only interaction changes a pristine account.
- **SC-004**: Create, metadata-only edit, silent balance edit, tracked balance edit and cancellation each complete with exactly the expected account/transaction result, online and in the supported offline test environment.
- **SC-005**: All in-scope theme, direction, viewport and enlarged-text checks permit completion without clipped labels, inaccessible controls or system-bar overlap.
- **SC-006**: All 35 acceptance cases have an explicit automation or device/harness disposition and recorded results before delivery; required unresolved visual or accessibility checks are reported separately from functional completion.

## Assumptions

- Scope is Add/Edit Account and the minimum shared field presentation needed by these two screens. Layouts remain flexible.
- Existing default field styling is approved as the design direction. The eight calibrated images, message priority, unchanged focus border and unified locked geometry are approved in package sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e. Native rendering and accessibility evidence remain NOT RUN.
- Existing account business rules are preserved. This pilot neither changes decimal validation nor introduces financial protocol, schema, provider, permission or sync behavior.
- Authenticated startup and local current-user data access are existing dependencies; this pilot does not redesign them.
- Independent implementation planning starts only after mockup approval and pending shared-component work is reconciled.
- This pilot is a first adoption slice; app-wide monetary and required-marker migrations remain separate follow-up work.
- Native paste, caret/IME, actual screen-reader navigation and visual fidelity require appropriate rendered/device evidence; source assertions alone are insufficient.
- Approval of this specification is not a claim that its measurable outcomes have already passed.

## Scope, Dependencies and Approval State

**In scope**: Specification, shared-field contract proposal, complete acceptance map and actual Add/Edit/control-state mockup package. Later coding is limited to approved minimum foundation and Accounts adoption after its separate gate.

**Excluded**: App-wide migration; date controls; universal form engine; specialized keypad redesign; Metals weight changes; new financial warnings; altered decimal limits or rounding; delete cascades; new navigation/permission flows; schema, sync or dependency changes.

**Dependencies**: Approved immutable mockup binding; reconciliation of pending shared-input work; test discovery and controllable test harness; exclusive implementation ownership. Technical proposals and source pins live in [contracts/shared-fields.md](contracts/shared-fields.md); proposed writer boundaries live in [implementation-ownership.md](implementation-ownership.md).

**Approval package**: [Mockup package](../../docs/mockups/accounts-ui-pilot/index.md), authored independently. Mohamed approved all eight calibrated references and immutable bindings on 2026-10-11, package sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e. All eight canonical bindings passed integrity verification; native rendering, accessibility and all 35 QA cases remain NOT RUN.

**Current stage**: Specification review only. See [manual-test-plan.md](manual-test-plan.md) for the 35-case source-inspected/proposed coverage map. No tests, device runs or implementation performed.
