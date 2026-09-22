# Tasks: Arabic Localization

**Input**: Design documents from `/specs/023-arabic-localization/`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅
contracts/ ✅ quickstart.md ✅

**Tests**: Not requested — no test tasks generated.

**Organization**: Tasks grouped by user story to enable independent
implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1–US4)

---

## Phase 1: Setup

**Purpose**: Install dependencies and configure the project for i18n + RTL.

- [ ] T001 Install i18next, react-i18next, and
      @expo-google-fonts/noto-sans-arabic in `apps/mobile/package.json`
- [ ] T002 Add `supportsRTL: true` to `expo.extra` in `app.json` (or
      `app.config.ts` if using dynamic config)
- [ ] T003 Create directory structure: `apps/mobile/i18n/`,
      `apps/mobile/locales/en/`, `apps/mobile/locales/ar/`

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core i18n infrastructure that ALL user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T004 Add `LANGUAGE_KEY = '@monyvi/language'` to
      `apps/mobile/constants/storage-keys.ts` and add it to
      `CLEARABLE_USER_KEYS`
- [ ] T005 Create `apps/mobile/utils/rtl.ts` — exports
      `applyRTL(isArabic: boolean)` using `I18nManager.forceRTL()` +
      `Updates.reloadAsync()`
- [ ] T006 Create `apps/mobile/i18n/index.ts` — async `initI18n()` reads
      `LANGUAGE_KEY` from AsyncStorage (fallback: `expo-localization` device
      locale), initializes i18next with all namespaces, `fallbackLng: 'en'`
- [ ] T007 Create `apps/mobile/i18n/types.ts` — TypeScript module augmentation
      `declare module 'i18next'` using `TranslationResources` from
      `specs/023-arabic-localization/contracts/translation-schema.ts` for
      type-safe `useTranslation()` calls
- [ ] T008 Create `apps/mobile/i18n/changeLanguage.ts` — exports
      `changeLanguage(lang: SupportedLanguage)` that saves to AsyncStorage,
      calls `i18n.changeLanguage()`, then calls `applyRTL()`
- [ ] T009 Update `apps/mobile/app/_layout.tsx` to call `initI18n()` before
      rendering (await in root layout, show splash while initializing), wrap
      tree with `I18nextProvider`
- [ ] T010 Update `apps/mobile/app/_layout.tsx` to load
      `NotoSansArabic_400Regular`, `NotoSansArabic_500Medium`,
      `NotoSansArabic_600SemiBold`, `NotoSansArabic_700Bold` alongside Inter
      fonts via `useFonts`
- [ ] T011 Update `apps/mobile/constants/typography.ts` — add `arabicFontFamily`
      map parallel to existing `fontFamily`, returning Noto Sans Arabic weights
      for `regular/medium/semiBold/bold`
- [ ] T012 Update `apps/mobile/context/ThemeContext.tsx` (or create
      `apps/mobile/context/LocaleContext.tsx`) to expose current language
      (`'en' | 'ar'`) and `isRTL` boolean derived from `I18nManager.isRTL`,
      accessible via a `useLocale()` hook

**Checkpoint**: App boots, i18n initialized, RTL utility ready, fonts loaded.
`useTranslation()` works. No visible UI changes yet.

---

## Phase 3: User Story 1 — Browse the App in Arabic (Priority: P1) 🎯 MVP

**Goal**: All 27 screens display Arabic text when language is set to Arabic.

**Independent Test**: Set `LANGUAGE_KEY` to `'ar'` in AsyncStorage and rebuild.
Navigate every screen — all static UI text must appear in Arabic.

### Translation Files

- [ ] T013 [P] [US1] Create `apps/mobile/locales/en/common.json` — shared
      strings: all buttons (save, cancel, delete, edit, add, done, skip, next,
      back, confirm, retry, close), labels (loading, error, success,
      empty_state, search, no_results), navigation tab names, generic error
      messages, relative time strings (just_now, minutes_ago_one/two/other,
      hours_ago_one/two/other, days_ago_one/two/other)
- [ ] T014 [P] [US1] Create `apps/mobile/locales/ar/common.json` — MSA Arabic
      translations for all keys in T013
- [ ] T015 [P] [US1] Create `apps/mobile/locales/en/transactions.json` — all
      strings for add/edit transaction screens, sms-review, sms-scan,
      voice-review: add_transaction, edit_transaction,
      transaction_count_one/two/other, expense, income, transfer, amount,
      description, category, date, from_account, to_account, no_transactions,
      confirm_delete, voice prompts
