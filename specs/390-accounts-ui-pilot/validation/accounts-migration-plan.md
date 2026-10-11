# Accounts form migration — SOURCE-GO checkpoint

**Current source handoff (2026-10-11): HUMAN AUTHORIZATION CONFIRMED; SOURCE GO
EXECUTED.** Mohamed approved the Accounts Add/Edit migration in a **separate PR
stacked on Foundation #390** and explicitly deferred unit/integration/E2E work
for his later manual testing. The original production HOLD below was
**coordinator sequencing before root SOURCE GO**, **not absence of human
authorization**. Root authorized source from immutable plan
`488731442edfcaca96e680cbaf61d993805ce18c`; S1 published source and business-doc
correction at `0b780d05bda5e4d34c8e53e213502eda94316b47` on
`codex/accounts-form-migration`. **Source complete but unverified by static
hooks or independent code review. All further source writes HOLD pending
root/M1.** No PR, merge or retarget action was performed.

**Repository:** `Msg22/Monyvi`  
**Owner:** S1 Normal ChatGPT / `.agents/personas/frontend-developer.md`,
exclusive source lane after root GO. Independent review is owned by a different
worker on a separate branch.  
**Migration branch / original immutable base:** `codex/accounts-form-migration`
at `b4a656e66263554a5dc001cee83a1431a3a9110b`, created by root directly from
Foundation; the migration PR will be **stacked on Foundation PR #390**, which
root confirms remains OPEN at that SHA. Never write to
`codex/ui-field-foundation`. This plan commit becomes the branch's new immutable
head.  
**Governing source:** `3264eba2b67bcc66cddc95e3fbdb36e8705ee642`, `AGENTS.md`,
`.specify/memory/constitution.md`, `.agent/workflows/team-led-delivery.md`,
`.agent/workflows/sprint-issue.md`.  
**Requirements:** `specs/390-accounts-ui-pilot/spec.md`,
`contracts/implementation-design.md`, `contracts/shared-fields.md`, its 35-case
manual plan, approved `docs/mockups/accounts-ui-pilot/design-contract.md` and
`approval-manifest.json`. Statements in older specs that source is still
globally frozen or tests must precede this wave are historical: Mohamed's
explicit **latest** delivery/test-deferral instruction supersedes them for this
bounded migration. No other business/financial rules change.

## 1. Scope and exact candidate source ownership (after root SOURCE GO only)

Only root may authorize an **exact file allowlist and new immutable branch
head** after this plan. Candidate paths below are not blanket permissions to
edit.

