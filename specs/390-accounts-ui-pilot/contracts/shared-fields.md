# Shared field contracts — Accounts pilot proposal

**Status**: Technical appendix; candidate contracts, not implemented APIs.
**Main pin**: 3264eba2b67bcc66cddc95e3fbdb36e8705ee642. **Pending PR #383 pin**:
d45745a5c8a13db082eab24e12c2cc072e26c124. **Authority**: [spec.md](../spec.md),
current constitution and AGENTS.md. User approved existing default style and the
eight-image immutable package
sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e;
production implementation remains pending.

## Main versus pending work

| Area                | Pinned main observation                                                                                                                         | Pending PR #383 planning evidence                                                               | Pilot action                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| TextField           | Existing default/outlined variants; focus-local draft and onFocus/onBlur forwarding; required marker plus fallback hint                         | Preserve pending caller integrations                                                            | Reuse; do not replace focus-local draft or mistake existing callbacks for missing capability                                            |
| GroupedMoneyInput   | Delegates to GroupedDecimalInput                                                                                                                | Planning evidence identifies numeric focus/blur forwarding                                      | Reconcile pending wrapper callbacks before editing; do not duplicate their implementation                                               |
| GroupedDecimalInput | Props include required/error/accessibilityLabel; always passes outlined; rejected resolution forwards raw text                                  | Pending numeric callbacks                                                                       | Optional default/outlined forwarding is a proposal; existing consumers retain outlined default, Accounts explicitly opt into default    |
| Dropdown            | Generic selection, default/outlined variants, required hint; generic value constrained to string or number                                      | Pinned pending PR already supplies nullable value/error support and tests; pinned main does not | Integrate/reconcile pending contract rather than reimplement null/error support                                                         |
| Accounts routes     | Name/balance use default TextField; Add currency trigger is local; Type uses existing AccountTypeSelector; Edit attributes use ReadOnlyDropdown | Accounts migration remains separate                                                             | Preserve type-selector composition, preview and PageHeader; replace ordinary monetary entry through approved GroupedMoneyInput adoption |
| Currency            | CurrencyPicker already supplies choice flow                                                                                                     | No replacement picker requested                                                                 | Reuse; extract a presentation-only trigger adapter only where current consumers justify it                                              |

PR observations are carried from coordinator's immutable-head reconciliation,
not independently executed in this stage. Before coding, refresh PR/main state,
inspect current implementation/tests and freeze shared ownership. This appendix
does not claim pending PR code is merged.

Source anchors checked in this stage:

- Unsigned Add grammar: apps/mobile/validation/account-validation.ts:6.
- Signed Edit grammar: apps/mobile/validation/account-validation.ts:7.
- Edit schema: apps/mobile/validation/account-validation.ts:167.
- Raw rejected text forwarding:
  apps/mobile/components/ui/GroupedDecimalInput.tsx:57.
- Current outlined composition:
  apps/mobile/components/ui/GroupedDecimalInput.tsx:64.
- Focus callback: apps/mobile/components/ui/TextField.tsx:88.
- Blur callback: apps/mobile/components/ui/TextField.tsx:96.
- Current accessible-label override:
  apps/mobile/components/ui/TextField.tsx:130.
- Current generic selection constraint:
  apps/mobile/components/ui/Dropdown.tsx:238.
- Local currency trigger: apps/mobile/app/(private)/add-account.tsx:45.
- Add header: apps/mobile/app/(private)/add-account.tsx:229.
- Edit header: apps/mobile/app/(private)/edit-account.tsx:380.
- Existing radio-selector composition:
  apps/mobile/components/add-account/AccountTypeSelector.tsx:40.
- Provider-aware uniqueness: apps/mobile/services/edit-account-service.ts:248.
- Local scoped uniqueness query:
  apps/mobile/services/edit-account-service.ts:273.
- Nonblocking Add query-failure behavior:
  apps/mobile/hooks/useAccountForm.ts:176.
- Nonblocking Edit query-failure behavior:
  apps/mobile/hooks/useEditAccountForm.ts:284.
