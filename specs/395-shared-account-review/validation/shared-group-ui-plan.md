# #395 US2 — Shared-group UI implementation and test-first plan

**Status:** PLAN ONLY; no UI, test, YAML, schema, locale or seed authored.
**Branch:** `codex/395-ui-worker`, approved starting head `be88658807e5a7ded436d2606e7193008b6a796d`.
**File ownership:** exclusively this report. Core T017, group logic T024, SMS commands
T025, financial writer/SQL, and other workers retain their own sources.
Root owns integration and will supply current shared-context SHA before any
future source implementation. The locally merged main is not assumed published.

## 1. Approved B1 authority and precise scenario distinctions

The authoritative `approvals/b1-2026-10-14.json` approves **all 23 exact
image/sidecar combined revisions** and R3 EN/AR copy, with manifest revision
`sha256:cf447362f73c91f975f97ecf2295bce1ed8300213f701f6caab181ee997059a0`.
Its approval supersedes the frozen “pending” headers. Use the existing
`mockups/binding-contract.md` and
`mockups/proposals/r3/interaction-notes.md`, not new designs or guessed
raster-to-dp measurements.

| Binding | Authority for US2 |
| --- | --- |
| R3-05 / R3-15 | Final combined EN / Arabic RTL composition: **7 total / 5 distinct needing review / 2 selected**; pending QNB3 + CIB1, one currency blocker, two accepted defaults; three filters and separate Select ready toolbar |
| R3-06 | **Separate** Remove/Undo scene: QNB2 retained/unassigned, CIB1 pending, Cash1 selected, total4/review3/selected1 |
| R3-09 | QNB3 + CIB1 confirmed; only Lunch checked, total4/review0/selected1; Confirmed is not “all selected” |
| R3-13 | Group-menu replacement explicitly affects all 3 linked QNB rows; row chooser affects one only |
| R2-02 / R2-03 | Foreground independent per-group action sheet; complete scrollable View all with six separately actionable groups in its *own* 12-row case |
| R1-07 / R1-03 / R1-12 | Foreground Edit suggested account sheet (name/type editable, **EGP locked**) and unselected existing-account chooser EN/AR; surrounding old backgrounds are contextual |
| R2-01 | Compact grouping **concept only**; it never supersedes R3-05/R3-15 detail composition |

**Approved semantics:** independent Confirm/Edit/Replace/Remove for each group.
Confirm QNB applies the current identity to its three compatible linked rows,
selects **zero**, creates **no account**, leaves CIB pending and preserves
unrelated currency/category/amount blockers. After *visible prior disclosure*,
clicking the checkbox of one otherwise eligible pending-group transaction
confirms that group but checks **only clicked row**. Confirmed status is
read-only; Change/menu remain available. “Confirm all” is not an action.

Remove persists a group tombstone, keeps all transaction rows, clears only
newly invalid assignments/selections, preserves other groups, and exposes
Choose account + scoped session-local Undo. No default fallback for explicit
named account evidence; unchanged evidence must not recreate the removed
group. Undo may not overwrite later edits or cross owner/session/generation.
SMS removal persists in the separately owned v2 draft contract, while the
Undo token remains transient; Voice has no implied restart durability.
Edits to name/type/provider/card require revalidation and reconfirmation,
with locked currency and no numeric-amount conversion. Similar nickname is
not sufficient identity when suffix, type or provider differs.

## 2. Verified source reuse and T010 ABI

- `apps/mobile/components/transaction-review/TransactionReview.tsx` already
  owns the **flat transaction `FlatList`**, `TransactionItem`,
  `ReviewActionBar`, `PageHeader`, `ReviewFiltersSheet`, edit modal and
  source-specific callback props. **Keep `TransactionReviewProps` unchanged**
  until T054's facade aligns the new canonical session with legacy Voice/SMS.
  A separate nested/replacement transaction list is forbidden.
- `TransactionItem.tsx` has an independent accessible row checkbox and
  `transaction-review-edit-action`; group action buttons must not masquerade
  as a checkbox or run `onToggleSelect`. Reuse current account display and
  `transaction-account-match` without assuming it proves group confirmation.
