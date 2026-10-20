# Monyvi Design System

## Shared selection and keyboard standards (2026-10-20)

## 5A. Selected Options And Keyboard-Reachable Forms

**Global selection state (owner-approved 2026-10-20):** Use the existing
`Dropdown`, `CurrencyPicker`, and shared picker/option primitives. Upon opening,
the **currently selected option** has a **filled Nile-green** selected
background, **white legible text in light and dark mode**, and a **white
contrasting check/icon** if shown; green text or a green check on green is not
acceptable. This is the actual choice, not merely a green border, translucent
tint, hover state, or a guessed first option. Expose accurate
`accessibilityState.selected`/`checked` and keyboard/screen-reader labels. Check
selected state from the real controlled value in focused render-contract tests;
dark/RTL contrast and actual navigation require separately captured
native/rendered evidence.

**Global keyboard reachability:** Reuse `TextField` and keyboard-aware,
scrollable shared form/modal shells for every text input. With the soft keyboard
open, the focused field (including the last field), its label/helper/error, and
form completion/dismissal remain reachable on Android/iOS, compact screens,
landscape, RTL and increased font sizes. Measure the **usable keyboard-adjusted
viewport**, available header/footer space and safe-area insets at runtime,
scroll the focused field into view, and do not derive reachability from nominal
window height, a guessed keyboard offset or duplicate padding. A
Jest/class/style assertion cannot certify physical on-device keyboard clearance;
record native manual evidence or mark it NOT RUN.

**Rollout:** This applies to new and touched surfaces app-wide. Shared component
enforcement is separately owned; inventory bespoke selectors/fields over time,
migrate them in focused changes and report remaining gaps. This section is a
rule, not a claim of existing full-app compliance or a second design gate.

### Owner-approved compact account-review alignment (#395 only)

Preserve the existing approved #395 composition during its scoped
implementation/review; this is **not** a new app-wide layout template: the
linked-transactions action starts at the account **title-text column** (not
beneath the leading icon); deferred-account-creation and Cash/default
information notes use the same information-icon/text columns. The four review
tabs stay on one row, becoming horizontally scrollable **only when the actual
available width overflows**, not stacked based on a guessed device width. Center
inline action controls and keep **Remove red**; account/category icon, name and
pencil share their first row, with the status on a separate line. Validate real
EN/AR, light/dark and enlarged-font reflow using native/rendered evidence, not a
Jest geometry claim. No new mockup or approval is required for fidelity to these
already approved facts.

**Last updated:** 2026-10-20  
**Status:** Implementation-aligned UI and theme guide

This document describes the UI conventions currently implemented in
`apps/mobile`. It also marks known inconsistencies so future work can improve
the system without guessing.

For future design proposals, follow
[interactive design workflow](interactive-design-workflow.md): the primary
mockup is a portable runnable browser design with scoped width, text, locale,
theme, state and interaction scenarios, stored under the feature's `mockups/`.
Use established tokens and components as design inputs; the approved runnable
artifact **itself** is the visual/responsive reference for **native React
Native** implementation. A short README documents version, run instructions,
scenarios and native-only differences; new interactive designs require **no
binding sidecar or second metadata approval**. Browser previews/screenshots do
not prove native fidelity, safe-area or keyboard correctness. Historical
approved image bindings remain valid for their original surfaces.

## 1. Design Direction

Monyvi should feel like a trusted personal finance companion: calm, premium,
fast, and practical. The interface should make repeated money workflows easy to
scan and complete, while supporting Arabic, English, dark mode, and mobile
ergonomics.

The design should prioritize:

- Clear financial hierarchy: balances, trends, due items, and actions.
- Low-friction entry: voice, SMS import, quick actions, and concise forms.
- Trust: predictable navigation, explicit review before automated writes, and
  recoverable error states.
- Offline confidence: skeletons and local data should make the app feel usable
  even while sync is happening.

## 2. Theme Tokens

Primary sources:

- `apps/mobile/constants/colors.ts`
- `apps/mobile/tailwind.config.js`
- `apps/mobile/global.css`
- `apps/mobile/context/ThemeContext.tsx`

