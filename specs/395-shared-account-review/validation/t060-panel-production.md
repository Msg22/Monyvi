# #395 T060 — compact AccountReviewPanel presentation source

**Result:** props-only production source authored, SOURCE RELEASED, validation **NOT RUN**. Root-approved source parent: `023ca0e0a87907b394a2e1b6ea603c7a185b025f` (parent tree `6fdc98b87ae7b05e7903a2198d58f64a12f114c0`). This lease owns only **new** `apps/mobile/components/transaction-review/AccountReviewPanel.tsx` and this **new** report. No pre-existing blob changed, including all T057/T058 tests, T059 projection, T020/T031 children, locales, hooks, routes, Undo, private storage, SQL or sync. Parent `AccountReviewPanel.tsx` and report paths were absent.

## Source authority and API

- Governing immutable `c02a773613f9b6ebc5ca01aae02dd41863fd0e90`: `AGENTS.md`, `.agent/workflows/team-led-delivery.md`, `.agents/personas/frontend-developer.md`, and `.agent/workflows/mockup-implementation.md`. Constitution 1.8.0 technical authority remains the separately approved policy at `503f5a1336ba23f6d270615ce1ba47b02116e4f0`.
- Approved feature/spec/mapping at `1264134305c126a7836cf09e8f7843609a8c8555`: spec sha256 `e012f5a7d2edadc8bc1e2fa2ce03aeea56bc0c947dc02bfc2a3f166150e2c7d0`; B1 manifest sha256 `cf447362f73c91f975f97ecf2295bce1ed8300213f701f6caab181ee997059a0`; 2026-10-14 owner receipt and all 23 scoped approved bindings retain their original authority.
- Consumed **actual frozen** `SharedAccountSuggestionsProps` / `SharedSuggestedGroupView` / `SharedReviewSummaryView` from T031 and `DefaultAccountInfo` / `DefaultAccountWhySheet` from T020. The panel does not reimplement those views, group actions, statuses, menus, FlatList or modal inset rules.
- `AccountReviewPanelProps extends SharedAccountSuggestionsProps`, with canonical type-only `filter: AccountReviewSession["filter"]`, `visibleRowIds: readonly AccountReviewRow["rowId"][]`, `readyVisibleRowIds: readonly AccountReviewRow["rowId"][]`, `defaultAccountName: string | null`, `isWhySheetOpen`, and purely parent-owned `onFilterChange`, `onSelectReady`, `onClearSelection`, `onDefaultWhyPress`, `onCloseWhy`.
- Named export `AccountReviewPanel` from the **new module path**, without touching package index, hooks, service modules or callers. Root/T061 decides runtime mounting and source-specific footer/transaction list.

## Frozen T058 17-case expectations and B1 mapping

| References | Screen/body implementation |
| --- | --- |
| R3-05 (approved combined `76355e32…`), R3-15 Arabic (`3afa8d8d…`), R2-01 grouping concept (`2170f443…`) | One T031 compact Review details card for pending QNB3+CIB1 and the currency issue; T020 default2 quiet note; **separate sibling** three filters and Select ready/Clear toolbar; global 7/5/2 displayed by shaped summary without recalculation |
| R3-07 (`66ef741a…`), R3-12 Why (`b191d57b…`) | Two default selected rows show T020 quiet disclosure/controlled Why modal; T031 naturally returns null for zero group/issue labels; no empty detail card, filters and toolbar **remain** |
| R3-08 (`79e13fdc…`) | T031 issues-only compact card shows approved account/currency/amount/category **parent-shaped issueLabels**; no default/empty group surface |
| R3-09 (`e3cde1b9…`) | T031 displays independently confirmed QNB/CIB statuses; its menu/edit callbacks remain group-scoped; panel does not check other rows |
| R3-06 (`121ac845…`), R2-02 independent action (`c7eced83…`) | Existing T031 removal/status/Undo and pending group action menus remain untouched; only external callbacks handle mutations |
| R3-10 (`fc68ed3c…`) | No detail card or default disclosure; the three filters and toolbar still render as siblings |
| R3-11 (`db1daed3…`) | Empty Selected filter produces `account-review-filter-empty`, approved title/help and `account-review-show-all` which calls `onFilterChange("all")` only; does not invoke recorder no-result UI, account confirmation, Save or selection |
| R2-03 six-group View all (`07194c42…`) | Delegates to existing T031 complete FlatList, independently owned menu, parent-controlled sheet visibility and inset (unchanged) |