| Path                                                                           | Role and minimum proposed change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/app/(private)/add-account.tsx`                                    | **Core.** Replace the Initial Balance `TextField` with existing `GroupedMoneyInput` configured `variant="default"`, `required`, unsigned (omit `allowNegative` or false), `value={formData.balance}`, `onCanonicalChange` → existing `updateField("balance", value)`, and preserve `initial-balance-input`, error, focus/scroll and keyboard behavior. Name `TextField` gains `required`. Pass required group state to `AccountTypeSelector`. Existing local `CurrencySelectField` gains visible red required star and one localized required accessible name using Foundation `FieldLabel`/`composeFieldAccessibleName`; keep its current emoji/chevron and `CurrencyPicker` modal, selection and close. Preview continues receiving raw canonical form text. |
| `apps/mobile/app/(private)/edit-account.tsx`                                   | **Core.** Replace the Balance `TextField` with existing `GroupedMoneyInput` `variant="default"`, `allowNegative`, `required`, same existing `initial-balance-input`, canonical onChange to `updateField("balance", value)`, errors and focus/keyboard. Editable Name becomes required. Retain Preview, PageHeader Back/Save, ScrollView, unchanged metadata-only save, guard, dirty detection, silent/tracked balance choices, default toggle, SMS, Danger Zone, Delete and existing sheet props. Type/Currency stay locked and unmarked.                                                                                                                                                                                                                      |
| `apps/mobile/components/add-account/AccountTypeSelector.tsx`                   | **Core.** Add optional `required` prop; visible group label uses Foundation `FieldLabel`; `radiogroup` accessible name uses localized complete required qualifier **once**. Each existing radio remains named by option only, without repeated required wording. Preserve preselected CASH, optional deep-linked type, horizontally scrolling cards, icons/checkmark, disabled and selection semantics.                                                                                                                                                                                                                                                                                                                                                        |
| `apps/mobile/components/edit-account/ReadOnlyDropdown.tsx`                     | **Core presentation.** Bring muted locked Type/Currency surface and label into approved existing default-field geometry (shared label class, rounded-2xl/p-4 and compatible border/theme), while preserving icon/value, lock button, Tooltip show/dismiss and readable explanation. Never present as an editable or required field.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `apps/mobile/components/add-account/InstitutionProviderSection.tsx`            | **Conditional, prefer unchanged.** Existing manual Other TextField, picker and tooltip already use appropriate presentation; touch only on a concrete approved state discrepancy. Do not alter null provider ID, eligibility, institutional sender lists, normalization or resets.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `apps/mobile/components/add-account/SmsMatchingSection.tsx`                    | **Conditional, prefer unchanged.** Keep boxed optional SMS group, aliases and four-digit card TextField, onFieldFocus and existing expansion. Touch only on a documented binding discrepancy; never add optional-field asterisks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `apps/mobile/components/edit-account/BalanceChangedSheet.tsx`                  | **Excluded; expected unchanged.** Silent first, tracked choice, Confirm, Back/backdrop dismissal, existing summary/inset are already approved. Add to allowlist only after separate root decision if the required visual change is demonstrated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `apps/mobile/locales/en/accounts.json`, `apps/mobile/locales/ar/accounts.json` | **Conditional, no change expected.** Existing accounts field keys and `common.required_field` EN/AR are present. No new copy, locale key, or translation unless root approves an exact verified missing string and exclusive file ownership.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Readonly Foundation dependencies:**
`apps/mobile/components/ui/{TextField,GroupedMoneyInput,GroupedDecimalInput,Dropdown,FieldLabel,FieldMessage}.tsx`,
`packages/logic/src/utils/amount-helpers.ts`, existing CurrencyPicker,
PageHeader, AccountPreviewCard, CSS/tokens. `GroupedMoneyInput` already
delegates additive `variant` and `allowNegative`, and accepts
`onCanonicalChange(value:string)`; no new shared component or helper needed. The
local CurrencySelectField must remain a `CurrencyPicker` trigger, **not** be
replaced with generic Dropdown/CurrencyField or a universal FormField.

**Approved business-document write after GO only:**
`docs/business/business-decisions.md`, **the stale account uniqueness/identity
paragraph at current lines 267–273 alone** (see §4). Do not mutate services or
other business rules. After GO, any additional `specs/390-accounts-ui-pilot`
task/readiness/ownership/handoff status paths require separate exact coordinator
allowlisting.

## 2. Sequence and dependencies

1. **Root SOURCE GO preflight:** recheck immutable branch head, Foundation PR
   #390 and stacked base, scope ownership, approved eight-image binding
   manifest. Stop on drift/overlap; no silent rebase, cherry-pick, ref mutation
   or Foundation edit.
2. **Add and Type group:** preserve `useAccountForm` state, preferred-currency
   touched guard, uniqueness debounce, provider resets and the existing
   AccountPreviewCard. Make Add Type/Name/Currency/Initial Balance visibly and
   accessibly required. Keep `initialBalance="0"` as supplied by hook; group
   only the visible field, not preview or stored state. Call existing
   onCanonicalChange to emit dot-decimal text.
3. **Edit and locked attributes:** use `GroupedMoneyInput` opt-in signed mode;
   shared `TextField` names remain `required`. Keep `useEditAccountForm`
   canonical `formData.balance`/`isDirty`, `originalBalance`, existing
   `buildUpdateData`, update/delete services and unchanged BalanceChangedSheet.
   Presentation-only focus/blur must not call updateField or make a pristine
   account dirty.
4. **Optional surface reconciliation:** recheck visible provider and SMS fields;
   only adjust eligible candidate files if actually required by an approved
   binding fact. No form behavior change.
5. **Business docs only:** apply §4 exactly, then publish coherent source and
   doc revisions for root/static hooks and independent review. No self-approval,
   tests or device steps.

## 3. Preservation checklist

- **Canonical, precision, preview:** Add starts at canonical `"0"`, permits
  nonnegative input only; Edit permits signed including intermediate `"-"`. For
  canonical `12345.678`, editable grouped display is `12,345.678` but
  AccountPreviewCard retains `12345.678`. Valid Account-schema decimals/trailing
  zeros remain intact without new input rounding/caps; malformed `abc12345`,
  `12..34` retain raw text and existing schema blocks Save. Existing save-time
  conversion is untouched; do not add `Number/parseFloat` to change callbacks.
- **Dirty/save:** `useEditAccountForm` currently initializes
  `balance:String(account.balance)` and compares canonical strings. Formatting
  alone must never update state or mark dirty. Keep Save
  disabled/loading/validity/uniqueness guards, errors, retry/form retention, no
  duplicate Save/Confirm effects, metadata-only save without sheet, changed
  balance silent/tracked adjustment, sheet dismissal without write.
- **Provider/SMS/currency:** Known provider institution ID remains nullable;
  manual display name is separate account metadata. Preserve Cash no-provider
  state, Bank/Wallet eligibility, "Other" picker, optional sender chips,
  four-digit input cap/sanitizer, type reset and preference/manual currency
  override, all supported CurrencyType options.
- **Visual/layout:** default rounded fields, existing icons/flags/down-chevron,
  horizontal Type chips with partial overflow, existing form/preview ordering,
  header Back and Save, scroll focus and `insets.bottom + 160` clearance. Edit
  locked Type/Currency are readable/unmarked, Default row unboxed, SMS boxed,
  Delete below SMS. Do not add Cancel, drag-dismiss, dirty-leave prompt, new
  financial warning or palette.
- **Accessibility/presentation:** `common.required_field` (`Required field` /
  `حقل مطلوب`) exactly once on Add four required controls and Edit two required
  controls. Group Type is required once at group, not each radio. Optional and
  locked fields have no red star. Focused error remains visible; existing shared
  precedence `error > warning > helper`, no new focus ring, warnings advisory
  only.
- **Other consumers:** No shared Foundation/amount helper changes; preserve
  Manual calculator/soft keyboard, Transfer target, Metals 3-decimal weight,
  Recurring/TransactionEdit legacy unsigned parser, app-wide #359/#360 and all
  auth/DB/schema/sync/financial calculations. Existing tests remain unmodified
  and unexecuted.

## 4. Approved uniqueness documentation correction — precise boundaries

Source inspection at `b4a656...` verified:

- `apps/mobile/services/account-service.ts:351–413,434–448,532–583`: same user +
  currency + **trimmed, case-insensitive nickname** + provider identity; known
  nonempty `institutionId` takes priority as `institution:<lowercase ID>`.
  Otherwise a manually entered provider display name becomes
  `manual:<trim, collapsed whitespace, lowercase>`. Otherwise all
  absent-provider accounts share `"none"`. Known identity and manual name use
  distinct namespaces. Account **type does not create another namespace**.
- `apps/mobile/services/edit-account-service.ts:163–183,248–299`: same identity
  with `queryOwned` and `deleted != true`; `excludeAccountId` omits the current
  Edit account. Debounce/stale-result and nonblocking query failure in form
  hooks remain unchanged.
- Current `docs/business/business-decisions.md:267–273` incorrectly says all
  no-known-provider names are unique by user/currency, omitting manual-provider
  identity.

**GO-only amendment:** replace **only** these existing account uniqueness
bullets: names are unique case-insensitively among nondeleted accounts per
user/currency/provider identity; institution ID first, else normalized manual
name, else common no-provider bucket; known/manual identities distinct and
account type not a dimension; editing excludes self; the nickname remains
distinct from provider metadata. Example: `Savings` EGP with manual `Bank A` vs
`Bank B` allowed, but `Bank A` vs `bank   a` disallowed. Keep nearby
default/deletion/balance business rules verbatim. **No services, validation,
hooks, migrations, business behavior or stored data change.**

## 5. Approved visual crosswalk

**Immutable approved package:**
`sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e` in
`docs/mockups/accounts-ui-pilot/approval-manifest.json`; 8/8 entries approved
with prior independent integrity PASS. This writer read the published binding
sidecars but did not execute a verifier. CSS-calibrated screenshots do not prove
actual native density/font/inset parity.

| Binding                                                                                            | Required reference detail                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-add-bank-en-light.calibrated.binding.md`                                                       | Add Type/Name/Currency/Initial Balance required, default field style, `12345.678` canonical vs `12,345.678` grouped input/raw preview; existing header and horizontal Type/conditional provider sequence |
| `02-edit-bank-en-light.calibrated.binding.md`                                                      | Name/Balance required, locked Type/Currency unmarked; Default row unboxed, SMS card boxed, Delete below SMS                                                                                              |
| `03-add-bank-ar-light.calibrated.binding.md`, `04-edit-bank-ar-dark.calibrated.binding.md`         | RTL and Arabic, dark state, numeric/signed LTR islands and logical start/end; no font/icon replacement                                                                                                   |
| `05-add-validation-en-light.calibrated.binding.md`, `08-shared-field-states.calibrated.binding.md` | Required stars, exact malformed raw errors, focused error, helper/warning/error precedence, no new focus ring; default reference radius16/border1/padding16 (HTML values, not proven native dp)          |
| `06-balance-changed-en-light.calibrated.binding.md`                                                | Existing silent/tracked option and Confirm; preserve sheet implementation                                                                                                                                |
| `07-compact-enlarged-en-light.calibrated.binding.md`                                               | Compact 320×568 at 1.5 text scale; horizontal Type overflow and vertical scrolling                                                                                                                       |