- [ ] T016 [P] [US1] Create `apps/mobile/locales/ar/transactions.json` — MSA
      Arabic for all keys in T015
- [ ] T017 [P] [US1] Create `apps/mobile/locales/en/accounts.json` — add/edit
      account strings + account type labels: add_account, edit_account,
      account_count_one/two/other, balance, account_name, account_type,
      type_cash, type_bank, type_digital_wallet, net_worth, total_balance,
      no_accounts
- [ ] T018 [P] [US1] Create `apps/mobile/locales/ar/accounts.json` — MSA Arabic
      for all keys in T017
- [ ] T019 [P] [US1] Create `apps/mobile/locales/en/budgets.json` — budget
      screens: create_budget, budget_count_one/two/other, budget_name,
      budget_amount, period, daily, weekly, monthly, quarterly, yearly, spent,
      remaining, over_budget, no_budgets
- [ ] T020 [P] [US1] Create `apps/mobile/locales/ar/budgets.json` — MSA Arabic
      for all keys in T019
- [x] T021 [P] [US1] Create `apps/mobile/locales/en/settings.json` — settings
      screen: title, language, language_arabic, language_english, appearance,
      dark_mode, currency, preferred_currency, profile, notifications, logout,
      sms_sync, sync_new, full_rescan, live_detection, auto_confirm
- [x] T022 [P] [US1] Create `apps/mobile/locales/ar/settings.json` — MSA Arabic
      for all keys in T021
- [ ] T023 [P] [US1] Create `apps/mobile/locales/en/onboarding.json` —
      onboarding: select_language, slide_1_title/description,
      slide_2_title/description, slide_3_title/description, get_started,
      select_currency, create_wallet
- [ ] T024 [P] [US1] Create `apps/mobile/locales/ar/onboarding.json` — MSA
      Arabic for all keys in T023
- [ ] T025 [P] [US1] Create `apps/mobile/locales/en/auth.json` — auth screens:
      sign_in, sign_up, email, password, forgot_password, continue_as_guest,
      magic_link_sent
- [ ] T026 [P] [US1] Create `apps/mobile/locales/ar/auth.json` — MSA Arabic for
      all keys in T025
- [ ] T027 [P] [US1] Create `apps/mobile/locales/en/metals.json` — metals/rates
      screens: live_rates, gold, silver, platinum, palladium, purity, weight,
      value, no_rates
- [ ] T028 [P] [US1] Create `apps/mobile/locales/ar/metals.json` — MSA Arabic
      for all keys in T027
- [ ] T029 [P] [US1] Create `apps/mobile/locales/en/categories.json` — all 85+
      category `system_name` → `display_name` mappings (extract from
      `supabase/migrations/002_complete_schema.sql` +
      `004_update_categories.sql` +
      `032_seed_balance_adjustment_categories.sql`)
- [ ] T030 [P] [US1] Create `apps/mobile/locales/ar/categories.json` — MSA
      Arabic display names for all category system_names in T029

### Register Namespaces

- [x] T031 [US1] Update `apps/mobile/i18n/index.ts` to import and register all
      10 namespaces (common, transactions, accounts, budgets, settings,
      onboarding, auth, metals, categories) for both `en` and `ar` locales

### Screen Migration — Auth & Onboarding

- [ ] T032 [P] [US1] Migrate `apps/mobile/app/auth.tsx` — replace all hardcoded
      English strings with `useTranslation('auth')` calls
- [ ] T033 [P] [US1] Migrate `apps/mobile/app/auth-callback.tsx` — replace
      loading/error text with `useTranslation('auth')` calls

### Screen Migration — Tab Screens

- [ ] T034 [P] [US1] Migrate `apps/mobile/app/(tabs)/index.tsx` (Home) — replace
      all hardcoded strings with `useTranslation` calls (common + transactions +
      accounts namespaces)
- [ ] T035 [P] [US1] Migrate `apps/mobile/app/(tabs)/accounts.tsx` — replace
      hardcoded strings with `useTranslation('accounts')` calls; render
      `t('categories:' + category.systemName)` for category labels
- [ ] T036 [P] [US1] Migrate `apps/mobile/app/(tabs)/transactions.tsx` — replace
      hardcoded strings; use plural key
      `t('transactions:transaction_count', { count })`
- [ ] T037 [P] [US1] Migrate `apps/mobile/app/(tabs)/metals.tsx` — replace
      hardcoded strings with `useTranslation('metals')` calls
