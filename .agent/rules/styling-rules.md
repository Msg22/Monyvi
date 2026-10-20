# Monyvi Styling & UI Guidelines

This document outlines the project-specific styling and UI rules for Monyvi's
mobile application.

The governing guidance is `AGENTS.md`, `docs/development-workflow.md`, and
`docs/design/design-system.md`, alongside current approved UI bindings and
owner-approved business decisions. These rules supplement—not replace—the
current responsive, feedback, and delivery contracts.

## 🎨 Styling Rules

### 1. Tailwind CSS First

- Always prefer Tailwind CSS classes for styling.
- Minimize the use of `StyleSheet.create()` unless dealing with dynamic values
  that cannot be expressed via Tailwind.

### 2. Dark Mode Compliance

- **CRITICAL**: Use Tailwind's `dark:` variant for all dark mode styling.
- **NEVER** use `isDark` ternary conditionals in JSX attributes (e.g.,
  `color={isDark ? "white" : "black"}`) if a Tailwind class can achieve the same
  result.
- For icons or components that require a `color` prop, use `palette` references
  directly in a way that respects the theme, or better, use `className` if the
  icon library supports it (e.g., via `styled` from NativeWind).

### 3. Color Palette

- Always use the `palette` object from `@/constants/colors`.
- **DO NOT** use static hex codes or `rgba` values in components.
- Note: `palette.slate[25]` is the standard "pure white" for backgrounds/text in
  light mode.

### 4. Content fit, dark readability, and feedback

- Lay out against **actual component space and intrinsic text**, not character
  counts or screen-width guesses. Preserve scaled names and financial identity;
  use modest visual chrome inside **44/48 dp accessible hit targets** before
  wrapping. Keep status/count together where possible, without orphaned
  separators, and reuse the same row renderer across summary/detail surfaces.
- Use readable semantic secondary text in dark mode. Transparent informational
  icon backing is **state-specific**, not a license to remove meaningful
  alert/selected fills.
- In **new or changed app UI**, do not add error/warning/success toasts. Show a
  persistent dismissible page notice directly below the header **outside
  scroll**, or place modal-specific feedback at the top of the active modal;
  migrate unrelated legacy feedback gradually. Do not announce an unconfirmed
  Save.
- For sheets, keep focused fields and actions reachable with keyboard-aware
  scrolling, usable-height limits, and a **single** runtime bottom inset. Follow
  the central design system and delivery policy; do not add a cosmetic
  viewport/className test matrix.

## 🏗️ UI Architecture

### 1. Page Headers

- Use the unified `PageHeader` component for all screen headers.
- **DRAWER**: `PageHeader` internally manages the `AppDrawer` state. Do not
  implement local drawer state in screens.
- **BACK BUTTONS**: Support for `arrow` and `close` variants. Pass
  `showBackButton={true}` and `backIcon="arrow" | "close"`.
- **RIGHT ACTIONS**: Support for both icon-based and text-based actions. Pass
  `rightAction={{ icon: "...", onPress: ... }}` or
  `rightAction={{ label: "...", onPress: ... }}`.
- Right actions support a `loading` state to automatically show an
  `ActivityIndicator`.

### 2. Form Components

- Use `TextField` for all text inputs. It is pre-styled for light/dark mode and
  handles labels and error states consistently.
- Use `Dropdown` for selection fields.
- Use `OptionalSection` (or similar patterns like `BankDetailsSection`) for
  expandable optional fields to keep the UI clean.

## 🚫 Prohibited Patterns

- Static colors (e.g., `#FFFFFF`, `rgb(0,0,0)`).
- `isDark` ternary logic for background/text colors.
- Custom header implementations in individual screens.
- `withObservables` HOC for simple data fetching; prefer hooks like
  `useAccounts` or `useCategories`.
- **NativeWind shadow classes on interactive components**: `shadow-*`,
  `opacity-*`, and `bg-color/opacity` classes on `TouchableOpacity` or
  `Pressable` cause a NativeWind v4 race condition crash ("Couldn't find a
  navigation context"). Use inline `style` for shadows on these components
  instead.