Exactly **three filters** (`all`, `needs_review`, `selected`) use the canonical union and parent-supplied **global** counts. TestIDs `account-review-filter-all`, `account-review-filter-needs_review`, `account-review-filter-selected` have labelled button roles and actual controlled `accessibilityState.selected`. Their active state uses existing gold semantic tokens. The separate toolbar provides `account-review-select-ready` disabled for zero parent-shaped `readyVisibleRowIds`, and `account-review-clear-selection` disabled for global zero selections or busy state; neither performs state mutation. Buttons are minimum 44/48dp with wrapping text and NativeWind semantic tokens; **no forbidden interactive alpha/opacity/shadow classes**. No new colors, gradients, icons, copy meaning or formatters.

The accepted shaped interface does not include an independently calculated *selected count within Needs review*; Clear's disabled appearance uses global `summary.selectedCount`, while the parent/controller's canonical `clear_selection` command must still obey the current filter. The panel does not guess row readiness/selection or duplicate T059's guarded logic. If Root needs precise filter-local Clear affordance later, that would require a separately reviewed parent-shaped presentation input, **not** a new UI business rule.

**Layout:** 390×844 comparison composition, 20dp outer gutter, 350dp fluid maximum inner surfaces, 12dp section gap, active gold filter state, shared light/dark/EN/AR/RTL patterns. `ReviewFilterBar` mirrors in Arabic; toolbar uses existing `shouldUseCompactLayout` to stack below 340dp or above font scale1.35 and allows labels to wrap at 340/390. T031 owns long-group-name responsive wrapping and T020/T031 reuse `useModalBottomInset`, keyboard scroll and protected bottom insets in their sheets. Parent still owns actual transaction rows, navigation, footer and source-specific behavior; component layout assertions cannot establish native pixel/screen-reader correctness.

**Localization:** Uses existing `review_mode_all`, `review_mode_needs_review`, `show_all`, and `no_transactions_to_review` keys. Missing T072 additions use **only** the exactly approved R3 EN/AR fallback meanings for Selected, Select ready, Clear selection, and Selected-empty recovery; T072 remains exclusive locale owner. No new dictionary mutation.

## Invariants / independent callbacks

- `SharedAccountSuggestions` receives existing group props/callbacks directly; confirmation is **never** translated into bulk select or an extra provider request. Per-group confirm/edit/replace/remove/Undo/View all actions remain independent.
- `DefaultAccountInfo` and controlled `DefaultAccountWhySheet` receive a parent-shaped account name and count only; no fallback account is picked by this component. Null name/count zero suppresses the disclosure. Why is gated off while the parent-controlled all-groups sheet is open; parent must preserve one active modal across separately controlled group-menu and Why transitions.
- All filter/ready/clear/Show all actions call only their supplied callbacks, with no local account/review/selection state, no DB, no service/hook, no reducer, no Save and no synthetic account/financial effect.
- Filter-empty recovery applies only when the parent says the active filter is not All and the visible row IDs are empty. Existing recorder no-result state is never rendered.
- T059 pure projection and T057 suite remain unchanged; Root reported **42/42 pure PASS** before this lease, not re-executed here. T058 creation Red at missing SUT had **0 assertions** before this production file, with the prior TurboModule issue fixed by a separate accepted lease; this source handoff does **not** claim test Green.

## Validation / remaining owner gates

**NOT RUN in this lease:** Jest T058 (14 definitions / 17 parameterized instances), T057/selection regression, TypeScript, lint, formatting, consolidated checks, Maestro, native emulator/device, provider, screenshot/overlay, RTL/layout/dark/landscape/keyboard, screen-reader/focus/announcements or accessibility. Source was authored remotely through GitData only. Root must fetch the exact unreferenced child, independently validate B1 semantics/expected file set, run its consolidated check batch and independent reviews; any test failure goes back to a newly bounded owner correction. T061 shell/hook/save/route integration and T062/T063 actual rendered and accessibility evidence remain separate and unclaimed.

**No new product decisions. No old work reverted. No Git refs, pushes, PR/comments, hosted mutations, native execution or Codex handoff. STOP after handoff.**
