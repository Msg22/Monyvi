---
description: Run styling checks and common refactorings for Monyvi UI
---

# 🎨 Monyvi Styling Workflow

## Shared selection and keyboard standards (2026-10-20)

- [ ] Open picker/dropdown visibly distinguishes its ACTUAL selected option:
      filled Nile-green background, WHITE selected text on light/dark and a
      white contrasting check/icon; selected/checked accessibility state matches
      the bound value (not tint-only or green on green).
- [ ] Forms and modal/sheet text fields (including the last) stay focusable and
      scroll-reachable above the Android/iOS keyboard at compact viewport,
      enlarged font and RTL. Use measured keyboard-adjusted viewport and
      header/footer/insets, not arbitrary offsets; actions remain reachable.
- [ ] Reuse shared selector/text input/form primitives; cover selected state in
      focused source/render tests and record native dark/keyboard/font/RTL
      checks as PASS/FAIL only with execution, otherwise NOT RUN. Audit bespoke
      legacy uses incrementally; do not claim whole-app migration or TDD gate.

This workflow helps ensure that building components follow the established
styling rules. Apply `AGENTS.md`, `docs/development-workflow.md`,
`docs/design/design-system.md`, and `.agent/rules/styling-rules.md` before
making UI changes. Current owner-approved UI/feedback decisions take precedence
over generic checklist examples; this is not another approval gate.

The basic checks are:

1. Tailwind CSS first
2. Dark mode compliance (using `dark:` variant)
3. No static colors
4. Unified PageHeader usage

## Commands

### 🔍 Check for Styling Violations

// turbo

1. Run a grep search for common styling anti-patterns (static colors, isDark
   logic in styles).
   `grep -rE "isDark \?|#[0-9a-fA-F]{3,6}|rgba?\(|StyleSheet\.create" apps/mobile/app apps/mobile/components`

### 🏗️ Refactor Component to Tailwind

Use this when you find a component using `StyleSheet.create` or `isDark` logic.

1. Read the component file.
2. Identify all `StyleSheet` references.
3. Replace them with equivalent Tailwind classes.
4. Replace `isDark` ternary colors with `dark:` variants.

### 📋 UI Implementation Checklist

When creating a new screen:

- [ ] Uses `PageHeader` from `@/components/navigation/PageHeader`.
- [ ] Background uses `bg-slate-25 dark:bg-slate-900`.
- [ ] Text uses `text-slate-800 dark:text-white` (or similar slate variants).
- [ ] No static hex codes used.
- [ ] Interactive elements have proper `activeOpacity` or `Pressable` feedback.
- [ ] Labels fit their **actual container** with font scaling and 44/48 dp hit
      areas; status/count wraps without an orphan dot. Reused rows agree.
- [ ] Informational dark text remains legible; selected/alert fills are
      preserved.
- [ ] New/changed error, warning and success feedback uses dismissible page
      notice below the header, outside scrolling, or the active modal's top—not
      a new toast. Keyboard and footer remain reachable with one inset.
