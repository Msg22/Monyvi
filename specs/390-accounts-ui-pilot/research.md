# Research: Accounts UI Pilot

**Date**: 2026-10-11. Bounded planning reconciliation, not a new app-wide audit.
**Governing main / worktree HEAD**: 3264eba2b67bcc66cddc95e3fbdb36e8705ee642.
**Current pending PR #383**: 0e7ee55abf6fb18af37e29e4f2e48ba45604a31e, OPEN/unmerged according to root's live GitHub refresh.
**Historical review pin**: d45745a5c8a13db082eab24e12c2cc072e26c124. Existing spec appendices retain that historical evidence; it is not the current PR content.

## Decision 1: Reuse the existing field family

**Decision**: Keep TextField, GroupedMoneyInput/GroupedDecimalInput, Dropdown, CurrencyPicker, PageHeader and current Account selectors/sections. Add small shared label/name/message responsibilities only when concrete repeated consumers require them.

**Rationale**: The approved pilot standardizes equivalent controls while allowing existing form layouts. A universal conditional FormField would combine value contracts, validation and layout needlessly.

**Alternatives considered**: New form engine; replacing Type radios with Dropdown; replacing the picker. All widen scope and alter existing interactions.

## Decision 2: Preserve and reconcile pending PR capabilities

The following exact files were fetched read-only from Msg22/Monyvi at current PR head; no branch integration or code execution occurred.

| File | GitHub blob SHA | Current observation |
| --- | --- | --- |
| apps/mobile/components/ui/GroupedDecimalInput.tsx | 8fcb0b580dd0f28aa9dc29ddfa7273b887e1aa46 | onFocus/onBlur, class/style/label and soft-keyboard forwarding already exist; hardcoded outlined variant and formatAmountInput(value) remain |
| apps/mobile/components/ui/GroupedMoneyInput.tsx | 3e3044ee6c7767209b328fd5f0e874ce425ec7fa | Delegates the GroupedDecimalInput props contract |
| apps/mobile/components/ui/Dropdown.tsx | 13ff5682b10bdb614aa3c28b0192851ad75d4768 | Nullable value, error state, selected adornment and label/trigger/selected styling already exist |
| apps/mobile/components/ui/TextField.tsx | 83407b4475b008d52367c024c39a29970c6a7f75 | Ordinary focus-local draft and explicit syncWhileFocused remain; required fallback is a hint, override accessible name still bypasses required-name composition |
| packages/logic/src/utils/amount-helpers.ts | 216ebbc355aaf09200c9fc21ec6f3bc43a71a825 | Resolver intermediates remain unsigned; formatter applies grouping without validating the full raw string |

**Decision**: Do not duplicate these pending capabilities. Keep current wrappers and add missing backward-compatible pilot contracts after integration route is chosen and regressions fail meaningfully.

**Rationale**: Main and pending branch differ; copying stale snapshots risks losing new keypad/soft-input and styling support.

**Alternatives considered**: Blind cherry-pick, reimplementation from the historical pin, immediate edits in dirty primary checkout. Rejected; root must authorize an explicit dependency integration route.

**Remaining prerequisite**: Refresh exact head at dispatch and prove selected base contains the required APIs. This is a delivery dependency, not a new product question.

## Decision 3: Numeric behavior is text presentation

**Decision**: Preserve Add unsigned and Edit signed grammar, arbitrary accepted Account decimal length, trailing-zero/intermediate correction, pristine dirty detection and existing save conversion. Proposed signed option is opt-in; existing consumers stay unsigned/outlined.

**Rationale**: Pinned amount helper recognizes unsigned grouped intermediates and single edits of formatted text; signed edits/caret need failing regressions before extending it. Raw rejected callback forwarding does not by itself prevent formatter changes to abc12345.

**Alternatives considered**: Strip invalid characters, globally enable negative input, apply currency precision/rounding, parse balances as floats during every keystroke. Rejected because they alter financial or correction behavior.

**Contract**: Canonical12345.678 displays as12,345.678 in the input; current preview stays12345.678. Malformed abc12345 remains verbatim. No new financial calculation/persistence representation introduced.

## Decision 4: Business behavior is already settled

**Decision**: Follow the user-approved correction in docs/business/business-decisions.md: active nicknames unique per user/currency/provider identity; known registry identity takes precedence, otherwise normalized manual name, otherwise common no-provider identity; Edit excludes its own account.

**Rationale**: User confirmed current code correct. Both create and edit services use scoped local/currency queries and equivalent identity normalization. Shared UI receives validation feedback; it does not implement uniqueness policy.

**Alternatives considered**: Restore obsolete documentation by changing code. Rejected explicitly by user.

## Decision 5: Approved design has bounded evidence

**Decision**: Govern by approved package sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e and its eight calibrated sidecars. Keep existing platform font and registered tokens.

**Rationale**: Package establishes HTML PNG geometry and design approval, not native dp/font equivalence. Locked geometry/message priority are approved in this exact package; later fact/image changes invalidate approval.

**Alternatives considered**: Treat generated concepts as governing images; hardcode native sizes from SVG/browser font metrics; declare visual completion before native comparison. Rejected.

**Execution evidence still required**: Native font/Arabic metrics, emoji versus SVG glyph, density/insets, BlurView/transition rendering, keyboard/caret/bidi, actual screen-reader announcements and modal focus; tablet/landscape references are absent. These are named verification/calibration tasks before completion, never inferred passed from HTML.

## Decision 6: Coverage and ownership

**Decision**: One foundation writer owns shared production and its failing tests; Account adoption follows its Green published API. Account writer owns real-screen tests and controllable Maestro journeys. Independent QA audits the mandatory35-case map; ordered TypeScript, logic and style reviewers inspect exact integrated code.

**Rationale**: Parallel shared-file writers would conflict; a separate test writer can create implementation coupling or overlapping edits.

**Alternatives considered**: Migrate both screens while API changes; rely solely on mocked hook/control tests; call clipboard/caret/TalkBack automated from inputText/props. Rejected.

Existing suite paths were verified by bounded discovery: TextField.test.tsx, GroupedDecimalInput.test.tsx, useAccountForm.test.ts, useEditAccountForm.test.ts, account-validation.test.ts, add-account-institution-info.test.tsx, edit-account-institution-info.test.tsx; logic amount-helpers.test.ts; Maestro accounts/egyptian-institution-presets.yaml. No Dropdown-named suite was found in that bounded main directory search; pending PR tests require separate exact-head discovery. This is not a repository-wide absence claim. None were run.

## Resolved design choices versus execution prerequisites

No unanswered business/design clarification is introduced. API parameter spelling is proposed in implementation-design.md, not runtime evidence. Dependency route, native calibration and controlled failure/clipboard harness capability must be verified before affected work; stop if evidence reveals a contract conflict. All35 QA cases remain NOT RUN.