- [ ] T038 [P] [US1] Migrate `apps/mobile/app/(tabs)/stats.tsx` — replace
      hardcoded strings with `useTranslation('common')` calls

### Screen Migration — Transaction Screens

- [ ] T039 [P] [US1] Migrate `apps/mobile/app/add-transaction.tsx` — replace
      hardcoded strings with `useTranslation('transactions')` calls
- [ ] T040 [P] [US1] Migrate `apps/mobile/app/edit-transaction.tsx` — replace
      hardcoded strings with `useTranslation('transactions')` calls
- [ ] T041 [P] [US1] Migrate `apps/mobile/app/edit-transfer.tsx` — replace
      hardcoded strings with `useTranslation('transactions')` calls
- [ ] T042 [P] [US1] Migrate `apps/mobile/app/voice-review.tsx` — replace
      hardcoded strings; note: voice language detection is out-of-scope, only
      translate UI chrome
- [ ] T043 [P] [US1] Migrate `apps/mobile/app/sms-scan.tsx` — replace hardcoded
      strings with `useTranslation('transactions')` calls
- [ ] T044 [P] [US1] Migrate `apps/mobile/app/sms-review.tsx` — replace
      hardcoded strings with `useTranslation('transactions')` calls

### Screen Migration — Account Screens

- [ ] T045 [P] [US1] Migrate `apps/mobile/app/add-account.tsx` — replace
      hardcoded strings; replace `ACCOUNT_TYPES[i].label` with
      `t('accounts:type_' + type.id.toLowerCase())`
- [ ] T046 [P] [US1] Migrate `apps/mobile/app/edit-account.tsx` — replace
      hardcoded strings with `useTranslation('accounts')` calls

### Screen Migration — Budget & Recurring Screens

- [ ] T047 [P] [US1] Migrate `apps/mobile/app/budgets.tsx` — replace hardcoded
      strings with `useTranslation('budgets')` calls
- [ ] T048 [P] [US1] Migrate `apps/mobile/app/budget-detail.tsx` — replace
      hardcoded strings with `useTranslation('budgets')` calls
- [ ] T049 [P] [US1] Migrate `apps/mobile/app/create-budget.tsx` — replace
      hardcoded strings with `useTranslation('budgets')` calls
- [ ] T050 [P] [US1] Migrate `apps/mobile/app/recurring-payments.tsx` — replace
      hardcoded strings with `useTranslation('common')` calls
- [ ] T051 [P] [US1] Migrate `apps/mobile/app/create-recurring-payment.tsx` —
      replace hardcoded strings with `useTranslation('common')` +
      `useTranslation('budgets')` calls

### Screen Migration — Other Screens

- [x] T052 [P] [US1] Migrate `apps/mobile/app/settings.tsx` — replace hardcoded
      strings with `useTranslation('settings')` calls
- [ ] T053 [P] [US1] Migrate `apps/mobile/app/charts.tsx` — replace hardcoded
      strings with `useTranslation('common')` calls
- [ ] T054 [P] [US1] Migrate `apps/mobile/app/live-rates.tsx` — replace
      hardcoded strings with `useTranslation('metals')` calls

### Date Formatting

- [ ] T055 [US1] Update `apps/mobile/utils/dateHelpers.ts` — add locale
      parameter to `formatDate()` and `formatToLocalDateString()`; when locale
      is `'ar'`, use
      `toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })`
      for Gregorian calendar with Arabic month names (FR-015)

**Checkpoint**: Switch language to Arabic → all 27 screens display Arabic text.
English fallback works for any missing key.

---

## Phase 4: User Story 2 — RTL Layout Adaptation (Priority: P1)

**Goal**: All screens mirror correctly to RTL when Arabic is selected.

**Independent Test**: Enable `I18nManager.forceRTL(true)` + rebuild → navigate
every screen. No LTR remnants: icons on right, text right-aligned, navigation
opens from right.

- [ ] T056 Audit all `.tsx` files in `apps/mobile/` for directional NativeWind
      classes (`ml-`, `mr-`, `pl-`, `pr-`, `text-left`, `text-right`, `left-`,
      `right-`, `rounded-l-`, `rounded-r-`) and inline style props
      (`marginLeft`, `marginRight`, `paddingLeft`, `paddingRight`,
      `textAlign: 'left'`) — produce a list of files needing changes