- Existing initial silent choice:
  apps/mobile/components/edit-account/BalanceChangedSheet.tsx:124.
- Android Back dismissal:
  apps/mobile/components/edit-account/BalanceChangedSheet.tsx:137.
- Backdrop dismissal:
  apps/mobile/components/edit-account/BalanceChangedSheet.tsx:168.
- Existing Confirm choice:
  apps/mobile/components/edit-account/BalanceChangedSheet.tsx:327.

These are exact pinned-source observations, not execution evidence.

## Composition and ownership

Reuse TextField, GroupedMoneyInput, Dropdown, CurrencyPicker,
AccountTypeSelector, ReadOnlyDropdown, OptionalSection, PageHeader and Skeleton.
Control types keep distinct value/callback contracts. UI components render
shaped props and emit callbacks; hooks retain lifecycle/validation state,
services retain scoped reads/writes, and packages/logic retains pure numeric
helpers.

Do not introduce a universal conditional FormField, change Account schemas, move
financial calculations into components or make a currency trigger read
preferences/database. Ordinary money uses GroupedMoneyInput; GroupedDecimalInput
remains its foundation and the approved Metals weight exception, not a new
Accounts exception.

Recommended small shared pieces:

1. FieldLabel and a localized accessible-name composition helper for actual
   repeated required-label behavior.
2. FieldMessage only if touched consumers show real duplicate rendering.
3. Currency trigger adapter only after confirming its concrete shared consumers
   and stable responsibilities.

No runtime imports from @monyvi/db into packages/logic. Domain value types come
from authoritative exports, not copied currency/type unions. Validate external
unknown values at existing boundaries.

## Common presentation capabilities

| Capability         | Proposed contract                                          | Boundary                                                                  |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| label              | Localized visible label                                    | Existing terminology retained                                             |
| required           | Boolean marker and localized accessible-name requiredness  | Requiredness derives from each editable form field's existing validation  |
| helperText         | Supplementary localized instruction                        | Preserve essential instructions during invalid state                      |
| warning            | Optional presentation warning                              | No new Account warning rule or financial threshold                        |
| error              | Existing localized validation correction                   | Remains while focused; form/save failures remain outside field message    |
| enabled state      | Preserve each component's existing editable/disabled props | No blanket conversion of read-only values into disabled editable fields   |
| accessibilityLabel | Optional explicit accessible name                          | Shared composer includes requiredness exactly once even with override     |
| accessibilityHint  | Optional additional instruction                            | Hint alone does not establish required accessible-name semantics          |
| testID             | Stable existing identifiers retained where possible        | Tests target public outcomes, not private form state                      |
| variant            | Existing default or outlined where supported               | Accounts default; old numeric consumers preserve current outlined default |

This is a capability inventory, not an approved universal TypeScript interface.
Native TextInput focus/blur event types, Ref, adornments and selection remain
specialized. Dropdown selection remains generic and nullable only according to
reconciled PR contract. Currency uses CurrencyType and existing onSelect/onClose
behavior. Do not assign numeric-range accessibility values to free-form text.

## Requiredness and field inventory

| Surface  | Field/control                        | Editable required state                               | Proposed presentation                                                              |
| -------- | ------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Add      | AccountTypeSelector                  | Required, preselected CASH still marked               | Existing radios and label; shared required semantics, no replacement with Dropdown |
| Add      | Name                                 | Required                                              | TextField default                                                                  |
| Add      | Currency                             | Required                                              | Existing picker and default trigger composition                                    |
| Add      | Initial balance                      | Required; starts "0", nonnegative                     | GroupedMoneyInput, explicit default                                                |
| Add/Edit | Provider/institution display details | Optional per current schema/eligibility               | Existing institution controls; null missing identity                               |
| Add/Edit | SMS aliases/card-last-four           | Optional; existing content validation still applies   | Existing sections/controls, unmarked                                               |
| Edit     | Name and Balance                     | Required editable fields                              | Default TextField/GroupedMoneyInput; signed balance                                |
| Edit     | Type and Currency                    | Locked display attributes, not editable schema fields | Existing readable locked composition and explanation                               |
| Edit     | Default flag                         | Existing switch                                       | Preserve current state/dirty behavior                                              |