- `ReviewActionBar.tsx` has `review-action-bar`, `review-save-button` and
  SMS `sms-review-later`; `PageHeader` has `header-back`. Group Confirm
  **never** invokes Save. Retain Voice Retry/transcript and SMS Review later.
- `ReviewFiltersSheet.tsx`, `SmsReviewAccountPicker.tsx`,
  `TransactionEditModal.tsx` share `Modal`, `ScrollView`,
  `KeyboardAvoidingView`, cancel/Back and `useModalBottomInset` patterns.
  Reuse sheet construction, not the old transaction-edit business logic for
  draft-group identity. The `SmsReviewUndoBanner` style/announcements can
  inform group Undo, but its SMS-item discard semantics are not interchangeable.
  Existing `AccountSelector` and `CurrencyPicker` remain the row chooser
  and currency surfaces; US3 owns currency-context/null changes.
- **Verified integration source:** `codex/395-implementation-context@9a8987a8087db886d9b9244182ef8e8128016621`,
  T010 source blob `05bcd808ace33084d440e72c119f91d39dd03414` and
  T006 test blob `ea32944137df9a4e0fba30eb5d262a5c88381f6d`.
  **Exact ABI:** `loadAccountReviewAccountSnapshots(): Promise<AccountReviewAccountSnapshots>`
  takes **ZERO arguments** and yields `ownerId`, `preferredCurrency`,
  owned `accounts` with `isDefault`, plus privacy-safe `providerContext`.
  The implementation captures scope and rechecks current actor internally.
  Do **not** add expectedUserId, duplicate its snapshot service, or expose
  owner/default/local balances to provider request context.

## 3. Future presentational T031 contracts (proposed, not published API)

**No direct DB, services, parser, canonical logic/reducer/schema imports,**
copied domain enums, local financial state or persistence in the two UI
components. T030/T054 facade maps validated `AccountReviewSession`/
`AccountReviewGroup` + owned read-model into **readonly shaped props**,
including presentation-ready booleans/text and stable group IDs. It owns
expected revisions, generation, actor checks and command dispatch.

**`SharedAccountSuggestions.tsx`:**
`groups: readonly SharedGroupView[]`, where each view record contains
`{groupId, displayName, identitySummary, currencyLabel, typeIconName,
linkedCount, statusLabel, disclosureText, isConfirmed, isRemoved, isBusy,
canConfirm, canEdit, canReplace, canRemove, canUndo}`.
Names are user data, never translated; identity line may include permitted
type, provider and **masked** last-four digits, never full numbers.
The UI does not infer eligibility from null IDs or hardcode domain-status
unions: facade shapes confirmation/removal and available actions.
Callbacks `onConfirm(groupId)`, `onEdit(groupId)`,
`onReplace(groupId)`, `onRemove(groupId)`, `onUndo(groupId)`,
`onViewAll()`, `onCloseAllGroups()`; optional
`isAllGroupsSheetOpen` and `isBusy` are view state. The facade supplies
owner/session/expected group and review revisions for real commands;
the component only fires the specified group-specific callback.

**Review details summary:** shaped
`{distinctNeedsReviewCount, pendingGroupCount, confirmedGroupCount,
defaultAssignmentCount, selectedCount, issueLabels}` comes from **all**
canonical session rows, not filtered/visible/checked rows. A row with multiple
account/currency/amount/category reasons counts **once** in needs review;
QNB linked3 / CIB linked1 count **complete current group membership**,
including offscreen/filter-hidden rows. Collapsed panel shows both
independent groups, contextual issues and disclosure within one compact
region, no stacked banners or fourth filter. Default-only renders T020's
quiet note, **no empty Review details container**; clean state omits it.
Select ready remains the existing **separate list toolbar**, never an action
inside a shared group. View all uses a virtualized `FlatList` keyed by
`groupId`, including pending, confirmed and removed/recovery surfaces;
closing retains the review filter and scroll position.