### Palette

The raw palette includes:

- Nile green for brand and success/action.
- Gold for wealth, metals, and warning accents.
- Slate neutrals for backgrounds, surfaces, text, and borders.
- Red for destructive and expense states.
- Blue/orange/silver/violet/brand colors for supporting use cases.

### Semantic Themes

`lightTheme` and `darkTheme` define:

- `background`
- `backgroundGradient`
- `surface`
- `surfaceHighlight`
- `text.primary`
- `text.secondary`
- `text.muted`
- `text.inverse`
- `border`
- `tint`
- `statusBarStyle`

Runtime theme mode is `light`, `dark`, or `system`, persisted in AsyncStorage by
`ThemeContext`.

### Tailwind Registration

Use NativeWind classes first. The Tailwind config exposes semantic tokens such
as:

- `bg-background`
- `bg-surface`
- `text-text-primary`
- `text-text-secondary`
- `text-text-muted`
- `border-border`

It also exposes selected palette families such as `slate`, `nileGreen`, `gold`,
`silver`, `blue`, `orange`, and `red`.

Known gap: not every color in `colors.ts` is registered in Tailwind. When a
missing palette value is needed, add it to `tailwind.config.js` deliberately
instead of hardcoding the hex in JSX.

## 3. Typography

Primary source: `apps/mobile/constants/typography.ts`.

Fonts:

- Inter for LTR English UI.
- Noto Sans Arabic for RTL Arabic UI.
- Readex Pro is loaded for brand use.

Use locale-aware typography through `getTextStyles()` when a style object is
needed. `textStyles` is deprecated because it is static Inter-only.

Common scale:

| Token         | Size/line height | Use                             |
| ------------- | ---------------- | ------------------------------- |
| `h1`          | 28/34            | Major screen hero headings.     |
| `h2`          | 24/30            | Screen headings.                |
| `h3`          | 20/26            | Section headings.               |
| `h4`          | 18/24            | Compact headings.               |
| `body`        | 14/20            | Standard body text.             |
| `caption`     | 12/16            | Metadata and supporting labels. |
| `amountLarge` | 32/40            | Large financial totals.         |

## 4. Shared Class Compounds

`apps/mobile/global.css` defines reusable class compounds:

- `input-label`
- `input-error`
- `subtitle-text`
- `body-text`
- `body-small`
- `caption-text`
- `stat-label`
- `stat-value`

When the same class combination repeats across components, add a compound in
`global.css` rather than duplicating it across files.

## 5. Reusable Components

Use these primitives before creating new local variants:

| Component              | Purpose                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `PageHeader`           | Standard screen header with safe-area handling, drawer/back actions, selection mode, and right actions. |
| `TextField`            | Labeled text input with error state and controlled draft behavior.                                      |
| `Dropdown`             | Inline or bottom-sheet selection control.                                                               |
| `OptionalSection`      | Expandable optional form section.                                                                       |
| `Skeleton`             | Theme-aware shimmer loading primitive.                                                                  |
| `ToastProvider`        | **Legacy retained** for untouched screens; no new error/warning/success toasts.                         |
| `SectionErrorBoundary` | Recoverable section-level failure UI.                                                                   |
| `RetrySyncScreen`      | Startup recovery when sync/profile state is unsafe.                                                     |
| `StartupLoadingView`   | Branded startup/account loading state.                                                                  |

`PageHeader` is the default for private screens. Known exception:
`LiveRatesHeader` mirrors PageHeader for a specialized live-rates status layout;
prefer folding future header needs back into `PageHeader`.

**Prospective feedback (owner-approved 2026-10-19):** New/changed app flows use
a persistent, dismissible page-scoped inline notice directly beneath the header
and outside scrolling content. Modal feedback belongs at the top **within the
active modal**. No new or changed error/warning/success toasts. The existing
`ToastProvider` and untouched legacy callers **remain installed** pending
gradual migration; do not claim removal. Dark informational text uses readable
primary/secondary contrast (not disabled/muted); preserve approved semantic
selected/warning fills and only the approved transparent information-icon
backdrop. Follow `AGENTS.md` and the #395
[owner R2 feedback](../../specs/395-shared-account-review/validation/owner-feedback-r2.md).