A stored mandatory attribute is not automatically a required editable field. For
required radio groups, Type requiredness belongs to the group exactly once, not
each option. Explicit accessible-name overrides also retain localized
requiredness exactly once. Verify actual group/option announcements with
supported native props and devices; TalkBack/VoiceOver checks are NOT RUN.

## Numeric behavior

- Add initial balance "0"; grammar accepts unsigned integer with optional dot
  plus digits. Edit accepts the same with an optional leading minus. Account
  schema has no fractional-digit count restriction.
- Valid input formatting adds comma grouping only. For canonical 12345.678, the
  input displays 12,345.678, while the existing account preview displays
  12345.678. Preview formatting is outside this migration; do not add grouping
  there.
- Invalid input remains verbatim through controlled display as well as
  callbacks: abc12345 stays abc12345, never abc12,345. Raw rejected callback
  forwarding alone is insufficient because the pinned formatter can still group
  embedded digits.
- No UI rounding, new currency precision rule, auto-stripping or forced
  replacement of malformed input.
- GroupedDecimalInput currently forwards raw rejected values. Signed
  grouping/selection across successive edits is an unverified migration risk,
  not a proven minus-sign lockout.
- Reproduce signed grouping, negative grouped paste, minus intermediate, signed
  caret/selection replacement, correction, arbitrary decimal length and
  trailing-zero preservation before choosing a minimum opt-in signed resolver
  extension. No input rounding is permitted.
- Any needed signed extension preserves unsigned default behavior for all other
  consumers and belongs to one separately named logic writer, or explicitly the
  same foundation owner. No overlapping writers.
- Preserve focus-local TextField drafts, syncWhileFocused behavior required by
  numeric display, and rapid controlled rerenders. Do not change them based on a
  mockup.
- Keep Account's existing save-time conversion/rounding behavior. This UI pilot
  does not repair broader financial precision debt.

## Messages and visual contract

Existing default/card field direction is approved. Retain rounded default
geometry, existing labels/icons, preview location, PageHeader Back arrow and
header Save, the unboxed Default Account row, boxed SMS section and existing
Delete section below SMS. Use registered NativeWind/semantic tokens, slate-25
for standard light surface, dark variants and constants/ui.ts responsive
helpers; no new screen-specific breakpoint or palette.

Default source TextField/Dropdown currently contain some bg-white/text-white
classes. Their existence is source observation, not permission to introduce new
raw colors or global styling changes. Resolve standard token equivalence in
approved contract without widening theme scope. Icon props may use palette when
className is unsupported. Respect NativeWind interactive shadow/opacity
exceptions.

Proposed state sheet:
empty/filled/focused/invalid/helper/warning/disabled/locked, required/optional,
text/money/selection/currency trigger. Proposed precedence is error, then
warning, then helper with essential correction guidance retained. Keep the
existing focus border without a new focus ring; shared locked-field geometry is
approved only within immutable package
sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e. Mohamed
approved the actual state sheet and immutable package revision on 2026-10-11;
these visual facts govern only that exact package. Native evidence remains NOT
RUN. No new auto-focus behavior, banners, Toast patterns or financial warnings
are inferred.

## Data and interaction boundaries

- checkAccountNameUniqueness is a scoped local WatermelonDB query over active
  accounts in the selected currency. Trimmed, case-insensitive nickname
  uniqueness includes provider identity: normalized known institution ID takes
  precedence; otherwise manual provider names are trimmed, internal whitespace
  collapsed and lowercased; otherwise one shared no-provider identity applies.
  Same nickname/currency with different manual providers is allowed, but
  equivalent normalized manual providers conflict. Edit excludes the current
  account. This matches the user-approved correction in business-decisions.md;
  preserve debounce, stale-answer protection and existing nonblocking failure
  behavior.
- Null institution ID remains null; do not use empty-string ID fallback.
- Type/currency are locked after creation; provider eligibility, resets,
  optional SMS behavior and supported currency options remain unchanged.