- [ ] T057 [P] [US2] Replace directional utilities with logical equivalents in
      tab screens: `apps/mobile/app/(tabs)/index.tsx`, `accounts.tsx`,
      `transactions.tsx`, `metals.tsx`, `stats.tsx`
- [ ] T058 [P] [US2] Replace directional utilities in transaction screens:
      `apps/mobile/app/add-transaction.tsx`, `edit-transaction.tsx`,
      `edit-transfer.tsx`, `voice-review.tsx`, `sms-scan.tsx`, `sms-review.tsx`
- [ ] T059 [P] [US2] Replace directional utilities in account screens:
      `apps/mobile/app/add-account.tsx`, `edit-account.tsx`
- [ ] T060 [P] [US2] Replace directional utilities in budget & recurring
      screens: `apps/mobile/app/budgets.tsx`, `budget-detail.tsx`,
      `create-budget.tsx`, `recurring-payments.tsx`,
      `create-recurring-payment.tsx`
- [ ] T061 [P] [US2] Replace directional utilities in settings, charts,
      live-rates, auth, and onboarding screens
- [ ] T062 [P] [US2] Audit shared components under `apps/mobile/components/` for
      directional classes and replace with logical equivalents
- [ ] T063 [US2] Verify the `react-native-reanimated-carousel` in
      `apps/mobile/app/onboarding.tsx` renders correctly in RTL — add `inverted`
      prop or equivalent if slides render in wrong order under
      `I18nManager.isRTL`

**Checkpoint**: `I18nManager.forceRTL(true)` + rebuild shows fully mirrored
layout. No visual bugs in any of the 27 screens.

---

## Phase 5: User Story 3 — Switch Between Arabic and English (Priority: P2)

**Goal**: Users can switch language in Settings. Change applies instantly (with
reload). Preference persists across sessions.

**Independent Test**: Open Settings → change language → app reloads in new
language → close and reopen app → correct language is loaded.

- [x] T064 [US3] Update `apps/mobile/app/settings.tsx` — add a "Language" row
      (using existing settings row pattern) in the Appearance/General section
      showing current language; tapping opens a two-option picker (Arabic /
      English)
- [x] T065 [US3] Wire the language picker in `apps/mobile/app/settings.tsx` to
      call `changeLanguage()` from `apps/mobile/i18n/changeLanguage.ts` on
      selection; show a brief loading indicator before reload
- [ ] T066 [US3] Verify `LANGUAGE_KEY` is read on app boot in
      `apps/mobile/i18n/index.ts` (T006) so the selected language persists after
      reload
- [ ] T067 [US3] Verify `LANGUAGE_KEY` is included in logout cleanup in
      `apps/mobile/constants/storage-keys.ts` `CLEARABLE_USER_KEYS` (T004 should
      cover this — confirm and close)

**Checkpoint**: Settings language toggle works. App reloads in Arabic/English.
Preference survives app restarts.

---

## Phase 6: User Story 4 — Language Selection During Onboarding (Priority: P3)

**Goal**: New users see a language selection step at the start of onboarding,
pre-selected by device locale.

**Independent Test**: Clear AsyncStorage, open app fresh → language picker
appears first in onboarding, pre-selected per device locale. Selecting Arabic
shows rest of onboarding in Arabic.

- [ ] T068 [US4] Add a new `language-picker` phase to the onboarding state
      machine in `apps/mobile/app/onboarding.tsx` (insert before `carousel`
      phase)
- [ ] T069 [US4] Implement `LanguagePickerStep` component (inline or in
      `apps/mobile/components/onboarding/`) showing Arabic (العربية) and English
      options; pre-select based on `getLocales()[0].languageCode` from
      `expo-localization`
- [ ] T070 [US4] Wire `LanguagePickerStep` selection: call `changeLanguage()`
      (without reload — apply language to i18next only, skip `applyRTL` reload
      during onboarding), advance to carousel phase; RTL takes effect after full
      app load
- [ ] T071 [US4] Guard: if `LANGUAGE_KEY` already exists in AsyncStorage
      (returning user), skip the language picker step and go directly to
      carousel (or to app if already onboarded)

**Checkpoint**: Fresh install → language picker shown first → rest of onboarding
adapts to selected language → preference persists.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Arabic font rendering, accessibility, edge cases.

- [ ] T072 [P] Update `apps/mobile/context/ThemeContext.tsx` (or
      `LocaleContext`) to expose `fontFamily` based on current locale —
      components that use `style={{ fontFamily }}` (not NativeWind) can consume
      `useLocale().fontFamily` to get locale-correct font
