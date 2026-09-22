# Implementation Plan: Arabic Localization

**Branch**: `023-arabic-localization` | **Date**: 2026-04-05 | **Spec**:
[spec.md](spec.md) **Input**: Feature specification from
`/specs/023-arabic-localization/spec.md`

## Summary

Add full Arabic (MSA) localization and RTL support to Monyvi. This includes:
installing `i18next` + `react-i18next` as the i18n framework, creating
namespace-organized Arabic/English translation files for all 27 screens,
enabling RTL layout via `I18nManager`, replacing directional NativeWind
utilities with logical properties (`ms-`/`me-`/`ps-`/`pe-`), adding Noto Sans
Arabic font for Arabic text, adding a language picker to onboarding and
settings, and persisting language preference via AsyncStorage.

## Technical Context

**Language/Version**: TypeScript (strict mode) across Nx monorepo **Primary
Dependencies**: React Native 0.76 + Expo 52, NativeWind v4, i18next +
react-i18next (new), expo-localization (existing) **Storage**: WatermelonDB
(local DB — unchanged), AsyncStorage (language pref), Supabase (cloud —
unchanged) **Testing**: Manual screen-by-screen verification, RTL layout visual
testing **Target Platform**: iOS & Android (React Native Expo managed workflow)
**Project Type**: Mobile (Nx monorepo: `apps/mobile`, `packages/db`,
`packages/logic`) **Performance Goals**: Language switch + reload in < 2 seconds
**Constraints**: RTL requires JS bundle reload via `Updates.reloadAsync()` —
cannot avoid this (React Native platform limitation). Must use development
build, not Expo Go. **Scale/Scope**: 27 screens, ~9 translation namespaces,
~500+ translation keys per language

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                     | Status | Notes                                                                                                                                             |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Offline-First              | PASS   | Translations bundled locally in JSON. No network dependency. Language preference in AsyncStorage.                                                 |
| II. Documented Business Logic | PASS   | Localization decisions documented in clarifications session. No new business rules — pure UI/UX feature.                                          |
| III. Type Safety              | PASS   | Translation keys will be typed via `TranslationResources` interface. `SupportedLanguage` type constrains to `'en' \| 'ar'`. No `any` usage.       |
| IV. Service-Layer Separation  | PASS   | i18n initialization in dedicated `i18n/` module. Language change logic in utility functions. Components only consume via `useTranslation()` hook. |
| V. Premium UI                 | PASS   | Noto Sans Arabic font ensures consistent premium typography. RTL layout maintains existing design quality. No degraded screens.                   |
| VI. Monorepo Boundaries       | PASS   | All i18n files in `apps/mobile/`. No changes to `packages/db` or `packages/logic`. Translation type contract in `contracts/` for reference.       |
| VII. Local-First Migrations   | PASS   | No database migrations required. Feature is entirely client-side.                                                                                 |

**Post-Phase 1 re-check**: All gates still pass. No new dependencies on packages
or external APIs introduced.

## Project Structure

### Documentation (this feature)

```text
specs/023-arabic-localization/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Data model (AsyncStorage + JSON)
├── quickstart.md        # Developer setup guide
├── contracts/
│   └── translation-schema.ts  # Type-safe translation interfaces
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # (Phase 2 — created by /speckit.tasks)
```

### Source Code (repository root)

```text
apps/mobile/
├── i18n/
│   ├── index.ts                # i18next initialization & config
│   └── types.ts                # Type augmentation for react-i18next
├── locales/
│   ├── en/
│   │   ├── common.json         # Shared: buttons, labels, nav, errors
│   │   ├── tabs.json           # Tab bar labels
│   │   ├── transactions.json   # Transaction screens
│   │   ├── accounts.json       # Account screens
│   │   ├── budgets.json        # Budget screens
│   │   ├── settings.json       # Settings screen
│   │   ├── onboarding.json     # Onboarding flow
│   │   ├── auth.json           # Auth screens
│   │   ├── metals.json         # Metals/rates screens
│   │   └── categories.json     # Category system_name → display_name
│   └── ar/
│       └── [same structure]    # Arabic translations (MSA)
├── utils/
│   └── rtl.ts                  # RTL toggle + reload utility
├── constants/
│   ├── storage-keys.ts         # + LANGUAGE_KEY
│   └── typography.ts           # + Arabic font family mappings
├── context/
│   └── ThemeContext.tsx         # + font family based on locale
├── app/
│   ├── _layout.tsx             # + i18n initialization in provider stack
│   ├── onboarding.tsx          # + language selection step (Phase 0)
│   ├── settings.tsx            # + language picker option
│   └── [all 27 screens]        # Replace hardcoded strings with t() calls
└── components/
    └── [affected components]    # Replace hardcoded strings with t() calls
```

