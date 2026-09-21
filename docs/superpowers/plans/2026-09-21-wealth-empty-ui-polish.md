# Home Wealth Disclosure and Metals Empty State Implementation Plan

> **For implementers:** execute this plan with strict red-green-refactor cycles. Tracking issue: #319. Stack base: `codex/issue283-terminal-details` at PR #315.

**Goal:** Deliver the approved collapsed Home wealth disclosure and premium illustrated My Metals empty state without changing financial calculations, persistence, schema, or sync behavior.

**Architecture:** Keep portfolio/read-model ownership unchanged. Add a small Home controller that owns ephemeral disclosure state and delegates to presentational components. Add a dedicated presentational Metals empty-state component and a shared true-empty predicate used by both route chrome and portfolio content. Reuse production metal assets through the existing manifest.

**Tech:** React Native, Expo Router, NativeWind, React Native Reanimated, i18next, Jest/Testing Library.

---

## Task 1: Home wealth disclosure

**Files:**
- Create `apps/mobile/components/dashboard/WealthDisclosure.tsx`
- Create `apps/mobile/components/dashboard/HomeWealthSummary.tsx`
- Modify `apps/mobile/components/dashboard/TotalNetWorthCard.tsx`
- Modify `apps/mobile/components/dashboard/WealthBreakdownSection.tsx`
- Modify `apps/mobile/app/(private)/(tabs)/index.tsx`
- Add/update focused dashboard tests

**Steps:**
1. Add failing tests for canonical-decimal visibility, collapsed default, expand/collapse, focus reset, Arabic copy, accessibility state, reduced-motion timing, close X, and holding-count semantics.
2. Confirm GitHub Actions is red for the expected missing behavior.
3. Implement the smallest controller/disclosure changes, using exact decimal parsing and non-persisted local state.
4. Add restrained fade/translate reveal with zero duration under Reduce Motion.
5. Keep the breakdown panel on an ordinary slate border with no glow, halo, connector, or luminous shadow.
6. Re-run focused and repository checks through GitHub Actions.

## Task 2: Premium My Metals empty state

**Files:**
- Create `apps/mobile/components/metals/MetalPortfolioEmptyState.tsx`
- Modify `apps/mobile/components/metals/MetalPortfolioScreen.tsx`
- Modify `apps/mobile/app/(private)/(tabs)/metals.tsx`
- Modify English and Arabic Metals locales
- Add focused Metals tests

**Steps:**
1. Add failing tests for the true-empty predicate, hidden zero chrome, illustrated composition, CTA behavior, Arabic copy, decorative accessibility, compact/enlarged-text layout, and populated-state regression.
2. Confirm GitHub Actions is red for the expected missing behavior.
3. Compose the illustration from the existing `gold:coin` and `silver:bar` manifest assets on a restrained Nile-green plinth.
4. Make the empty CTA the sole Add action while empty; keep populated controls unchanged.
5. Use centralized compact-layout helpers, wrapping copy, RTL mirroring, safe bottom clearance, and no looping animation.
6. Re-run focused and repository checks through GitHub Actions.

## Task 3: Integration, review, and delivery

**Files:**
- Update PR description/evidence only; no unrelated source changes.

**Steps:**
1. Run/inspect GitHub Actions for typecheck, lint, Jest, and i18n checks; fix only failures attributable to this branch.
2. Review the final diff for financial/data-boundary regressions, hardcoded colors, unsafe Pressable styles, RTL directionality, and truncation.
3. Refresh PR state and unresolved threads.
4. Record the exact final SHA, GitHub checks, manual QA matrix, and pending Codex-only gates: rendered comparison, governed mockup binding, accessibility-tree verification, and physical-device QA.
5. Do not merge.