**`EditSuggestedAccountSheet.tsx`:** shaped
`{visible, groupId, groupName, currentTypeOptionId, allowedTypeOptions:
readonly {id,label}[], lockedCurrencyLabel, identitySummary, linkedCount,
canSubmit, isBusy, validationMessage, onSubmit({name,typeOptionId}),
onReplace(), onCancel()}`.
The sheet edits **name/type only**, displays read-only EGP for R1-07, and
discloses group count before applying any edit/replacement. The facade
revalidates uniqueness, provider/card evidence, current owner and revision
before confirming; material edits invalidate old confirmation. Cancel,
outside and Android Back commit nothing and restore the initiating action.
Replacing uses the **existing** account chooser with a disclosed all-group
scope after closing the edit sheet: no stacked active modal. The
row-initiated chooser remains one-row scoped and starts with **null**
selection until explicit choice; reject stale/deleted/foreign/incompatible
candidate and retain unresolved state.

**UI primitives:** reuse `Ionicons` names `business-outline`,
`wallet-outline`, `cash-outline`, `ellipsis-vertical`,
`checkmark-circle`, `pencil-outline`, `trash-outline`,
`information-circle-outline`, `close-outline`. Pending Confirm is
outlined; Confirmed is read-only status. Buttons and menus are individually
named with group name and linked count; distinct from row checkboxes.

## 4. Official T025 / T026 tests-first matrix and ownership boundary

**Task IDs are different:** T024 logic tests own
`packages/logic/src/account-review/__tests__/shared-groups.test.ts`.
**T025** owns `apps/mobile/__tests__/services/account-review-command-service.test.ts`
and `packages/logic/src/sms-review-drafts/__tests__/account-review-v2-codec.test.ts`
(serialized owner-scoped atomic commands, v1/v2 codec, generation checks,
conflicts, failed-write rollback, durable removal/temporary Undo).
**T026** owns UI Red
`apps/mobile/__tests__/components/shared-account-suggestions.test.tsx`
and the authored-only Maestro
`apps/mobile/e2e/maestro/account-review/shared-suggestions.yaml`.
The latter pair tests presentation/callback scope, **not** DB writes.
T031 component production follows the real Red + T027–T030 gates.

**Proposed T026 cases:**
1. R3-05 renders **7/5/2** summary, QNB3+CIB1 cards, one currency issue,
   default2, individual menus and accurate linked counts. A single multi-reason
   row contributes once to the needs-review headline. Offscreen rows still
   count; filtered Selected never changes linked3.
2. Press Confirm QNB -> **only** `onConfirm(QNB.groupId)` once; CIB
   callback, checkbox/select, Save and account creation **not invoked**.
   Rerender with facade-supplied confirmed view -> read-only Confirmed plus
   enabled Change; no fabricated in-component reducer or service response.
3. Eligible row-checkbox selection after readable “QNB for all 3” disclosure
   selects the **clicked row only**; T024/T025 assert actual combined
   group-confirm/row-selection transition, not a fake UI-only mutation.
   Pending group is never silently confirmed by bulk Select ready.
4. QNB Edit/Replace/Remove each dispatches **only QNB group ID**; CIB remains
   pending. Edit sheet validates name/type and shows locked EGP; Cancel/Back
   and backdrop invoke no confirm/update; one active sheet. Group replacement
   clearly says all3; row chooser affects one and starts unselected.
5. R3-06 Remove keeps QNB2 rows with Choose account, CIB1 pending and
   Cash1 selected, clears newly invalid QNB checkboxes only, shows eligible
   transient Undo. A newer edit invalidates Undo; stale token/owner/generation
   rejection belongs T024/T025. Voice Undo is not promised after restart.
6. R3-09 Confirmed QNB3/CIB1 leaves only Lunch selected: **4/0/1**.
   No Confirm all, no creation until actual selected US6 writer.
7. R2-03 six-group, twelve-row View all: all groups individually reachable
   in scrollable keyed list; no first-N truncation, no selection change on
   open/close, preserve existing three filters and scroll context.
8. Unknown/unconfirmed currency, null/unresolved account, hard-invalid
   amount/category, conflicting suffix/provider/type: no enabled Confirm or
   automatic default, no discarded other review reasons. Explicit evidence
   never falls back to guessed Cash; no account with placeholder ID.
