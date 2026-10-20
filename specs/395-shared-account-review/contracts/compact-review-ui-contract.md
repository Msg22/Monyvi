# #395 compact review — approved design and locally integrated implementation (2026-10-20)

**Authority and status.** The owner approved the tested compact,
default-collapsed interactive Voice review and its simplified workflow. Root
completed scoped analysis and integrated the authored compact frontend and
guarded domain/facade source locally. **This is not a committed, deployed,
native-verified or manually accepted release**; consolidated tests are running.
**No new binding metadata, reference-image verifier, or repeat design-approval
gate** applies to this concept. Historical R1–R3 image bindings/receipts remain
intact for their earlier scoped states; where compact-review layout or
interaction conflicts, the newer owner-approved interactive direction controls.
The previously authored `compact-review.binding.md` was an unapproved draft and
is **withdrawn from this active handoff**; do not mark its metadata hash
approved or preserve it as a new authority.

## Exact runnable reference and small README

- **Primary design entry:**
  `specs/395-shared-account-review/mockups/interactive/compact-review-2026-10-20/index.html`,
  Git blob `e410f2a5495ff4f9f2106e1881d540564ee7c65b`, 130827 UTF-8 bytes,
  SHA-256 `64748fe7945926d4f9e94d2e4095cbddb9dfd95a52f693d4878f0e590d68d38f`.
- Provenance: unchanged `source.fragment.html` blob
  `d07aae0eb285bcbd6e53988692cc1cef3e443572` (37194 UTF-8 bytes; SHA-256
  `bf575bec03e19f21a858efa6e67f62111c55f3f8934536ee2e63bb9eddc02de8`); controls
  SHA-256 `6bb9f811d8dc5b442684a06fe611f727e4b895bcf26bcd98a56280f2a2a01f52`;
  `reference.json` blob `0d7bd8e349694047ec343edf664b19f50c8f7e9d`.
- **README:** the integrated short
  `mockups/interactive/compact-review-2026-10-20/README.md` (blob
  `58c710605b2f37268771713eb642b0920bed7562`) records entry/version, browser
  run, 320–430 CSS px, scale 1–1.25, long-name controls, native adaptations and
  known limits. It is traceability, not a substitute design, hash approval or
  native QA receipt.
- The runnable host supplies browser color-scheme/theme context and icon/control
  scripts missing from the standalone fragment. Browser outer padding, iframe,
  fake device status, demo seed, tuning controls and CSS pixel phone geometry
  are **not** native UI dimensions. Use existing app tokens, native font
  scaling, safe-area/keyboard conventions, and measured available **container**
  width; do not hardcode web values as dp. The logged browser 320px preview is
  not RN device, RTL, screenshot or accessibility proof.

## Screen states and rendering contract

