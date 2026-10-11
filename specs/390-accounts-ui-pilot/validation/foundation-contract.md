# T005 — Shared Field Foundation API Contract

**Status:** Proposed, source-pinned compatibility contract for a later tests-first foundation implementation. **No source code or tests are implemented by this document.**  
**Owned artifact:** `specs/390-accounts-ui-pilot/validation/foundation-contract.md` only.  
**Foundation branch preflight:** `codex/ui-field-foundation` at `4b64cf97296583975cc9b6fef12475ddb853ccb9` (exactly one commit ahead of pending PR #383 dependency).  
**Dependency:** open PR #383, `389-voice-usage-limits` at `0e7ee55abf6fb18af37e29e4f2e48ba45604a31e`; this dependency is *not* governance. The earlier `d45745a5c8a13db082eab24e12c2cc072e26c124` observations are historical.  
**Governing revision:** `3264eba2b67bcc66cddc95e3fbdb36e8705ee642` (`AGENTS.md`, constitution, business decisions, team-led-delivery, sprint-issue).  
**Approved visual reference:** eight Accounts pilot bindings, package `sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e`; the local root reported independent verification 8/8 PASS. This remote lane inspected the pinned manifest, design contract, stylesheet and state-board binding, but did not run the verifier, app or device.  
**Trace:** Tasks T005 → T006/T007/T008 → T009 Red gate → T010–T012 implementation → T013 Green and compatibility. The Accounts route migration belongs to a separate later PR.

## 1. Source observations frozen at the expected branch head

| Surface | Actual contract / risk at `4b64cf9` |
| --- | --- |
| `TextField.tsx` | Extends `TextInputProps`; `variant?: "default" \| "outlined"` defaults to `default`; supports `required`, `error`, `accessibilityLabel`, `accessibilityHint`, native `onFocus`/`onBlur`, `inputRef`, adornments, styles and `syncWhileFocused`. Focus-local draft protection is intentional. Requiredness is now a visible star plus fallback **hint**, not composed into the accessible name; `aria-invalid` and an alert error are present. |
| `GroupedDecimalInput.tsx` | `value: string`, `onCanonicalChange(value: string)`, `label`, required `testID`, `required`, `error`, `editable`, `autoFocus`, `keyboardType`, `inputMode`, adornments/ref, `accessibilityLabel`, `placeholder`, `containerClassName`, `maxLength`, `className`, `style`, `labelClassName`, `labelStyle`, `onFocus`, `onBlur`, `showSoftInputOnFocus` exist. It **hardcodes outlined**, calls unsigned `resolveAmountInputChange`, forwards the raw change on rejection, and always displays `formatAmountInput(value)`. |
| `GroupedMoneyInput.tsx` | Only delegates props and rendering to GroupedDecimalInput; its public props are an alias of `GroupedDecimalInputProps`. No separate money grammar or extra financial validation should be introduced. |
| `Dropdown.tsx` | Current PR #383 already supports `value: T \| null`, `onChange(value: T)`, `error`, `selectedAdornment`, trigger/label/text style props, and default/outlined. `T extends string \| number` remains. Do not reimplement nullable selection or error/adornment support, widen the value type, or turn missing IDs into empty-string sentinels. Requiredness is currently marker plus hint, without explicit accessible-name composition. |
| `amount-helpers.ts` | Legacy `formatAmountInput` groups digit runs without lexical validation: `abc12345` becomes `abc12,345`. The existing resolver has unsigned intermediate patterns and an important one-character edit path for formatted text; a rejected result may contain the **previous value** rather than raw typed text. A GroupedDecimalInput wrapper already emits raw `text` when `accepted === false`. `formatAmountInput("-1234.567")` already produces `-1,234.567`; **there is no proven minus-display lockout**. |
| Existing shared tests | `TextField.test.tsx`, `GroupedDecimalInput.test.tsx`, `GroupedMoneyInput.keyboard.test.tsx`, `Dropdown.test.tsx`, and `packages/logic/src/utils/__tests__/amount-helpers.test.ts` are present at this revision. Existing PR #383 focus/blur, soft-keyboard, null/error, adornment, 3-decimal weight and grouping tests are compatibility baselines, not missing APIs. |

Source links are ordinary pinned file paths in this repo. Account business validation remains in `apps/mobile/validation/account-validation.ts`; the Add unsigned / Edit signed grammar and existing save-time conversion are not changed here. Do not infer a currency precision limit for Account input from the separate strict transaction parser or the Decimal.js financial contract.

## 2. Proposed public TypeScript surface (additive and narrow)

These are **exact proposed identifiers and TypeScript signatures to test against before implementation**, not claims that exports already exist.

### 2.1 Numeric pure helpers — `packages/logic/src/utils/amount-helpers.ts`

The following existing public signatures and their unsigned behavior MUST remain callable and behavior-compatible:

~~~ts
formatAmountInput(val: string, initialValue?: string): string;
resolveAmountInputChange(
  text: string,
  previousValue?: string
): AmountInputChangeResult;
parseAmountInput(text: string, previousValue?: string): string;
~~~

Do not change `parseStrictAmountInput`, `parsePositiveFiniteAmountInput`, `parsePositiveMoneyAmount`, `isValidCurrencyAmount`, domain validation, currency precision, or their old callers. Add **opt-in** primitives instead:

~~~ts
export interface EditableAmountInputOptions {
  readonly allowNegative?: boolean; // default false
}

export type EditableAmountDisplay =
  | { readonly kind: "groupable"; readonly text: string }
  | { readonly kind: "raw"; readonly text: string };

export function resolveEditableAmountInputChange(
  text: string,
  previousValue: string,
  options: EditableAmountInputOptions = {}
): AmountInputChangeResult;

export function getEditableAmountDisplay(
  value: string,
  options: EditableAmountInputOptions = {}
): EditableAmountDisplay;
~~~

Contract: `allowNegative` defaults to `false`; with false, resolution delegates to / exactly preserves `resolveAmountInputChange(text, previousValue)`. The true branch recognizes optional leading `-` and correctable signed intermediate states, without imposing a new complete-value domain grammar. It preserves existing one-character formatted-edit, comma deletion and native replacement intent for the signed counterpart. Accepted known-good grouping emits an ungrouped dot-decimal string; rejected changes are left for the *component* to emit as raw text (never silently coerce a failed paste to the previous amount). No number coercion, sign stripping, auto-correction, rounding, scientific notation or new fractional-digit cap.

`getEditableAmountDisplay` returns `kind:"groupable"` only for syntactically recognized complete/intermediate *entry* text under the chosen unsigned/signed mode, including accepted existing comma grouping; it may then use unchanged `formatAmountInput`. It returns `kind:"raw"` for malformed text and MUST set `text` equal to the input byte-for-byte (no unsolicited commas). Classification is presentation-only, **not a Zod/domain validity check**: e.g. a numerically shaped intermediate may remain invalid on Account submission. Empty text is preserved as empty; trailing dot and zeros remain literal. Do not directly alter legacy `formatAmountInput` because RecurringPaymentFormFields, TransactionEditModal and other unsigned adapters call it.

`packages/logic/src/index.ts` already wildcard-exports `./utils/amount-helpers`; a new barrel write is unnecessary if the helper remains in that module. Pure helpers accept plain strings/options and cannot import runtime `@monyvi/db`.

### 2.2 Shared React Native fields

~~~ts
export type FieldVariant = "default" | "outlined";

// TextField: preserve `interface TextFieldProps extends TextInputProps`
// and every existing prop/default. Add only:
readonly helperText?: string;
readonly warning?: string;

// DropdownBaseProps<T>: preserve T extends string | number,
// value: T | null, onChange: (value: T) => void, and PR #383 props.
// Add only:
readonly accessibilityLabel?: string;
readonly helperText?: string;
readonly warning?: string;

// GroupedDecimalInputProps: preserve all current PR #383 props.
// Add only:
readonly variant?: FieldVariant; // DEFAULT "outlined"
readonly allowNegative?: boolean; // DEFAULT false
readonly helperText?: string;
readonly warning?: string;
readonly accessibilityHint?: string;

// GroupedMoneyInputProps remains GroupedDecimalInputProps;
// its wrapper forwards the options unchanged.
~~~

`TextField` and `Dropdown` keep their existing `variant="default"` default. `GroupedDecimalInput` and `GroupedMoneyInput` keep their current **outlined** default for every unmodified consumer. Later Accounts adoption explicitly opts in with `variant="default"`; only Edit will use `allowNegative`, Add stays false and starts at `0`. Passing an option MUST NOT mutate the value or label owned by the caller. No new auto-focus behavior or native keyboard kind is implied.

The grouped field uses `resolveEditableAmountInputChange(text, value, {allowNegative})` (or the legacy resolver directly when false); on `accepted` forward its `.value`, otherwise forward **the exact native `text`** to `onCanonicalChange`. It displays `getEditableAmountDisplay(value, {allowNegative}).text`, synchronizing the numeric `TextField` with `syncWhileFocused` as today. Keep `TextInputProps` callback event types, `inputRef`, `showSoftInputOnFocus`, `inputMode`, keyboard type, style/class/font and adornment forwarding from PR #383. Do not create a universal FormField or promote numeric free text to range/screen-reader slider semantics.

### 2.3 Visible labels and accessible required names

Use the existing active-locale `common.required_field` key: English `Required field`, Arabic `حقل مطلوب`. I18n language, **not `I18nManager.isRTL`**, determines the spoken phrase. Reuse the existing `required` boolean; no parallel requiredness flags or copy constants.

Proposed tiny shared pure composition helper (internal to UI, reused by TextField and Dropdown):

~~~ts
export interface RequiredAccessibleNameOptions {
  readonly label: string;
  readonly accessibilityLabel?: string;
  readonly required?: boolean;
  readonly requiredText: string; // t("required_field") in active locale
}

export function composeFieldAccessibleName(
  options: RequiredAccessibleNameOptions
): string;
~~~

Algorithm contract: base is the explicit `accessibilityLabel` when provided, else the field's localized `label`. Without `required`, return the base unchanged. When required, append the localized qualifier with the language-appropriate separating punctuation **only if it is not already present as an equivalent complete required qualifier**. Avoid substring/partial-word matching that drops meaningful names. The final accessible name contains requiredness **exactly once**, including pre-qualified override names. For example:

| Locale | Inputs | Final accessible name |
| --- | --- | --- |
| EN | `label="Amount"`, required | `Amount, Required field` |
| EN | `accessibilityLabel="Custom amount"`, required | `Custom amount, Required field` |
| EN | `accessibilityLabel="Custom amount, Required field"`, required | `Custom amount, Required field` |
| AR | `label="الرصيد"`, required | `الرصيد، حقل مطلوب` |
| AR | `accessibilityLabel="رصيد الحساب، حقل مطلوب"`, required | `رصيد الحساب، حقل مطلوب` |
| EN/AR | optional or locked display-only | exact supplied label/override; no required qualifier |

The visible asterisk is rendered **once** and is not concatenated into the accessible-name string. Once requiredness is in the name, do not also inject the identical default `required_field` hint; retain a caller-supplied *different* actionable hint and essential correction instructions, without duplicating the required phrase. Preserve the native enabled/disabled distinction; locked Account Type/Currency is the later adoption writer's job, not a global disabled TextInput conversion. Group-level Account Type requiredness belongs to the group, not each radio option (later Account migration). Actual TalkBack/VoiceOver announcements are separate native evidence, not proved by prop tests.

The source repeats visible label/star elements in TextField and Dropdown; a small `FieldLabel` may be justified by this concrete duplication. Dropdown also needs an actual `accessibilityRole="button"`/name at its *trigger*, with selected label/placeholder discernible as state/value; keep `onToggle`, nullable `value`, selected adornment, disabled semantics and modal selection intact. Do not create an unrelated generic picker. Any typed accessibility value must be a text description, not an invented numeric range.

### 2.4 Feedback contract: error > warning > helper

Both TextField and Dropdown currently duplicate the basic error slot, and both require the same proposed warning/helper precedence. A small internal `FieldMessage` is justified **only if** the focused tests show it removes that concrete repeated rendering; otherwise share a tiny selection helper and keep specialized wrappers. Proposed selection signature:

~~~ts
export interface FieldFeedback {
  readonly error?: string;
  readonly warning?: string;
  readonly helperText?: string;
}
export type PrimaryFieldMessage =
  | { readonly kind: "error" | "warning" | "helper"; readonly text: string }
  | null;
export function selectPrimaryFieldMessage(
  feedback: FieldFeedback
): PrimaryFieldMessage;
~~~

One primary message slot: nonempty error first, else warning, else helper. Essential corrective instructions must survive either in the error text or a distinct discoverable accessibility instruction; do not silently hide the information needed to fix a field. Errors stay visible while focused and retain invalid border and `aria-invalid`/alert semantics. Warning is advisory (`gold-600` approved token) with no error state or Save disable; helper stays supplementary. Focus keeps the **existing** border (no new focus ring). Disabled means temporarily noninteractive; locked attributes remain a separate readable/actionable presentation. Use approved registered NativeWind classes/colors and the immutable binding; do not add any financial warning rule, threshold, toast, modal or form-validation branch.

## 3. Deterministic value and interaction fixtures

These are **proposed test expectations, NOT RUN**, and distinguish emitted state from display.

| ID | Mode/input or event | Expected canonical callback/state | Expected grouped-field display / reason |
| --- | --- | --- | --- |
| NUM-01 | false, type `12345.678` | `12345.678` | `12,345.678`; Account preview stays separately `12345.678` during later adoption |
| NUM-02 | false, `1234567.8900` | unchanged string | `1,234,567.8900` (no rounded tail) |
| NUM-03 | true, paste `-1,234.567` | `-1234.567` | `-1,234.567` (existing formatter already handles display) |
| NUM-04 | true, `-` then `-1` then `-12.` then `-12.30` | exact successive intermediate/canonical strings | `-`, `-1`, `-12.`, `-12.30` |
| NUM-05 | true, edit `-1,234` to `-1,2345`; remove sign/commas | `-12345` then legitimate unsigned counterpart on sign removal | `-12,345` then valid grouped positive counterpart |
| NUM-06 | false, paste `abc12345` or `12..34` | raw native strings (rejected) | raw unchanged; **never** `abc12,345` |
| NUM-07 | true or false, malformed `12,34`, `1..2`, `--1234`, mixed letters | raw native strings until correction | raw unchanged; correction to valid state groups again |
| NUM-08 | true, `-0.000`, `-1.123456`, trailing decimal/zeros | no precision cap or rounding | preserves sign and trailing digits |
| NUM-09 | false, `1250.755` for Metals weight | `1250.755` | `1,250.755`; retains 3-digit weight precision |
| NUM-10 | false, unsigned `-1234.567` | rejected raw, no new accepted negative path | raw `-1234.567`; no unintended removal/repair |
| NUM-11 | false, formatted edit `1,2345` with previous `1234`; delete comma | existing resolver result `12345` / existing canonical unchanged | `12,345` / `1,234` |
| NUM-12 | any, focus, fast keystrokes, external prop rerender, blur/refocus, caret replace | no dropped digits; no formatting-only canonical change | preserves TextField focus-local draft and controlled numeric display |
| NUM-13 | any, empty value or `12.` | empty or trailing dot retained | empty or `12.` as typed |
| NUM-14 | same canonical on pristine Edit focus/blur | unchanged string / dirty remains false in later Account integration | grouping alone never flags a balance change |

Tests must also distinguish a rejected legacy resolver's `.value` from the GroupedDecimalInput's **actual emitted raw `text`**. Driver `changeText` is not native clipboard/IME proof, and no fixture modifies Account schema or finance conversion.

## 4. Exact existing consumer compatibility boundary

| Existing caller at this pinned dependency | Public behavior that must stay stable | Regression evidence to preserve |
| --- | --- | --- |
| `apps/mobile/components/add-transaction/ManualTransactionEntry.tsx` | GroupedMoneyInput remains outlined/unsigned unless caller explicitly opts in; `showSoftInputOnFocus={false}`, native ref/focus/blur, custom calculator, font, adornment, direct amount edits and Save ownership unchanged. | `apps/mobile/__tests__/components/add-transaction/ManualTransactionEntry.focus.test.tsx`, especially `manual-amount-input`, calculator and focus lifecycle cases. |
| `apps/mobile/components/add-transaction/TransferFields.tsx` | The target GroupedMoneyInput retains no-soft-keyboard mode, custom focus/blur, independent active amount field, suffix and test IDs; ordinary noncompact display still uses the legacy formatter. | `apps/mobile/__tests__/components/add-transaction/TransferFields.test.tsx` and the ManualTransactionEntry transfer-focus case. |
| `apps/mobile/components/metals/MetalHoldingForm.tsx` | Weight stays GroupedDecimalInput **outlined + unsigned**; price stays GroupedMoneyInput **outlined + unsigned**. Do not round or truncate three-decimal weight `1250.755`, or alter purity Dropdown nullable/error/selected option behavior. | `apps/mobile/__tests__/components/metals/metal-holding-additional-ui.test.tsx`, `apps/mobile/__tests__/app/metals-add.test.tsx`, existing GroupedDecimalInput tests. |
| `apps/mobile/components/recurring-payments/RecurringPaymentForm.tsx` / `RecurringPaymentFormFields.tsx` | The present amount field is an independent TextInput using legacy `formatAmountInput` / `resolveAmountInputChange`; no implicit migration or change to its accepted precision and validation. | Existing recurring form tests, if discovered by task owner; this T005 stage did not establish a specific canonical suite. |
| `apps/mobile/components/transaction-review/edit-modal/TransactionEditModal.tsx` | Existing native TextInput uses legacy `formatAmountInput` and `parseAmountInput(text, previousValue)`; old unsigned behavior and formatted-edit regression must not change. | `apps/mobile/__tests__/components/transaction-review/TransactionEditModal.test.tsx`, particularly formatted amount edits. |
| Current Account routes | Still use existing TextField balance and existing preview formatter; **not** modified by foundation. Later Add must opt in to default/unsigned, later Edit to default/signed, and name/currency/type/locked/confirmation composition is a separate PR. | 35-case manual map remains planned/NOT RUN; Account integrations occur only under separately assigned tasks. |

Do not reimplement PR #383 `Dropdown` nullable/error/adornment behavior, grouped focus/blur and keyboard suppression. Keep stable exported names and callback signatures, outline defaults, labels, test IDs, adornments and keyboard paths. Existing unit tests that assert the *old hint-only accessible name* must be updated deliberately to test the approved exactly-once name semantics, not disabled or deleted to make Green.

## 5. Owned test authoring and required Red assertions

All rows are assignments proposed for later distinct T006–T008 owners, **not written or run here**. Identifiers prefixed `FND-` are new trace IDs, not fabricated existing test names.

| IDs | Exclusive future suite / task | Required Red-to-Green assertions |
| --- | --- | --- |
| FND-L01–L06 | `packages/logic/src/utils/__tests__/amount-helpers.test.ts` (T006) | `getEditableAmountDisplay` valid grouping versus exact raw malformed; signed negative group/paste, minus intermediate and sign removal; one-character signed edit; arbitrary fractional length/trailing zeros and Metals 3 decimals; legacy `resolveAmountInputChange`/`parseAmountInput` two-argument behavior identical. |
| FND-I01–I07 | `apps/mobile/__tests__/components/ui/GroupedDecimalInput.test.tsx` (T007) | New explicit default style with outlined when omitted; signed opt-in/canonical callback; malformed raw input displayed verbatim; edit/selection, comma deletion, refocus, controlled rerender, no dropped typing; required-name override and existing focus/blur/ref/style/adornment forwarding. |
| FND-K01–K03 | `apps/mobile/__tests__/components/ui/GroupedMoneyInput.keyboard.test.tsx` plus existing delegation suite (T007) | Existing no-soft-keyboard inputMode `none` behavior, focus/ref/blur, outlined default; new default/signed props forwarded without separate numeric implementation. |
| FND-T01–T06 | `apps/mobile/__tests__/components/ui/TextField.test.tsx` (T007) | Shared visible asterisk once; EN/AR names once with and without explicit/prequalified override; optional/locked no star/qualifier; error visible during focus and aria-invalid; error > warning > helper; unaffected focus-local draft/controlled native callbacks and no new focus ring. |
| FND-D01–D06 | **Extend existing** `apps/mobile/__tests__/components/ui/Dropdown.test.tsx` (T007) | Existing `value:null`, placeholder, `onChange(T)` and `selectedAdornment` still work; new trigger accessible name with required/override EN/AR exactly once; focus/error/warning/helper precedence; disabled/readable semantics; existing default/outlined visual and error behavior. **Do not replace the suite.** |
| FND-C01–C05 | Existing consumer tests cited in section 4 (T007/T013 regression) | Manual calculator focus/soft keyboard, Transfer target independence, Metals weight 3 decimals and required semantics, existing formatted transaction edit and Recurring direct-resolver compatibility. No Account route adoption. |
| FND-E01–E03 | T008 future real public-path Maestro author only when T003 harness is controlled | Existing real path (e.g., seeded Metals purchase-price field) proves grouped display/correction and Back/Save regression; new Account Add/Edit signed/default journeys may remain Red until their *separate* adoption PR. No test-only product page, synthetic bypass or invented driver capability. |

**TDD stop order:** T006/T007/T008 must be assigned separate test ownership. Run meaningful, deterministic and honestly controllable E2E Red for the changed shared contract before any T010–T012 production edit; a missing emulator, unseeded auth, blocked clipboard or setup error is **not Red**. Preserve already-passing public smoke as compatibility evidence, not a fabricated failure. After root verifies T009, one owner implements the minimum Green path; rerun relevant tests and affected current-consumer suites, typechecks/lint/i18n with exact command outcomes. Record unsuccessful/harness-only cases as blocked, not passed. Future Account scenarios become Green only in the separate route migration. All 35 Account QA cases remain **NOT RUN** at this contract stage.

## 6. Ownership and integration requests

**Current T005 writer:** one tracked remote writer may create/commit **this file alone**. No code, tests, other docs, PR/issue/merge, branch-base update or device/provider actions are part of this task. The sole current branch must still equal the immutable expected head before the commit; stop on drift or ownership overlap.

**Future, subject to new explicit assignments (not authorized here):**

1. T006 pure logic owner: `packages/logic/src/utils/amount-helpers.ts` **only after Red**, with corresponding tests; new named helpers must preserve legacy exported signatures and behavior.
2. T007/T010–T012 shared component owner: `TextField.tsx`, `Dropdown.tsx`, `GroupedDecimalInput.tsx`, `GroupedMoneyInput.tsx` with corresponding existing suites, serial against the logic contract. `FieldLabel.tsx` and `FieldMessage.tsx` are narrowly justified *candidates* because labels/star and error renderers are duplicated in TextField and Dropdown; extraction only if Red and reuse evidence support it. An internal accessible-name helper may live alongside them; no universal FormField.
3. Reserved integration owner, **request rather than direct edits**: if a new localized key is proven necessary, exact EN/AR locale files plus `apps/mobile/i18n/translation-schema.ts`; if public helper exports cannot use the existing `packages/logic/src/index.ts` wildcard, request that barrel explicitly; if approved colors/layout cannot be expressed with registered NativeWind tokens, request the exact style/config file and measured reason. Current EN/AR `common.required_field` keys already exist (`Required field` / `حقل مطلوب`), and the amount-helper barrel already re-exports the module, so **none of these shared-file writes is currently justified**.
4. CurrencyField adapter: **defer**. Current Add currency trigger and `CurrencyPicker` have no second verified shared owner requiring an adapter in this bounded foundation. Do not create a currency abstraction based solely on a mockup or import preferences/DB into presentation.
5. Accounts route owner and AccountTypeSelector/locked attributes/BalanceChangedSheet: later independent migration PR only; hooks/services/schema/default-account/financial behavior excluded. Existing pilot-specific #359/#360 adoption does not close app-wide follow-up issues.

## 7. Remaining validation and stop conditions

- Visual approval is limited to the immutable eight-image package. Normal/default field dimensions, locked geometry, no new focus ring, and message order refer to its declared UI surface; sidecar verification should be rerun when implementation consumes those facts. No native rendering, keyboard/IME, RTL caret, screen reader, tablet/landscape or device/e2e PASS is established.
- A signed resolver algorithm or nontrivial selection/caret treatment must be chosen from meaningful Red evidence; a source-risk observation is not a proven native bug. Do not weaken unsigned parsing or change `formatAmountInput` globally merely to make one fixture pass.
- Future code must preserve `abc12345` exactly in grouped-field display, `-1,234.567` in signed Edit, arbitrary decimal length and trailing zeros, existing Account save-time conversion and Metals weight behavior. Focused errors remain during focus; warnings remain advisory.
- Root separately owns synthetic-auth/emulator preflight, harness capability and test execution. T003 is not PASS in the inspected readiness document; T009/T010 production gates must not be inferred from this contract commit.
- If integration reveals a necessary change outside exclusive allowlists, stop that writer and request a bounded new owner rather than changing shared locale/style/export or Account service files incidentally.

**T005 completion criterion:** one published Markdown artifact with this frozen proposal; no code/test changes, no runtime PASS claim. Source owner uses it to author/prove relevant Red first; coordinator verifies the published file and decides subsequent ownership.