9. Accessible EN/AR plural/disclosure labels and action roles per group,
   RTL bidi-isolated card suffix/currency, long names, font 1.35, 340/390/600
   variants, light/dark theme and independent focus after sheets.
   Jest checks semantic properties/callbacks; real layout, keyboard/inset,
   pixel fidelity, TalkBack/VoiceOver and focus return require owner-rendered
   T032/T033/T072 gates, **not** invented unit Green.

**Existing selectors verified in source:** `transaction-review-screen`,
`review-summary-card`, `review-mode-control`,
`review-selection-row`, `review-select-toggle`,
`transaction-review-row`, `transaction-review-edit-action`,
`review-action-bar`, `review-save-button`, `sms-review-later`,
`header-back`.

**Proposed NEW test selectors (not in production):**
`account-review-details-panel`,
`account-review-group-card-${groupId}`,
`account-review-group-disclosure-${groupId}`,
`account-review-group-confirm-${groupId}`,
`account-review-group-actions-${groupId}`,
`account-review-group-status-${groupId}`,
`account-review-group-view-all`,
`account-review-group-all-sheet`,
`account-review-group-action-sheet`,
`account-review-group-edit-sheet`,
`account-review-group-edit-name`,
`account-review-group-edit-type`,
`account-review-group-locked-currency`,
`account-review-group-edit-submit`,
`account-review-group-replace`,
`account-review-group-remove`,
`account-review-group-undo`.
Do not treat naming a selector as working UI/route.

## 5. B1 responsiveness, A11y, Maestro and final gates

- **390×844/font1** baseline: existing 20dp gutters; details panel 350dp
  width, 1dp border/radius12, 16dp inset, 12dp section spacing. New rows
  min-height68, badge40/icon22, 44dp action/menu target, button min48.
  EN and AR text wraps; no shrinking critical name/currency to fit.
  **340dp**, dense font1.35 -> identity above actions and disclosure
  full-width; below340 stack paired actions. **600dp** tablet/landscape
  retains shell, fluid width. Dark/light semantic tokens and existing gold
  active-filter styling; never introduce generated blue decorations.
- All new sheets: full usable width, top radius32, max80% usable viewport,
  scrollable with `KeyboardAvoidingView`, `useModalBottomInset` applied
  exactly once; no fixed status/navigation heights, no stacked sheets.
  Cancel/Back does not commit, restored focus to initiating menu and
  announcements after confirmation/removal do not steal focus. Arabic RTL
  mirrors actions/start-end, bidi isolates QNB/card suffix/amount signs;
  pluralization via approved R3 EN/AR additions, names left untouched.
- **Future Maestro** `apps/mobile/e2e/maestro/account-review/shared-suggestions.yaml`
  is **NOT authored/executed by this report**. Requires real existing
  `../helpers/ci-auth-deeplink-bootstrap.yaml`, plus T054 strict
  dev+E2E+current-owner session entry in real private `/voice-review`;
  proposed `reviewFixtureSceneId=r3-combined-en` is **not currently wired**.
  Do not serialize owner/session/financial data to URI or use legacy JSON
  route as a substitute. Separate owned test-source seed must provision
  T015's exact five owner-specific account roles and accessible category:
  existing E2E Cash/NBE/QNB/Wallet seed does **not** qualify.
- After those gates, the authored YAML may assert QNB3 disclosure,
  independently Confirm QNB, CIB still pending, one eligible row selection,
  Edit Cancel/EGP locked, Replace group count, and a **separate** R3-06
  Remove/Undo journey. **No Save tap, provider, mic, native permission, hosted
  seed or fake successful deep link.** M14/M19 financial rollback, CAS,
  replay and SQL/pgTAP remain US6/financial ownership.
- Root to accept T016, freeze exact Core command/facade ABI and file leases,
  authorize T025/T026 actual tests-first Red, then later T031 production.
  Obtain focused Jest/TypeScript/lint/format checks and owner rendered
  T032/T033 evidence; **no test/device/Save evidence is claimed here**.

**PLAN-ONLY CHECKPOINT — SOURCE/TEST OWNERSHIP RELEASED — ALL WRITES FROZEN.**