| Area                  | Owner-authorized outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Existing source boundary                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Summary/transcript    | Transactions visible early; What I heard defaults to 2 lines with expand/collapse; **Review details default collapsed**, expands account proposals inline. Show **Accounts reviewed** only after all relevant pending groups and account-needed rows resolve, never as global save-ready claim if other blockers remain.                                                                                                                                                                                                                                                                            | `voice-review.tsx` / `TransactionReview.tsx`, `AccountReviewPanel.tsx`, `SharedAccountSuggestions.tsx` |
| Groups/menu           | Pending suggestions need **explicit Confirm**. All group rows accessible inline without View all or its sheet; ellipsis expands in-place edit/use-existing/remove, with a single active edit/choice overlay. Status, type/currency, linked count and name remain visible; show a dot only when status+count share a physical line. One common account-created-at-final-Save explanation.                                                                                                                                                                                                            | `SharedAccountSuggestions.tsx`, `SharedAccountGroupRow.tsx`, `shared-account-presentation.tsx`         |
| Scope/filter          | Account needed is temporary and contains unresolved account/currency-needed rows from **any source-list position**; Show all restores full list. View linked transactions is a separate temporary full-source-order filter by _live affected row IDs_, clearly labelled, and Show all resets it. Choosing an account for an entire group lists those specific transaction names/amounts before Use. Neither drilldown changes canonical Save scope.                                                                                                                                                 | `account-review-row-filter.ts`, `account-review-filter-header.tsx`, canonical container                |
| Row                   | Checkbox/title/signed amount + currency remain intact. Account identity and category show compact pencil-in-square edit icons next to labels, rather than giant outlined chrome; only the account icon opens its picker (account name/scroll surface inert), while category quick edit remains direct. Full cash/wallet/bank identity slot preserved for stacked #405; do not import #405 logos. Reserve 44/48dp accessibility **hit areas**, reflow flexibly with actual container fit/font scale and long names.                                                                                  | `TransactionItem.tsx` and the **owner-edited** `account-review-row-presentation.tsx`                   |
| One account chooser   | Eligible account name, currency, provider context and radio selection; explicit **Use account — EGP/USD** applies chosen currency with **no numeric amount conversion**. No separate Confirm account-and-currency or Confirm currency overlay for that choice. Currency-only corrections can reuse existing picker with context, never stack two sheets.                                                                                                                                                                                                                                            | `AccountChoiceSheet.tsx` / `account-review-choice-presentation.tsx` and canonical overlay owner        |
| Draft                 | **Authored and integrated locally:** `EditSuggestedAccountSheet` now preselects canonical group currency and edits name/type/currency in **one sheet**; a single Confirm sends `edit_group.identity.currency` (optional for legacy callers) under `reconfirm: true` and unchanged owner/session/review/group CAS guards. No preview command, additional currency modal, numeric conversion or early persisted account. Precision, duplicate-group and SMS ATM incompatibilities remain reducer refusals with existing modal inline feedback. Final selected Save alone creates applicable accounts. | `EditSuggestedAccountSheet.tsx`, `account-review-choice-controller.ts`, guarded `reducer-groups.ts`    |
| Removed suggestion    | Remove detaches affected rows but keeps compact removed ghost with Undo and trash Discard. **Discard removes the ghost and irrevocably revokes that Undo for this review only**; it does not delete any transaction/account. A hidden-only UI ghost while old token still works is incorrect.                                                                                                                                                                                                                                                                                                       | `SharedAccountGroupRow.tsx`; separate domain/facade Undo owner                                         |
| Selection             | Initially ready rows and rows newly ready after explicit group/account/category change auto-select unless manually unselected; manual intent survives rerenders. `Select ready` deliberately reselects within active filter. **Selecting a pending-group row must not implicitly confirm the group.** Readiness: valid resolved account, category, positive amount, known currency, no other blockers. Presentation reflects authoritative `row.selected` only.                                                                                                                                     | **Separate domain owner**, existing `useAccountReview`/reducer and current active-filter toolbar       |
| Notice/footer/locales | Dismissible page notice directly below PageHeader **outside scroll**, and modal notice inside one active overlay; no toast. Preserve fixed footer bottom inset, keyboard avoidance, dropdown preselect, last divider, English/Arabic RTL, readable dark info copy and transparent dark info-icon backdrop. SMS ATM source/destination + Cash draft unchanged; no Voice transfer or #339 extension.                                                                                                                                                                                                  | Current `ReviewInlineNotice`, Voice/SMS routes, native shared tokens and page/footer components        |

**Explicit supersession of historical text:** old US4/FR-014 View all,
US2/FR-007 “confirmation leaves selection unchanged”, the US2/FR-008 implicit
row-click behavior **for this compact UI only**, and obsolete FR-024 repeat
compact mockup-sidecar gating do not control the newer presentation. The guarded
legacy `confirmForClick` API remains protected for old callers;
`compact-review-checkbox-action.ts` intercepts a pending checkbox in the compact
UI, reveals explicit Confirm and does not invoke the legacy implicit-confirm
path. FR-011 still governs a **separate currency-only** picker, not an extra
modal for the chosen account. B1 historical viewports are not current
interactive device dimensions. No historical text/receipt/task checkbox is
altered.

## Implemented frontend/facade boundary — source integrated locally

The canonical financial source remains
`useAccountReview(input): UseAccountReviewResult`, its
`session.rows[].selected`, `readModel`, owner/revision-scoped `dispatch`,
candidates and `undoRemoval()`. The new compact UI reads this authority; no
second selected-row state, Save scope or financial command is introduced.

- **Selection and pending groups:** NormalB's facade/domain slice applies
  initial/newly-ready selection with manual unselect preservation and
  filter-scoped explicit `select_ready`. The compact checkbox routes pending
  groups through `compact-review-checkbox-action.ts` to expand inline details
  and prompt **explicit Confirm**. The existing guarded legacy `confirmForClick`
  remains supported for older consumers; **do not remove or rewrite it** as a
  prerequisite for the compact UI.
- **Remove / Undo / Discard:**
  `UseAccountReviewResult.discardRemovedSuggestion(groupId: string): Promise<void>`
  and `AccountReviewFacadeView.discardedGroupIds: readonly string[]` are
  confirmed, authored and integrated with `SharedAccountSuggestions` and
  `CanonicalTransactionReview`. Discard revokes the matching current-review Undo
  lease, hides only the removed ghost and retains canonical group/transactions.
  `undoToken` and `undoGroupId` still govern real Undo. Never simulate a
  successful Discard with UI-only visibility changes.
- **Group currency:** `edit_group` now accepts **optional** `identity.currency`
  in addition to name, type, provider, card and sender identity. Omitting it
  preserves legacy currency. The editor preselects current currency and always
  submits it once with name/type under `reconfirm: true` and the original CAS
  guards. NormalB's reducer checks supported precision and SMS ATM endpoints;
  the frontend uses the existing modal failure notice if a command is refused,
  never silently rounds or converts monetary amounts.