**Structure Decision**: All i18n infrastructure lives in `apps/mobile/`.
Translation files are co-located under `locales/`. No changes to `packages/db`
or `packages/logic` — these packages have no user-facing strings.

## Implementation Phases

### Phase A: i18n Infrastructure (Foundation)

**Goal**: Set up the i18n framework so any screen can start using translations.

1. Install `i18next`, `react-i18next`, `@expo-google-fonts/noto-sans-arabic`
2. Create `apps/mobile/i18n/index.ts` — i18next initialization with
   namespace-based resources, fallback to English, async language detection
3. Create `apps/mobile/i18n/types.ts` — TypeScript module augmentation for
   type-safe `useTranslation()` calls
4. Create `apps/mobile/locales/en/common.json` — initial shared translations
5. Create `apps/mobile/locales/ar/common.json` — Arabic shared translations
6. Create `apps/mobile/utils/rtl.ts` — RTL toggle utility using
   `I18nManager.forceRTL()` + `Updates.reloadAsync()`
7. Add `LANGUAGE_KEY = '@monyvi/language'` to `storage-keys.ts`
8. Add `LANGUAGE_KEY` to `CLEARABLE_USER_KEYS` array
9. Update `app.json` / `app.config.ts` with `supportsRTL: true`
10. Add i18n initialization to `_layout.tsx` provider stack (before
    ThemeProvider)
11. Load Noto Sans Arabic fonts alongside Inter in `_layout.tsx`
12. Update `typography.ts` to include Arabic font family mappings

**Deliverable**: App boots with i18n initialized. `useTranslation()` works.
Language defaults to device locale. No visible UI changes yet.

### Phase B: RTL Layout Migration

**Goal**: All screens render correctly in RTL mode.

1. Audit all `.tsx` files under `apps/mobile/` for directional NativeWind
   classes (`ml-*`, `mr-*`, `pl-*`, `pr-*`, `text-left`, `text-right`, `left-*`,
   `right-*`, `rounded-l-*`, `rounded-r-*`)
2. Replace with logical equivalents (`ms-*`, `me-*`, `ps-*`, `pe-*`,
   `text-start`, `text-end`, `start-*`, `end-*`, `rounded-s-*`, `rounded-e-*`)
3. Check inline `style` props for hardcoded `marginLeft`, `marginRight`,
   `paddingLeft`, `paddingRight`, `textAlign: 'left'` — replace with
   `marginStart`, `marginEnd`, `paddingStart`, `paddingEnd`, `textAlign`
   (auto-adjusted by I18nManager)
4. Verify `flexDirection: 'row'` layouts flip correctly (Yoga auto-handles this
   — just verify visually)
5. Test navigation drawer opens from right in RTL
6. Test swipeable elements mirror correctly
7. Verify carousel component works in RTL mode

**Deliverable**: Enabling `I18nManager.forceRTL(true)` results in a fully
mirrored layout across all 27 screens with no visual bugs.

### Phase C: Translation Files & Screen Migration

**Goal**: All 27 screens display Arabic text when language is set to Arabic.

1. Create all English namespace JSON files (extract hardcoded strings from each
   screen):
   - `common.json` — buttons, labels, navigation, errors
   - `tabs.json` — tab bar labels
   - `transactions.json` — add/edit transaction screens
   - `accounts.json` — add/edit account screens, account types
   - `budgets.json` — budget screens
   - `settings.json` — settings screen
   - `onboarding.json` — onboarding slides
   - `auth.json` — auth screens
   - `metals.json` — metals/rates screens
   - `categories.json` — all category `system_name` → `display_name` mappings
2. Create corresponding Arabic namespace JSON files with MSA translations
3. Migrate each screen to use `useTranslation()`:
   - Replace every hardcoded English string with `t('key')`
   - Use namespace-specific hooks: `useTranslation('transactions')`
   - Use plural keys for counts: `t('transaction_count', { count })`
4. Migrate category display: render `t('categories:' + category.systemName)`
   instead of `category.displayName`
5. Migrate account type labels via translation keys
6. Update `dateHelpers.ts` to accept locale parameter and format dates with
   `toLocaleDateString('ar-EG')` when in Arabic mode
