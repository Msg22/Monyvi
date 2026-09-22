# Feature Specification: Arabic Localization

**Feature Branch**: `023-arabic-localization` **Created**: 2026-04-04
**Status**: Draft **Input**: GitHub Issue #91 — Support Arabic Localization

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Browse the App in Arabic (Priority: P1)

An Egyptian user opens Monyvi and sees all labels, buttons, navigation items,
headers, and messages displayed in Arabic. The user can navigate every screen
without encountering English text in the UI chrome.

**Why this priority**: This is the core value of the feature. Without translated
content, RTL layout and language switching are meaningless.

**Independent Test**: Can be fully tested by switching the app language to
Arabic and navigating through all screens — every label, button, placeholder,
error message, and empty state should display in Arabic.

**Acceptance Scenarios**:

1. **Given** the app language is set to Arabic, **When** the user opens any
   screen, **Then** all static UI text (labels, buttons, headers, placeholders,
   empty states, error messages) is displayed in Arabic.
2. **Given** the app language is set to Arabic, **When** the user encounters a
   system message (confirmation dialog, toast, alert), **Then** the message is
   displayed in Arabic.
3. **Given** the app language is set to Arabic, **When** the user views
   financial data (account names, transaction descriptions entered by the user),
   **Then** user-generated content remains as entered (not translated), while
   surrounding UI text is in Arabic.

---

### User Story 2 - RTL Layout Adaptation (Priority: P1)

When the app is in Arabic mode, the entire layout mirrors to Right-to-Left. Text
aligns to the right, navigation drawers open from the right, lists and icons
flip horizontally, and the overall reading flow feels natural for an Arabic
reader.

**Why this priority**: RTL is equally critical as translation — Arabic text in
an LTR layout is unusable and feels broken. This must ship together with
translations.

**Independent Test**: Can be tested by switching to Arabic and verifying that
every screen's layout mirrors correctly — text alignment, icon positions,
navigation direction, and swipe gestures all adapt to RTL.

**Acceptance Scenarios**:

1. **Given** the app language is Arabic, **When** any screen renders, **Then**
   the layout direction is Right-to-Left (text right-aligned, icons and
   navigation mirrored).
2. **Given** the app language is Arabic, **When** the user opens the navigation
   drawer, **Then** the drawer slides in from the right side.
3. **Given** the app language is Arabic, **When** the user views a list with
   leading icons (e.g., account list, transaction list), **Then** icons appear
   on the right and text flows leftward.
4. **Given** the app language is Arabic, **When** the user interacts with
   swipeable elements, **Then** swipe directions are mirrored (e.g., swipe-left
   for actions becomes swipe-right).

---

### User Story 3 - Switch Between Arabic and English (Priority: P2)

The user can switch the app language between Arabic and English from the
Settings screen. The change takes effect immediately without requiring the user
to restart the app. The user's language preference persists across sessions.

**Why this priority**: Users need control over their language preference. Some
may prefer English for certain tasks or share the device with someone who
prefers a different language. However, this is secondary to having the actual
translations and RTL working.

**Independent Test**: Can be tested by toggling the language setting and
verifying the UI updates immediately, then closing and reopening the app to
confirm persistence.

**Acceptance Scenarios**:

1. **Given** the user is on the Settings screen, **When** they select a language
   option (Arabic or English), **Then** the entire app UI switches to the
   selected language immediately.
2. **Given** the user has selected Arabic as their language, **When** they close
   and reopen the app, **Then** the app loads in Arabic.
3. **Given** the user has selected English as their language, **When** they
   navigate to any screen, **Then** all UI text is displayed in English.

---

### User Story 4 - Language Selection During Onboarding (Priority: P3)

When a new user opens the app for the first time, they are presented with a
language selection step at the start of onboarding. The app pre-selects the
option that matches the device's system language, but the user can change it
before proceeding. Their choice persists for all future sessions and can be
changed later in Settings.

**Why this priority**: An explicit language picker during onboarding removes
ambiguity for users whose device language doesn't match their preferred app
language. Auto-detection is a convenience default, not a substitute for user
choice.

**Independent Test**: Can be tested by going through onboarding and selecting
Arabic — the rest of the onboarding flow and the entire app should render in
Arabic immediately. Selecting English should do the same in English.

**Acceptance Scenarios**:

1. **Given** a new user begins onboarding, **When** the language selection step
   appears, **Then** the device's system language is pre-selected as the default
   option.
2. **Given** the language selection step, **When** the user selects Arabic and
   proceeds, **Then** the remainder of onboarding and the entire app render in
   Arabic.
3. **Given** the language selection step, **When** the user selects English and
   proceeds, **Then** the remainder of onboarding and the entire app render in
   English.
4. **Given** the app has auto-detected a language during onboarding, **When**
   the user later changes their preference in Settings, **Then** the manual
   choice overrides the onboarding selection.

---

### Edge Cases

- What happens when a translation key is missing? The app should fall back to
  English gracefully — never show a raw key or blank text.
- What happens with mixed-direction content (e.g., English brand names or
  numbers embedded in Arabic text)? The app should handle bidirectional text
  correctly using Unicode BiDi rules.
- What happens with numeric formatting? Numbers should remain in Western Arabic
  numerals (1, 2, 3) as commonly used in Egyptian financial contexts, not
  Eastern Arabic numerals (١، ٢، ٣).
- What happens with currency formatting in Arabic mode? Currency symbols and
  amounts should remain consistent with existing app formatting.