## 6. Loading And Progress

Content loading should use skeleton layouts built from `Skeleton`.

Allowed spinner use:

- Short button/action progress.
- Inline action confirmation where content is already visible.

Avoid spinner use for whole-screen content loading. Known debt remains in some
screens, including transactions, recurring payments, and budget detail.

Animations and long-running loops must clean up on unmount. Reanimated infinite
animations should be cancelled when applicable.

## 7. Layout And Safe Areas

Rules:

- Root `SafeAreaProvider` must pass `initialWindowMetrics`.
- Apply top inset once per screen.
- Prefer `PageHeader` for header safe-area handling.
- Avoid nesting `SafeAreaView` inside a subtree that already applied top
  padding.
- Use `FlatList` or `SectionList` for long lists.
- Use `ScrollView` for shorter form/detail content.
- Keep bottom padding aware of tab bars, FABs, and modal sheets.

## 8. Styling Rules

Preferred:

- NativeWind `className` through its configured JSX transform. A source
  assertion of the class string is not proof of Babel/NativeWind interop or
  applied native styling; see `AGENTS.md` for raw `React.createElement` in `.ts`
  helpers and the rendered-evidence distinction.
- `dark:` variants for theme differences.
- Palette and semantic Tailwind tokens.
- `palette` imports only for component props that require raw color values, such
  as icon color or placeholder color.

Allowed inline style exceptions:

- Dynamic computed values, such as width percentages.
- Safe-area padding from runtime insets.
- NativeWind v4 crash workarounds on `TouchableOpacity` and `Pressable` for
  `shadow-*`, `opacity-*`, and `bg-color/opacity`.
- Third-party component props that do not accept `className`.

Current debt:

- Several `StyleSheet.create` usages remain.
- Some raw hex literals remain.
- Some `ActivityIndicator` content-loading states remain.

Do not add new instances of those patterns unless they are covered by an allowed
exception and the reason is local and obvious.

## 9. Icons And Actions

The current app primarily uses `Ionicons` from `@expo/vector-icons`. Continue
using the active icon system unless a broader migration is planned.

Guidelines:

- Prefer icon buttons for familiar actions. A quiet pencil/icon can stay
  visually small and unbordered while its **effective** 44/48 dp hit target uses
  available parent space and in-bounds touch extension; the target is not a
  mandatory 48 dp visible border/fill box. Do not overlap neighboring
  interactive targets; see `AGENTS.md`.
- Pair icons with text when the action is not obvious.
- Keep destructive actions visually distinct with red states.
- Make modal and sheet actions explicit and reversible where financial data is
  involved.

## 10. Localization And RTL

Monyvi supports English and Arabic.

Implementation:

- i18n resources are namespace-based.
- Translation resources load at initialization; this does **not** prove that
  each new namespaced screen key exists. Resolve changed user-visible labels in
  both English and Arabic, rather than displaying raw missing-key text.
- The root gesture view sets `accessibilityLanguage`.
- RTL changes force an app reload when necessary.
- Use `useTranslation("namespace")` inside functional components.
- Non-component code should use stable codes internally and translate only the
  final user-visible message.

Known debt:

- Root `ErrorBoundary` still calls `i18next.t()` directly. This should be
  replaced with the approved pattern when touched.

## 11. Error States

Use explicit, recoverable error states:

- Root app crashes go to `ErrorBoundary`.
- Section failures should use `SectionErrorBoundary`.
- Startup sync/profile failures use `RetrySyncScreen`.
- Services should return stable error codes where UI needs specific handling.
- Do not expose sensitive backend or financial details in user-facing messages.

## 12. Documentation And Audit Notes

When changing a major screen or shared UI primitive, update this document if the
change affects:

- Theme tokens.
- Shared class compounds.
- Header or safe-area conventions.
- Loading-state patterns.
- RTL/localization behavior.
- Allowed styling exceptions.
