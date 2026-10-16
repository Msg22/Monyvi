# #395 T021 — final bounded row/test hygiene correction

**Mode:** frozen scoped correction; SOURCE RELEASED; **NOT RUN**. Exact immutable parent: `2c8cc26fe28938be2ca12d22dd6988ec1e84b263` (Git tree `5fe1dc0f3f9dbed1001301ae3da17b89645d1357`). Current approved governance / Constitution / B1 manifest and business contracts remain unchanged. Root performs the next eight-suite grouped admission and independent review.

## Changed-only provenance

| File | Parent blob (before) | New blob |
| --- | --- | --- |
| `apps/mobile/components/transaction-review/TransactionItem.tsx` | `26f2717191fd9a33acc298b5c81f1e6071039bd5` | `e2c424cd368606bd040939fe78e80d212214309e` |
| `apps/mobile/components/transaction-review/account-review-row-presentation.tsx` | `a4a277c68a8734e1e1577fa3c1ea8d1bb0e2223b` | `c71334bc1e71dd85fbec0c26b9c39c74c26b72ed` |
| `apps/mobile/__tests__/components/account-review-panel.test.tsx` | `fa161e3605be0981cbbc44ce37a325a4ced1dfb1` | `64b815065324c1473786183709a207f82944cfbf` |
| `apps/mobile/__tests__/components/account-review-transaction-item.test.tsx` | `35a0c5b3b2500dbac4cdd65a61e6b6eba8eafcb3` | `7d39e95269710fc89b82352c4a368d5867f814c6` |
| `specs/395-shared-account-review/validation/t021-row-hygiene-final.md` | **absent** | **new report (this file)** |

## Root's pre-correction observation and exact remediation

Root independently reported grouped eight-suite admission **151 PASS / 4 FAIL out of 155**, with all 17 T058 panel cases passing. Three failures involved *new* T021/T039 row assertions (two exact-host-object checkbox comparisons and one Arabic partial text match), and one involved an **unmodified existing legacy** `TransactionItem.test.tsx` checkbox assertion. No suite was rerun by this worker.

1. **Legacy checkbox prop shape preserved** (`TransactionItem.tsx`, parent source lines 293–310). Parent's `disabled={reviewIsBusy}` emitted a new explicit `disabled={false}` even when **no** `accountReview` prop existed. The legacy test `apps/mobile/__tests__/components/transaction-review/TransactionItem.test.tsx` L245–256 expects the original exact `accessibilityState={{ checked: true }}`. This change conditionally **spreads `disabled: true` only for the genuine new row busy state**: `{...(reviewIsBusy ? { disabled: true } : {})}`; when absent or nonbusy, the `disabled` prop is entirely omitted. The `accessibilityState` remains `{checked:isSelected}` in that case and `{checked:isSelected,disabled:true}` when busy. The existing `handleToggle` busy guard remains. The legacy test file is unmodified.
2. **Unchecked controls use host-supported semantic matchers** (`account-review-transaction-item.test.tsx`). Two checks previously asserted exact equality with `{checked:false}` using `toHaveProp("accessibilityState", ...)`; RNTL may include additional host fields. Both now use `.not.toBeChecked()`, preserving the original assertions that all three QNB row checkboxes remain unchecked after a single callback, and that confirmed status did not check its row. The `onToggleSelect(1)`, no group confirm, stable parent state, and independent-action checks are untouched.
3. **Full approved Arabic disclosure** (same row test; R3-15). Instead of matching the shorter literal prefix `"اختيار معاملة من QNB"` (which failed despite the full correct approved disclosure being present), the test now asserts `toHaveTextContent(qnb.disclosureText)` from the existing approved `requireArabicQnb()` fixture. The independent `.not.toHaveProp("numberOfLines", 1)` assertion still requires an untruncated display. No UI/source copy is weakened or altered.
4. **Panel lint-only unsafe host-property access** (`account-review-panel.test.tsx`). All/Needs review/Selected controlled selection now uses `toBeSelected()` for the active filter and `not.toBeSelected()` for other filters instead of the unsafe `button.props.accessibilityState?.selected` access. The ready toolbar's prior `ready.props.accessibilityState?.disabled` assertion becomes `toHaveProp("accessibilityState", expect.objectContaining({ disabled: true }))`. Its separate `toBeDisabled()`, synthetic `fireEvent.press` and **no callback** assertions remain unchanged. No panel production file changed.
5. **Static RTL writing direction style** (`account-review-row-presentation.tsx`). Added `StyleSheet.create({rtl:{writingDirection:"rtl"},ltr:{writingDirection:"ltr"}})`, reused for both status and shared-disclosure `Text` surfaces. Eliminated inline `style={{writingDirection:...}}` objects and the unused `TextStyle` type. Semantic color/icon tokens, approved copy, labels, touch targets, responsive behavior, callback wiring, and `React.memo` comparator remain intact.

## Preserved invariant and B1 matrix

- **Original legacy `TransactionItem` checkbox/accessibility** — exact checked-only props when the new optional `accountReview` input is absent; accessibility still explicitly disables the checkbox for parent-supplied new busy state.
- **R3-05/R3-09** — individual QNB selection never confirms an entire group, status updates do not select rows, and no downstream group mutations occur from the presentation.
- **R3-15 Arabic** — assertion now checks the complete approved, existing fixture text rather than an incomplete prefix, and retains the no-single-line truncation check.
- **R3-07/R3-08/R3-10/R3-11** — panel conditional details, Why, filters and selection toolbar remain unchanged; all 17 authored panel cases remain. T021/T039 row suite retains its 19 ordinary cases plus three responsive instances (**22 instances**); all test names, callback observations, memo checks and accessibility cases remain.
- **No business duplication** — the optional row input remains display-only; neither the account/currency chooser, route, reducer, service, DB, SQL, private storage, hooks, nor parent command architecture was touched. Full T039 route wiring remains separately owned.

## Evidence and gate

**NOT RUN**: Jest, TypeScript, lint, formatter, Maestro, emulator, device-native rendering, screenshot/B1 fidelity, screen-reader or accessibility traversal, provider, hosted Supabase, Git ref movement, branch/PR/comments, push or delegation. This is a **source-only correction** with Root's historical failure diagnosis; no new Green or production readiness claim.

**Root next**: run grouped eight-suite/155 test admission and scoped type/lint/format batch; verify existing legacy checkbox exact prop shape, row22, panel17 and visual/a11y gates independently. Preserve the clean distinction between tests showing behavioral correctness and rendered/device proof. **SOURCE RELEASED — STOP.**