- What happens when the user's device language changes while the app is running?
  The app should respect the user's in-app preference over device language once
  explicitly set.
- What happens with screen reader reading order when the layout is RTL? Screen
  reader focus order must mirror the RTL visual layout — not follow LTR DOM
  order.

## Clarifications

### Session 2026-04-05

- Q: Should predefined system data (categories, account types) be translated to
  Arabic? → A: Yes, translate all predefined system data to Arabic.
- Q: Should the app use Egyptian Colloquial Arabic or standard Arabic? → A:
  Standard Arabic (Modern Standard Arabic) — no colloquial dialect.
- Q: Should the app handle Arabic plural forms for countable items? → A:
  Simplified — singular, dual, and plural only.
- Q: Should the onboarding flow include an explicit language selection step? →
  A: Yes — add a language selection step at the start of onboarding.
- Q: How should dates be formatted in Arabic mode? → A: Gregorian calendar with
  Arabic month and day names (e.g., ٥ أبريل ٢٠٢٦).
- Q: Should screen reader reading order follow RTL layout in Arabic mode? → A:
  Yes — screen reader reading order must follow RTL layout in Arabic mode.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST display all user-facing static text in Arabic when
  Arabic is the selected language.
- **FR-002**: System MUST support full Right-to-Left layout when Arabic is the
  selected language, including text alignment, navigation direction, icon
  mirroring, and swipe gesture direction.
- **FR-003**: System MUST provide a language selection option in the Settings
  screen allowing users to switch between Arabic and English.
- **FR-004**: System MUST apply language changes immediately without requiring
  an app restart.
- **FR-005**: System MUST persist the user's language preference across app
  sessions.
- **FR-006**: System MUST fall back to English when a translation is missing for
  a given text key.
- **FR-007**: System MUST detect the device's system language on first launch
  and default to Arabic if the device language is Arabic, or English otherwise.
- **FR-008**: System MUST handle bidirectional text correctly when Arabic text
  contains embedded English words, brand names, or numbers.
- **FR-009 (superseded by #325)**: Arabic user-visible monetary displays MUST
  use Arabic-Indic digits and `ar-EG` grouping/decimal separators. Editable
  financial inputs retain the shared Latin-digit grammar documented in
  `docs/business/business-decisions.md`; English monetary output is unchanged.
- **FR-010**: System MUST preserve user-generated content (account names,
  transaction descriptions) as entered, regardless of the current language
  setting.
- **FR-011**: System MUST localize all 27 existing user-facing screens,
  including: tab screens (Home, Accounts, Metals, Stats, Transactions),
  authentication, onboarding, settings, transaction management, budget
  management, recurring payments, and all supporting screens.
- **FR-012**: System MUST translate all predefined system data (default
  transaction categories, account types, and other system-defined labels) to
  Arabic when Arabic is the selected language.
- **FR-013**: System MUST support simplified Arabic plural forms (singular,
  dual, and plural) for all countable UI strings (e.g., transaction counts,
  account counts, budget counts).
- **FR-014**: System MUST present a language selection step at the start of
  onboarding, pre-selecting the option that matches the device's system
  language, and immediately apply the chosen language to the rest of the
  onboarding flow and the app.
- **FR-015**: System MUST format dates using the Gregorian calendar with Arabic
  month and day names when Arabic is the selected language (e.g., ٥ أبريل ٢٠٢٦).
- **FR-016**: System MUST ensure screen reader reading order
  (VoiceOver/TalkBack) follows the RTL visual layout when Arabic is the selected
  language.

### Key Entities

- **Translation Resource**: A collection of text strings for a given language,
  organized by screen or feature area. Each entry maps a key to a localized
  string.
- **Language Preference**: The user's selected language (Arabic or English),
  stored locally on the device and persisted across sessions.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of static UI text and predefined system data across all 27
  screens is available in Arabic — no English text leaks in Arabic mode
  (excluding user-generated content and brand names).
- **SC-002**: All screens render correctly in RTL layout with no overlapping
  elements, clipped text, or misaligned components.
- **SC-003**: Language switching completes in under 1 second with no visible
  screen flicker or navigation reset.
- **SC-004**: Language preference persists correctly across 100% of app restart
  cycles.
- **SC-005**: Users can complete all core workflows (add transaction, view
  accounts, check balances, manage budgets) entirely in Arabic without
  encountering English UI text.
- **SC-006**: Bidirectional text (Arabic with embedded English/numbers) displays
  correctly without layout breaking in all screens.

## Assumptions

- The app currently supports only English. This feature adds Arabic as the
  second language.
- Arabic translations will use Modern Standard Arabic (MSA).
- The existing `expo-localization` library (already installed) will be leveraged
  for device language detection.
- No server-side translation storage is needed — all translations are bundled
  with the app.
- The feature scope covers static UI text and predefined system data. Voice
  input/output localization (already partially handled by the voice parser) is
  out of scope for this feature.
- Date and time formatting in Arabic mode uses the Gregorian calendar with
  Arabic month and day names (e.g., ٥ أبريل ٢٠٢٦). Hijri calendar is out of
  scope.

## Out of Scope

- Additional languages beyond Arabic and English.
- Voice command recognition improvements for Arabic (handled separately).
- Translation of user-generated content (transaction notes, account names).
- Server-side localization or dynamic translation loading.
- Eastern Arabic numeral support (١٢٣).
- Dialect-specific or colloquial Arabic variations.