Flags in design HTML are SVG stand-ins while app uses native emoji; do not
replace glyphs based on mockup pixels. Native screenshots, tablet/landscape,
caret/keyboard/clipboard/IME, RTL screen-reader, TalkBack/VoiceOver and
bottom-inset calibration remain **NOT RUN/UNKNOWN** and will be Mohamed's manual
verification responsibility.

## 6. Estimate, explicit risks, gates and handoff

**Estimated scoped migration: 2–4 hours after SOURCE GO, excluding manual device
testing.** Proposed allocation: Add/Type/currency 35–65 min; Edit/locked fields
35–65 min; optional provider/SMS visual check and exact business doc alignment
15–30 min; source reinspection, commits and root/independent reviewer handoff
25–50 min. These are effort forecasts, not delivered work or promises. Plan
checkpoint 15–25 minutes; root progress cadence at least every 30 active
minutes. Stop and escalate a credible 4h overrun, unexpected dependency/ref
change or design/ownership conflict.

**Risks:** Edit currently uses `keyboardType="numeric"`; native minus-key
availability is not established, so do not silently change keypad type without
approved/grounded need. Invalid grouped text must remain raw through rerender,
while canonical changes must not dirty pristine Edit on focus. Required group
semantics can duplicate spoken labels if assigned to each radio. Locked tooltip
must remain tappable after approved geometry change. Currency picker must
preserve user touch override after a late preferred-currency update. Optional
provider/SMS conditional mount must not lose data/eligibility/reset behavior.
Existing current-user save/uniqueness/submission boundaries must not change.