- [ ] T073 [P] Update any components that set font via inline `style` prop
      (found in typography-heavy components like `TransactionCard`,
      `AccountCard`, amount displays) to use locale-aware font family from
      `useLocale()`
- [ ] T074 [P] Verify VoiceOver (iOS) and TalkBack (Android) reading order in
      RTL — check `accessibilityElementsHidden`, `importantForAccessibility`,
      and `accessible` props on interactive elements in each screen; add
      `accessibilityLanguage="ar"` on Arabic text containers where needed
      (FR-016)
- [ ] T075 Verify Arabic-Indic digits and `ar-EG` grouping/decimal separators in
      all user-visible monetary displays in Arabic mode while editable financial
      inputs retain their Latin-digit grammar (FR-009)
- [ ] T076 Verify bidirectional text: test Arabic text with embedded English
      brand names and numbers across transaction, account, and budget screens —
      confirm no layout breaking (FR-008)
- [ ] T077 Verify missing translation key fallback: temporarily remove one key
      from `ar/common.json`, confirm English fallback appears (not raw key or
      blank) per i18next `fallbackLng: 'en'` config (FR-006)
- [ ] T078 Update `apps/mobile/app/onboarding.tsx` `ONBOARDING_DATA` slide
      content to use translation keys from `onboarding` namespace instead of
      hardcoded English strings (connects T023/T024 translations to the
      carousel)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundation)**: Depends on Phase 1 — **BLOCKS all user stories**
- **Phase 3 (US1)**: Depends on Phase 2 — translation files can be authored in
  parallel with Phase 2
- **Phase 4 (US2)**: Depends on Phase 2 — RTL audit can begin in parallel with
  Phase 3
- **Phase 5 (US3)**: Depends on Phase 2 + Phase 3 (settings screen must use
  `t()` before adding language picker)
- **Phase 6 (US4)**: Depends on Phase 2 + Phase 3 (onboarding screen must be
  translated first)
- **Phase 7 (Polish)**: Depends on Phases 3–6

### User Story Dependencies

- **US1 (P1)**: After Foundation — no dependency on US2
- **US2 (P1)**: After Foundation — no dependency on US1 (RTL audit is
  independent of translation)
- **US3 (P2)**: After US1 (settings screen translated), Foundation
- **US4 (P3)**: After US1 (onboarding screen translated), Foundation

### Parallel Opportunities

- T013–T030 (all translation JSON files) can all be authored in parallel
- T032–T054 (screen migrations) can all be done in parallel (different files)
- T057–T062 (RTL NativeWind audit) can all be done in parallel (different files)
- Phase 3 (US1) and Phase 4 (US2) can proceed in parallel after Phase 2

---

## Parallel Example: Phase 3 (US1) Translation Files

```text
# All translation file pairs can be authored simultaneously:
T013+T014: common (en+ar)
T015+T016: transactions (en+ar)
T017+T018: accounts (en+ar)
T019+T020: budgets (en+ar)
T021+T022: settings (en+ar)
T023+T024: onboarding (en+ar)
T025+T026: auth (en+ar)
T027+T028: metals (en+ar)
T029+T030: categories (en+ar)
```

---

## Implementation Strategy

### MVP First (US1 + US2 — P1 stories only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundation (CRITICAL)
3. Complete Phase 3: US1 — Browse in Arabic
4. Complete Phase 4: US2 — RTL Layout
5. **STOP and VALIDATE**: Manual QA of all 27 screens in Arabic + RTL
6. Ship MVP — both P1 stories delivered

### Incremental Delivery

1. Setup + Foundation → app boots with i18n
2. US1 + US2 (parallel) → Arabic text + RTL layout → **MVP**
3. US3 → language toggle in Settings
4. US4 → language picker in onboarding
5. Polish → fonts, accessibility, edge cases

### Parallel Strategy (single developer)

Since all Phase 3 screen migrations are independent files, the implementation
agent can process them in parallel batches.

---

## Notes

- [P] tasks = different files, no dependencies between them
- Story labels map to user stories in `spec.md`
- US1 + US2 are both P1 — deliver together as the MVP
- RTL requires development build (not Expo Go) for testing
- Translation JSON files should be reviewed by a native Arabic speaker
- Commit after each phase checkpoint to keep diffs reviewable
- `applyRTL()` triggers a reload — expected behavior, not a bug