7. Update `formatTimeAgo()` with Arabic relative time strings

**Deliverable**: Switching language to Arabic shows all UI text in MSA Arabic
across all 27 screens. English fallback works for any missing keys.

### Phase D: Language Selection UI

**Goal**: Users can choose their language during onboarding and in settings.

1. **Onboarding language picker** (FR-014):
   - Add a new phase at the start of onboarding flow (before carousel)
   - Show Arabic (العربية) and English options
   - Pre-select based on device locale via `expo-localization`
   - On selection: save to AsyncStorage, update i18next, apply RTL if needed
   - Remaining onboarding renders in selected language
2. **Settings language option** (FR-003):
   - Add "Language" option in Settings (before Appearance section)
   - Show current language with toggle/picker
   - On change: save to AsyncStorage, update i18next, apply RTL toggle + reload
3. Ensure language preference persists across app sessions (FR-005)
4. Add language key to logout cleanup (clear on logout)

**Deliverable**: Users can select Arabic or English during onboarding and switch
in settings. Preference persists across sessions.

### Phase E: Arabic Font Integration

**Goal**: Arabic text renders with Noto Sans Arabic for consistent premium
typography.

1. Load Noto Sans Arabic (Regular, Medium, SemiBold, Bold) via `expo-font`
2. Update `typography.ts` font family to be locale-aware:
   - When Arabic: use `NotoSansArabic_400Regular`, etc.
   - When English: use `Inter_400Regular`, etc.
3. Update `ThemeContext` or create a `FontContext` to provide locale-aware font
   families to the component tree
4. Verify all text renders with correct font across all screens in both
   languages

**Deliverable**: Arabic text uses Noto Sans Arabic consistently. English text
continues using Inter. No system font fallback visible.

### Phase F: Accessibility & Edge Cases

**Goal**: Screen readers work correctly in RTL, edge cases are handled.

1. Verify VoiceOver (iOS) and TalkBack (Android) reading order follows RTL
   visual layout (FR-016)
2. Add `accessibilityLanguage="ar"` hints where needed
3. Test bidirectional text (Arabic with embedded English brand names, numbers)
4. Verify Arabic-Indic digits and `ar-EG` separators in Arabic financial
   displays (FR-009)
5. Test missing translation key fallback → English (FR-006)
6. Test device language change while app is running → in-app preference wins
7. Verify date formatting shows Arabic month names in Arabic mode

**Deliverable**: All edge cases from spec are verified. Screen readers work
correctly in both LTR and RTL modes.

## Key Technical Decisions

| Decision             | Choice                               | Rationale                                                            |
| -------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| i18n framework       | i18next + react-i18next              | Most mature, Arabic plural support, namespace organization           |
| RTL mechanism        | I18nManager.forceRTL() + reload      | Platform standard. Requires ~1-2s reload but auto-flips Yoga layouts |
| Arabic font          | Noto Sans Arabic                     | Best Arabic coverage, weight parity with Inter, open source          |
| Translation storage  | Bundled JSON files                   | Offline-first, no network dependency, fast load                      |
| Category translation | system_name as i18n key              | No DB migration, scales to future languages                          |
| Date formatting      | Intl.DateTimeFormat('ar-EG')         | Native API, no external library, Gregorian with Arabic names         |
| Language persistence | AsyncStorage                         | Existing pattern, non-sensitive data                                 |
| NativeWind RTL       | Logical properties (ms-/me-/ps-/pe-) | Built-in Tailwind support, no custom utility needed                  |

## Risks & Mitigations

| Risk                                  | Impact                                               | Mitigation                                                                                             |
| ------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| RTL requires bundle reload            | Medium — brief loading screen during language switch | Show splash screen during reload. Communicate that layout direction change requires brief refresh.     |
| Inter font Arabic fallback            | High — inconsistent typography                       | Noto Sans Arabic loaded alongside Inter. Locale-aware font selection.                                  |
| NativeWind directional classes missed | Medium — some elements don't flip                    | Comprehensive audit of all 27 screens. Grep for `ml-`, `mr-`, `pl-`, `pr-`, `text-left`, `text-right`. |
| Translation key mismatches            | Low — English shown instead of Arabic                | TypeScript-typed translation keys. CI check for missing keys.                                          |
| Carousel RTL behavior                 | Medium — slides may not reverse                      | Test `react-native-reanimated-carousel` in RTL. May need `inverted` prop.                              |

## Complexity Tracking

No constitution violations. No complexity justifications needed.