**Human-approved test deferral:** Mohamed explicitly requested direct
implementation while deferring unit tests, and will handle manual testing. Do
not author, modify or execute Jest/unit/integration/E2E/Maestro,
emulator/device/native/manual tests here. Existing authored suites remain
unchanged. All **35 Accounts manual QA scenarios are NOT RUN** in this lane.
Root may independently run actual static checks/hooks after GO; do not claim
those PASS from this plan. An independent reviewer, not S1, verifies the actual
source snapshot; functional, visual, accessibility and CI evidence remain
separate.

**Stop state:** This plan is the sole tracked artifact before root SOURCE GO.
All production and business-document writes remain on **HOLD** pending a fresh
exact-head source assignment.

## Published source handoff — 2026-10-11

**Source commit:** `0b780d05bda5e4d34c8e53e213502eda94316b47`, parent
`488731442edfcaca96e680cbaf61d993805ce18c` (Foundation base
`b4a656e66263554a5dc001cee83a1431a3a9110b`). This paragraph supersedes former
"after SOURCE GO" sequencing text for this completed bounded implementation,
without changing acceptance requirements.

**Exactly four UI source files modified:**

- `apps/mobile/app/(private)/add-account.tsx` — Add Name required;
  AccountTypeSelector required once at radiogroup; CurrencySelectField retains
  CurrencyPicker with FieldLabel plus localized required name and readable
  value; Initial Balance adopts `GroupedMoneyInput variant="default"` with
  unsigned canonical callback and existing testID/focus/error/native numeric
  keyboard. Preview remains fed by raw canonical form text.