- Preserve existing Save guard, metadata-only edit, silent/tracked balance
  changes, cancellation and local command boundaries.
- Sheet contains silent/tracked options and Confirm. Cancel is backdrop/Android
  Back semantics; no added visible Cancel button or drag-to-dismiss.
- Preserve current route Back behavior; no source-backed dirty-leave
  confirmation is introduced.
- Offline local writes and current-user ownership are required. No Supabase
  reads, query construction or DB access added to presentational controls.
- Unrelated delete behavior remains outside this pilot. Safe-area checks
  distinguish header Save from sheet bottom actions.

## Implementation gate

Actual calibrated mockups under docs/mockups/accounts-ui-pilot/ are APPROVED for
package sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e;
all eight canonical sidecars passed integrity verification. Native fidelity
remains NOT RUN. Immutable binding records must identify image hashes, source
revision, viewport/UI surface, known exact facts and explicit unknowns. Hardware
frame/outer canvas is nonbinding unless expressly declared.

No plan/tasks/implementation artifacts generated here. Before implementation:
approve visuals; reconcile PR383; settle exclusive files; discover existing
tests; write/run meaningful failing deterministic and runner-controllable
journey coverage, then implement. Preserve manual/native gaps separately from CI
or source-level assertions.

## AKB-01 native keyboard precedence — compatible grouped-input option

**Effective additive source:** `GroupedDecimalInputProps` now has
`readonly preserveKeyboardType?: boolean` (**default `false`**), inherited
without edits by `GroupedMoneyInputProps = GroupedDecimalInputProps`. It does
not affect canonical parsing, currency precision, signed opt-in, display
formatting, focus/blur, or validation.

| Precedence                                           | Forwarded `inputMode` | `keyboardType` behavior                                                                                |
| ---------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------ |
| `showSoftInputOnFocus === false` (any options)       | `"none"`              | Existing no-soft-keyboard path retained, even if caller explicitly supplied a mode                     |
| Otherwise, caller supplied explicit `inputMode`      | The explicit value    | Native RN inputMode precedence intentionally retained                                                  |
| Otherwise, `preserveKeyboardType === true`           | `undefined`           | RN consumes the caller's native `keyboardType` instead of silently mapping a default decimal inputMode |
| Otherwise (default `preserveKeyboardType === false`) | `"decimal"`           | **Legacy grouped-input mode unchanged** for all unmodified callers                                     |

The old Accounts ordinary `TextField` passed `keyboardType="numeric"` and **no**
inputMode. In installed RN `0.83.6`, new route `inputMode="numeric"` would map
to `number-pad`, overriding that keyboardType; simply omitting it would make the
original grouped default select `decimal-pad`. Both differ from Android
`numeric`, which requests **decimal and signed** flags. The Accounts Add/Edit
routes explicitly opt into `preserveKeyboardType` and retain
`keyboardType="numeric"`, with no explicit mode. There is no global
keyboardType-based heuristic; a grouped-input caller opting out keeps decimal
inputMode. The opt-in affects only native keyboard-prop forwarding, **not** Add
unsigned / Edit signed grammar or any transaction/Metals rule.

**Verified read-only production caller inventory:** Add/Edit (new opt-in);
ManualTransactionEntry and TransferFields (no opt-in, native soft keyboard
suppressed); MetalHoldingForm weight (no opt-in, explicit decimal mode) and
purchase price (no opt-in, default decimal mode); GroupedMoneyInput wrapper
(unchanged delegation). RecurringPaymentFormFields and TransactionEditModal use
separate existing text inputs. Actual Android/iOS keypad, minus/dot keys,
clipboard/caret/IME and TalkBack remain **NOT RUN**.

**Authorization:** AKB-01 correction only on `codex/accounts-form-migration`,
parent `f6e2d88c6134bc823ea3cd833dc10ecfab5f004b`, source commit
`67616c2f080541c1ae922d24e0ed987d8f9a7aeb`. No new shared amount rules, locales,
tests, components or Foundation-branch writes. Unit/E2E tests remain deferred;
root repeats actual static checks and M1 reviews the corrected immutable source.