- **Chooser and filters:** `AccountChoiceSheet` exposes eligible account
  currency and a single `Use account — CODE`; group-wide replacement displays
  linked source-order names/amounts before Use.
  `useTemporaryAccountNeededFilter(session, readModel.groupSummaries)`
  implements transient `showAccountNeeded`, `showLinkedGroup(groupId)`, and
  `showAll`. Read-model live row IDs, canonical group/row state and source order
  govern membership. No View-all group modal, persistent new filter, or
  Save-scope change.
- **UI-only callbacks:** `SharedAccountSuggestions` consumes
  `onViewLinked(groupId)`, `onDiscardRemoved(groupId)`, and `revealGroupsKey`.
  Its inline ellipsis menu and disclosure state are presentation-only.
  `AccountReviewPanel` retains authoritative filter toolbar counts and defaults.
  The native screen selects a single active
  account/category/transaction/default-Why overlay while preserving the original
  revision and session guards.

This describes source authored and integrated locally, **not runtime test PASS
or final visual/functional acceptance**. No new command schema is invented in
these docs.

## Integrated source, provenance and ownership boundaries

- **Locally integrated frontend:** `CanonicalTransactionReview.tsx`,
  `AccountReviewPanel.tsx`, `SharedAccountSuggestions.tsx`,
  `SharedAccountGroupRow.tsx`, `AccountChoiceSheet.tsx`,
  `EditSuggestedAccountSheet.tsx`, `TransactionReview.tsx`,
  `account-review-row-presentation.tsx`, `account-review-row-filter.ts`,
  `account-review-filter-header.tsx`, `shared-account-presentation.tsx`,
  `app/(private)/voice-review.tsx`, and paired EN/AR `transactions.json`.
  Cohesive additions: `CompactReviewSummary.tsx`, `CompactReviewTranscript.tsx`,
  `CanonicalReviewRow.tsx`, `CanonicalTransactionEditOverlay.tsx`, and
  `compact-review-checkbox-action.ts`.
- **Exact last currency integration artifacts:**
  `apps/mobile/components/transaction-review/CanonicalTransactionReview.tsx@87622d01ca24d399d1135c887448351c584e1f17`,
  `EditSuggestedAccountSheet.tsx@f0e8545b37702b9ca2605b44b3f4be266e189a44`;
  paired EN/AR locale blobs `9a46e0eb90c8e42d783f137ae1e4dd87acc46774` /
  `23bff162e8f9d47f3a279223fd2150e5b8f4a011`. Root formatted canonical to
  **898** and editor to **762** lines, within the repository's 900-line source
  limit.
- **Domain source integrated separately by NormalB:** guarded
  `packages/logic/src/account-review/review-schemas.ts@b88bd69663e0c006d60607fff26d5148ccd1778c`
  and `reducer-groups.ts@ce963536b274841a4c35038bda82fdd3c27aff70`, plus the
  confirmed facade selection/Discard API. Do not infer a test PASS merely
  because tests were authored.
- **Protected historical preimages:**
  `EditSuggestedAccountSheet.tsx@4ea2c12c75e686d58bb635c973999cc08899d151`,
  `SharedAccountSuggestions.tsx@7f8195bff5b8f239015ef011ee7547e673549099`,
  `account-review-row-presentation.tsx@3961babdcd1a507ff324d1380603dce6d9aebfa8`.
  These are traceable author inputs, **not** current working preimages after
  Root integration.

No Root-owned financial Save/diagnostics/sync, #405/PR406 account logos, global
workflow guidance, frozen R1–R3 references, or exact interactive
source/index/controls/reference bytes were changed in the frontend delivery. All
edit leases were released.

## Acceptance/evidence boundary

**Completed as reported by Root:** owner design/workflow approval, scoped
feature analysis and ownership, immutable source publication/readback, local
frontend/domain integration and formatting (canonical 898/editor 762 lines). The
original financial Save and diagnostic lanes remain Root-owned.

**Running, not yet certified:** consolidated TypeScript, lint, 23 mobile suites
and logic/account-review tests. C owns changes to manual-test-plan, quickstart,
validation docs and relevant test assertions; those files are outside this
status-only reconciliation. No test PASS is asserted in these documents while
Root's batch runs.

**NOT RUN / pending:** owner manual native layout at available widths/font
scales, EN/AR RTL, light/dark, long names, safe-area/keyboard/footer, chooser,
group-scoped replacement, actual selection/Undo/Discard behavior, RN screenshot
fidelity, device/accessibility evidence and final owner acceptance. Source being
locally integrated does **not** mean committed, merged, deployed or shipped.
Existing financial owner/Save/retry/sync safety gates and final regression
checks remain required before release. The browser prototype preview is not
native test evidence; no extra design approval or sidecar fingerprint gate is
required.