- `apps/mobile/app/(private)/edit-account.tsx` — Edit Name required; Balance
  adopts signed `GroupedMoneyInput variant="default" allowNegative`, original
  testID/focus/error/keyboard; no change to canonical hook dirty tracking,
  parse-at-save, PageHeader actions, confirmation sheet, default toggle,
  optional sections or Delete.
- `apps/mobile/components/add-account/AccountTypeSelector.tsx` — Optional
  `required` prop with shared visible label and localized group accessible name,
  without adding required qualifiers to individual radios or changing horizontal
  cards/icons/selection.
- `apps/mobile/components/edit-account/ReadOnlyDropdown.tsx` — Shared default
  label treatment and approved rounded-2xl/p-4 locked field geometry; preserved
  emoji/value, lock action and Tooltip, no required semantics.

**Business documentation only:** `docs/business/business-decisions.md` Accounts
nickname uniqueness paragraph aligned with existing service identity:
case-insensitive trimmed nickname per user+currency+known institution
(priority), else normalized manual provider display name, else shared
no-provider; separate identity namespaces, type not dimension, Edit excludes
self. No service/hook/schema/validator/DB modification.

**Other paths unchanged:** InstitutionProviderSection, SmsMatchingSection,
BalanceChangedSheet, locales, Foundation shared UI/amount helpers,
AccountPreviewCard, CurrencyPicker, hooks, services, all tests/mockups,
independent review reports. The approved eight-image package
`sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e`
remains unchanged.

**Static/evidence disposition:** This Normal ChatGPT source lane made read-only
source/diff inspections and published GitHub code; **no actual TypeScript, lint,
formatting/hook, i18n, Jest, integration, E2E, Maestro, emulator, native visual,
manual or accessibility check executed**. Root owns genuine static
hooks/typechecks; M1 owns independent ordered source review. **All 35 Accounts
manual QA scenario IDs remain NOT RUN.** Human-deferred tests are not PASS. Edit
negative-key availability, actual GroupedMoneyInput focus/caret, RTL,
disabled/stale uniqueness, offline persistence, silent/tracked side effects,
native layout and lock Tooltip remain manual/review dependencies, not claimed
verified.

**Source handoff completed; writer ownership released.** No further writes, PR
creation, merge, retarget or test/device action without a fresh explicit
assignment.

## AKB-01 — React Native 0.83.6 keyboard-type preservation correction (2026-10-11)

**Root-authorized source correction:**
`67616c2f080541c1ae922d24e0ed987d8f9a7aeb`, parent
`f6e2d88c6134bc823ea3cd833dc10ecfab5f004b`, **only**
`apps/mobile/app/(private)/{add-account,edit-account}.tsx` and
`apps/mobile/components/ui/GroupedDecimalInput.tsx`. Foundation #390 remains at
`b4a656e66263554a5dc001cee83a1431a3a9110b`; PR #393 stays a separate draft
stacked on Foundation. Independent AKB-01 review source:
`specs/390-accounts-ui-pilot/validation/accounts-migration-review.md` on
`codex/accounts-form-migration-review` at
`3cf399f35cedb0ff63b5e2065605ed6495f02674`. The review is diagnostic evidence,
not native execution.

**Confirmed problem and minimal solution:** Installed and locked React Native
`0.83.6` gives a truthy `inputMode` precedence over `keyboardType`.
`inputMode="numeric"` selects `number-pad`, which lacks the Android
decimal/signed input flags of the old Accounts `keyboardType="numeric"`. Simply
removing the route's `inputMode` would still inherit the grouped component's
`inputMode="decimal"` (`decimal-pad`, no signed flag). The correction adds an
**explicit opt-in** `preserveKeyboardType?: boolean` to
`GroupedDecimalInputProps`, default `false`, inherited by the existing
`GroupedMoneyInputProps` alias. Both Accounts grouped balances remove
`inputMode="numeric"`, retain `keyboardType="numeric"` and pass
`preserveKeyboardType`. When opted in with no explicit mode,
`GroupedDecimalInput` forwards `inputMode={undefined}` so React Native respects
`keyboardType`. If `inputMode` is explicitly provided, it wins;
`showSoftInputOnFocus={false}` still forces `"none"` for soft-keyboard
suppression.

**Read-only current production caller inventory at source parent `f6e2d88...`:**

| Caller                                                  | Input                                                            | Current/proposed mode after this correction                                                                                                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/(private)/add-account.tsx`                         | `GroupedMoneyInput`                                              | **New opt-in**, `keyboardType="numeric"`, no explicit `inputMode`; old Account number keyboard flags requested; Add amount remains unsigned by validation.                                      |
| `app/(private)/edit-account.tsx`                        | `GroupedMoneyInput`                                              | **New opt-in**, `keyboardType="numeric"`, no explicit `inputMode`; preserve signed/decimal-capable Android configuration, Edit amount grammar stays explicitly signed.                          |
| `components/add-transaction/ManualTransactionEntry.tsx` | `GroupedMoneyInput`                                              | No opt-in; existing `showSoftInputOnFocus={false}` continues `inputMode="none"` for custom calculator.                                                                                          |
| `components/add-transaction/TransferFields.tsx`         | `GroupedMoneyInput`                                              | No opt-in; existing custom calculator target also suppresses the native keyboard with `inputMode="none"`.                                                                                       |
| `components/metals/MetalHoldingForm.tsx`                | `GroupedDecimalInput` weight; `GroupedMoneyInput` purchase price | No opt-in; weight still explicitly passes `inputMode="decimal"` and `keyboardType="decimal-pad"`; purchase price keeps default `"decimal"` mode. Metals three-decimal weight remains unchanged. |
| `components/ui/GroupedMoneyInput.tsx`                   | Delegating wrapper                                               | **Unchanged source**; already spreads props, so it inherits `preserveKeyboardType` automatically.                                                                                               |

The existing shared component tests also instantiate grouped controls without
the new opt-in, which retains the prior decimal inputMode default.
`RecurringPaymentFormFields` and `TransactionEditModal` use their separate text
inputs / legacy amount parsing, not this grouped wrapper, and are untouched.
This inventory uses published source at the immutable migration parent plus the
source correction; it does not claim physical keyboard observation.

**No scope expansion:** Existing unsigned/signed numeric resolver, canonical
text callbacks, input precision/trailing zeros, account validation/save
conversion, visual variant, focus, refs, keyboard callbacks, error handling,
provider/SMS, default/silent/tracked sheet, Locale, shared wrapper, tests and
mockups are unchanged. No global fallback based on `keyboardType === "numeric"`,
no casting or `null`/empty mode sentinels.

**Post-correction gates:** Root must rerun real formatting/lint/hooks, full
mobile and logic typechecks, and privacy/static checks against the corrected
final HEAD, since the previous PASS record applies only to pre-correction
`f6e2d88...`. M1 must independently re-review this focused native-prop contract.
Unit/Jest/integration/E2E/Maestro and device/IME execution remain **DEFERRED**
by Mohamed. **All 35 Accounts manual QA scenarios remain NOT RUN in this worker
lane.** The source demonstrates requested native input configuration, **not** a
measured Android/iOS keyboard PASS. After source/docs handoff this worker
**HOLDS all writes** pending root review.
