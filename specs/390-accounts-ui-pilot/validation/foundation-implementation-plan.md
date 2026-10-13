# Shared-field foundation — source implementation checkpoint (PLAN ONLY)

**Current disposition (2026-10-11):** Mohamed explicitly authorized an
additional **3–5.5 hours** of foundation implementation (resumed **12:54 UTC**)
and requested **direct implementation with unit tests deferred**. This latest
instruction superseded the former strict TDD/T003/T008/T009 _pre-source_ gates
for this bounded wave only. The implemented source snapshot is
§83572c8a5546bc4963055f25a9e847ec061d309a§. **All further writes now HOLD**
pending root static checks and independent M1 review. All post-implementation
tests and native checks are **DEFERRED / NOT RUN**, not PASS. The earlier
checklist below is retained as historical constraints, not new implementation
authority.

## Immutable authority and observed evidence

| Reference                     | Recorded state                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Governance                    | `Msg22/Monyvi` governing main `3264eba2b67bcc66cddc95e3fbdb36e8705ee642`; `AGENTS.md`, constitution, business decisions, team-led-delivery and sprint-issue strict TDD/approval rules                                    |
| Parent dependency             | PR #383 OPEN; head `0e7ee55abf6fb18af37e29e4f2e48ba45604a31e`, branch `389-voice-usage-limits`                                                                                                                           |
| Foundation branch             | `codex/ui-field-foundation`, plan's pre-publication head `06fc530aca89aef0754b0de1b14b23c243eeae12`                                                                                                                      |
| Frozen proposed shared API    | T005 `specs/390-accounts-ui-pilot/validation/foundation-contract.md` at commit `8fe1e021cc8ae393bd4c001d5e7901a880b1ae78`                                                                                                |
| Strengthened T006/T007 tests  | Immutable `6e51a4889da545f64d6de0a19f848ca764b3161f`; five existing suites; no production code edits                                                                                                                     |
| Deterministic meaningful Red  | Root/NativeQA-reported local run at `6e51`: mobile **42 FAIL / 45 PASS / 87**, logic **24 FAIL / 46 PASS / 70**, combined **66 FAIL / 91 PASS / 157**, with no reported setup/type/timeout failures                      |
| Current production comparison | Shared production matches PR #383 source at `0e7ee55`; no foundation source implementation yet                                                                                                                           |
| Visual authority              | Approved **eight-image** package `sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e`; 8/8 canonical bindings independently verified PASS; native visual fidelity and accessibility are **NOT RUN** |

The strengthened Red includes new pure opt-in APIs absent from current source
and real control failures: raw malformed `abc12345` displays `abc12,345`,
malformed signed `--1234` displays with inserted comma, negative grouped edit
emits raw/formatted text rather than canonical, explicit grouped
`variant="default"` still renders outlined, and required EN/AR names, Dropdown
trigger role/value and feedback precedence are incomplete. See
[`foundation-red.md`](./foundation-red.md) for immutable per-suite counts and
limitations. Some Q4/Q5 multistep assertions cannot advance past an earlier
expected Red assertion until Green; do not infer the remainder passed or failed.

**Public native Red has also been observed, but the gate remains held.** Root
reported a real public Metals purchase-price input journey using the **separate
M1 evidence/YAML revision `1cafe589`** (reported short SHA; do not infer a full
hash): typing `abc12345` displayed `abc12,345`, so the exact-raw assertion
**failed with exit 1**, **not timeout**. Separately, the existing correction /
Save / portfolio-reopen public baseline **PASSED** with unchanged production
`0e7ee55...`; that passing baseline is not a Green result for the proposed API.
Future **Add/Edit Account Reds are still running** on a separate branch/harness
and are not foundation acceptance results. Root's source gate remains **HOLD**
pending explicit T003/T008/T009 disposition.

## Minimum prospective source allowlist: seven paths, five core + two conditional

These are **future ownership candidates only**, _not_ presently writable. One
root-named foundation source owner must receive a fresh immutable head and
exclusive permission **after** the public E2E / T003 / T009 gate is accepted. No
unrelated code file can be pulled into scope implicitly.

| #                   | Exact candidate path                                | Minimum responsibility / expected tests                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**               | `packages/logic/src/utils/amount-helpers.ts`        | Add `resolveEditableAmountInputChange(text, previousValue, { allowNegative })` and `getEditableAmountDisplay(value, { allowNegative })`, with **false by default**, preserving old unsigned two-argument signatures/results and legacy formatter. Signed `-`, negative grouping/paste, one-character insert/delete, comma/sign deletion, invalid raw classification, fractional text/trailing zeros. Driven by T006 pure tests.                                       |
| **2**               | `apps/mobile/components/ui/TextField.tsx`           | Compose localized EN/AR required accessible name **exactly once** (including explicit/prequalified override, no partial-substring false match), share approved visible asterisk, preserve caller correction hint; error > warning > helper, empty values fall through; focused error/alert remains, no new focus ring. Preserve `TextInputProps`, `inputRef`, `onFocus/onBlur`, adornments, styles and normal focus-local draft behavior. T007 TextField tests.       |
| **3**               | `apps/mobile/components/ui/Dropdown.tsx`            | Preserve existing PR #383 `T \| null`, `onChange(T)`, modal/inline selection, adornments, styles, disabled behavior. Add RN-supported button role, exactly-once localized accessible name and readable current `accessibilityValue.text` for null placeholder vs selected item; invalid trigger semantics. Same message priority and gold-600 advisory treatment, with no new generic picker API. T007 Dropdown tests.                                                |
| **4**               | `apps/mobile/components/ui/GroupedDecimalInput.tsx` | Add `variant?: "default" \| "outlined"` default **outlined**, `allowNegative?: boolean` default **false**, optional helper/warning. Use opt-in pure resolver and validity-aware display so rejected pasted malformed text stays byte-for-byte raw across rerenders; accepted grouped edit emits ungrouped canonical dot-decimal. Keep `syncWhileFocused`, native keyboard/ref/focus/blur/style/adornment/label/`showSoftInputOnFocus` forwarding. T007 grouped tests. |
| **5**               | `apps/mobile/components/ui/GroupedMoneyInput.tsx`   | Remain a thin delegated wrapper with `GroupedMoneyInputProps = GroupedDecimalInputProps`. Prop forwarding may already work **without a file edit**; modify only if a verified test requires it. No independent parsing, currency rounding or new validation. T007 keyboard/delegation tests.                                                                                                                                                                          |
| **6 (conditional)** | `apps/mobile/components/ui/FieldLabel.tsx`          | Create only if TextField and Dropdown genuinely need one shared visible label/red-star/accessible-name composition helper and corresponding tests demonstrate real duplication. The approved contract proposed `composeFieldAccessibleName`, not an all-purpose FormField engine. Otherwise omit this sixth file.                                                                                                                                                     |
| **7 (conditional)** | `apps/mobile/components/ui/FieldMessage.tsx`        | Create only if repeated TextField/Dropdown feedback slots warrant a tiny shared selector/renderer for `error > warning > helper`; `""` is absent; error alert and correction guidance are retained. Otherwise omit this seventh file.                                                                                                                                                                                                                                 |

**Ownership sequencing:** Pure helper Red→Green first, then shared
TextField/Dropdown semantics, then grouped bridge/wrapper, followed by
compatibility regressions and independent review. No simultaneous authoring of
overlapping shared files. No source-write grant exists at this checkpoint.

## Hard preservation / no-scope-expansion constraints

- **Legacy amount behavior frozen.** Do not modify the existing
  `formatAmountInput`, `resolveAmountInputChange(text, previousValue?)`,
  `parseAmountInput(text, previousValue?)`, strict/transaction parse or
  financial rounding contracts globally. Signed is explicit opt-in; an unsigned
  negative `changeText` must emit the **exact rejected raw native text**, not an
  accepted negative canonical. Existing `formatAmountInput("-1234.567")` already
  displays `-1,234.567`; do not invent a minus-display defect.
- **No numeric coercion at keystroke.** Preserve arbitrary Account
  schema-accepted fractional length, trailing zeros, incomplete `-`/decimal
  intermediates and **Metals three-decimal weight** `1250.755`. Valid canonical
  `12345.678` displays `12,345.678` in the _future opted-in field_; the existing
  Account preview remains `12345.678` during the separate Accounts adoption. No
  new input precision cap, rounding, persistence conversion, or finance rule.
- **Current default behavior frozen.** `TextField`/`Dropdown` default to their
  existing `default` style; grouped inputs default **outlined/unsigned** until a
  caller opts in. Preserve ManualTransactionEntry custom calculator and
  no-soft-keyboard, TransferFields target focus, Metals weight/price,
  RecurringPaymentFormFields legacy resolver, TransactionEditModal formatted
  edit, current generic dropdown and focused ordinary TextField draft semantics.
  A grouped controlled numeric field intentionally syncs while focused; do not
  impose stale-parent ownership heuristics or suppress legitimate new external
  canonical values.
- **Localized/accessibility semantics.** Existing real `common.required_field`
  translations: EN `Required field`, AR `حقل مطلوب`. Match only a **complete**
  required qualifier, not ordinary text containing that substring, preserve
  prequalified surrounding punctuation/whitespace, keep optional overrides
  verbatim, avoid repeating the same required hint. Error stays visible during
  focus; warning is advisory gold-600 with no invalid/Save-disabled state. Real
  TalkBack/VoiceOver remains separate.
- **Not in this PR:** Account Add/Edit routes, AccountTypeSelector, account
  preview, provider/SMS sections, BalanceChangedSheet, locked Account
  attributes, account hooks/services/WatermelonDB/Supabase schema, integrations
  for new locale/barrel/style, global app-wide #359/#360 rollout or monetary
  policy. Reuse existing locale keys and `packages/logic/src/index.ts` wildcard
  export. Currency adapter remains **deferred** absent a proved shared
  responsibility.
- **No unsupported shortcuts.** No test-only route, mocked product
  implementation, auth bypass, unverified native caret/clipboard/IME assertion,
  private credentials/fixture data in Git, new currency precision rule or DB
  migration.

## Approved binding crosswalk — use references, not invented native measurements

**Binding and component anchors** (all in `docs/mockups/accounts-ui-pilot/`,
unchanged):

- `08-shared-field-states.calibrated.binding.md`: **primary shared state
  board**: normal, filled signed `-1,234.567`, focus caret with **unchanged
  border**, invalid `abc12345` **verbatim**, helper, advisory warning,
  temporarily disabled and locked; precedence error > warning > helper.
  Light/dark registered tokens, exact _reference_ layout facts: field radius 16
  / border 1 / padding 16 / min-height 54 CSS px, label-to-input gap 8 and 12px
  extra-bold label, message top gap 6 and horizontal padding 8, warning gold600
  / error red500. Browser CSS measurements are **not proven native dp or font
  pixels**.
- `01-add-bank-en-light.calibrated.binding.md`,
  `02-edit-bank-en-light.calibrated.binding.md`: **ordinary Add/Edit control
  surfaces**. Preserve existing PageHeader Back (minimum 44-square hit target;
  reference arrow28), header Save, preview card and form order; Add horizontal
  Type chips (56-high/radius24, overflow intentional), default editable fields,
  currency trigger and provider/SMS metadata; Edit locked Type/Currency
  explanation, **unboxed** Default row, **boxed** SMS and Delete below SMS.
- `03-add-bank-ar-light.calibrated.binding.md` /
  `04-edit-bank-ar-dark.calibrated.binding.md`: RTL/Arabic and dark variants;
  input values/signed numerals retain coherent LTR islands, logical start/end
  positions and localization. No native bidi/caret verification.
- `05-add-validation-en-light.calibrated.binding.md`: visible required stars and
  inline error states without hiding malformed text.
- `06-balance-changed-en-light.calibrated.binding.md`: unchanged silent/tracked
  radio choices and Confirm, backdrop/Android Back cancellation; **Account-sheet
  implementation is later/out of scope**.
- `07-compact-enlarged-en-light.calibrated.binding.md`: 320×568 reference with
  1.5 text scale; Type horizontal overflow, vertical form scroll; no native
  compact/tablet proof.
- `approval-manifest.json`, `design-contract.md`, `reference-style.css`:
  immutable approval context / registered palette / declarative reference
  styling. **Component/icon continuity**: existing PageHeader back icon, default
  field leading/trailing adornments, Dropdown down/up chevron and selected
  option check, 17px Type icon in 32px holder, SMS chat icon, Edit lock
  explanation/icon, currency flag/emoji placeholder and account preview stay
  as-is. The mockup's **20×13.33 SVG currency flag is a reference stand-in**,
  not permission to replace native emoji with a new icon package or to create
  CurrencyField during foundation-only work.

The eight pairs passed content verification at package `265cd15f...`; native
font metrics, emulator insets, shadow/blur, SVG-vs-emoji appearance,
tablet/landscape, clipboard/IME, TalkBack and visual overlay are **UNKNOWN/NOT
RUN**. The approved images constrain future design; they do not prove
implementation fidelity.

## Time estimate, dependencies and release gates

**Estimated after explicit source authorization, excluding runtime recovery /
new public-path setup:**

| Activity                                                                          |     Source/review allowance |
| --------------------------------------------------------------------------------- | --------------------------: |
| Pure numeric resolver and display classification                                  |                   45–75 min |
| TextField + Dropdown accessible naming / message semantics                        |                   50–80 min |
| Grouped input bridge, props and affected caller safeguards                        |                   30–50 min |
| Five-suite Green, seven existing consumer regression suites, typechecks/lint/i18n |                   40–70 min |
| Independent code/logic/accessibility review and corrections                       |                   30–60 min |
| **Total forecast**                                                                | **3 h 15 min – 5 h 35 min** |

This is a **planning estimate**, not elapsed work, an implementation
authorization, or a delivery promise; root reconciles it against Mohamed's
approved 4–6-hour foundation budget and observed blockers. The base prechange
**12 suites/178 PASS** includes seven consumer suites/**108 PASS** at unchanged
`4b64cf9`; the **post-Green** rerun is required to establish compatibility.
Green must cover every observable assertion, including later steps masked by
current Red failures, signed and default opt-in, empty feedback, EN/AR
required-name boundaries, raw correction/rerender, keyboard/ref/blur/adornments
and current consumer callbacks.

**Before any source writing:** root verifies exact branch/dependency and mockup
revisions, accepts independently controlled **T003 harness**, actual public
**T008** smoke/E2E evidence and overall **T009** meaningful Red, then grants
exclusive file ownership. The observed Metals invalid-price Red is genuine and
the old correction/Save/reopen baseline passes, but root expressly keeps the
**production gate HOLD** while future Add/Edit Reds and runtime decisions
continue. Passing unit Red or a baseline by itself is not enough to start. After
authorized changes: record exact T010–T013 Green, seven consumer regressions,
typecheck/lint/i18n and independent review; native visual/accessibility and all
**35 Accounts** scenario IDs remain separate (**NOT RUN** here). Foundation PR
base stays `389-voice-usage-limits` until PR #383 merges; no PR, merge or
retarget action is authorized by this plan.

**Checkpoint disposition:** PLAN RECORDED. **SOURCE/TEST WRITES HOLD.**

## Source implementation snapshot — new authorization supersedes former pre-source HOLD

**Source commit:** `83572c8a5546bc4963055f25a9e847ec061d309a` (parent plan-only
`e992d747c3d900c3043a170d79274cbf3b594177`), branch `codex/ui-field-foundation`.
**Implementation complete, validation deferred.** Root and M1 should review the
exact published diff, not infer that previously failed assertions are now
passing.

### Exact source file and API disposition

| File                                                 | Published scope                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/logic/src/utils/amount-helpers.ts`         | Additive `EditableAmountInputOptions.allowNegative?`, `EditableAmountDisplay`, `resolveEditableAmountInputChange(text, previousValue, options?)` and `getEditableAmountDisplay(value, options?)`. Unsigned/default delegates to old resolver. Signed opt-in handles minus intermediate, negative grouping/paste, sign/comma/one-character edits. Recognized values group without coercion; malformed values remain byte-for-byte raw. |
| `apps/mobile/components/ui/TextField.tsx`            | Uses shared FieldLabel/FieldMessage, localized complete-qualifier required name once, preserves custom correction hints, applies error > warning > helper with focused error/alert and existing draft/ref/focus/adornment behavior.                                                                                                                                                                                                   |
| `apps/mobile/components/ui/Dropdown.tsx`             | Keeps PR #383 nullable `T                                                                                                                                                                                                                                                                                                                                                                                                             | null`, typed `onChange(T)`, adornments and modal/inline selection; adds button role, readable placeholder/selected `accessibilityValue.text`, localized name, invalid semantics and shared message priority. |
| `apps/mobile/components/ui/GroupedDecimalInput.tsx`  | `variant` defaults `outlined`, `allowNegative` defaults `false`; opt-in signed canonical changes and validity-aware display. Forwards existing PR #383 keyboard/ref/focus/blur/styles/adornments and numeric `syncWhileFocused`.                                                                                                                                                                                                      |
| **New** `apps/mobile/components/ui/FieldLabel.tsx`   | Small shared visible required-star label and pure `composeFieldAccessibleName`; only complete final localized qualifiers count, preserving prequalified overrides and punctuation/whitespace.                                                                                                                                                                                                                                         |
| **New** `apps/mobile/components/ui/FieldMessage.tsx` | Small shared `selectPrimaryFieldMessage` and error alert/advisory `text-gold-600`/helper renderer; whitespace-only values fall through, no new warning business rule.                                                                                                                                                                                                                                                                 |
| `apps/mobile/components/ui/GroupedMoneyInput.tsx`    | **Unchanged**. Existing `GroupedMoneyInputProps = GroupedDecimalInputProps` and delegate already forward new options; no separate money rules or wrapper patch required.                                                                                                                                                                                                                                                              |

**Six authorized production paths changed: four modified, two new.** No Account
routes, TypeSelector/locked controls/balance sheet, hooks/services,
finance/domain validation, DB/schema/sync, test files, locale keys, barrel,
global styling, dependencies, provider calls, mockup bytes, other branch, PR or
issue changes. Existing legacy `formatAmountInput`, `resolveAmountInputChange`,
`parseAmountInput` and validators remain unchanged; the new pure entry helpers
use no `Number` or `parseFloat` and impose no precision/rounding limits.

### Immutable constraints and test deferral

- **Frozen contract:** `8fe1e021cc8ae393bd4c001d5e7901a880b1ae78`; authored
  strengthened tests: `6e51a4889da545f64d6de0a19f848ca764b3161f`. Previously
  verified **66 deterministic failures / 91 passes** were against
  pre-implementation source; they do **not** count as Green for this commit.
- **Approved eight-image package:**
  `sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e`,
  prior 8/8 bindings PASS. State-board `08`, Add/Edit `01/02`, AR/dark `03/04`,
  validation `05`, other sidecars and approved component/icon rules remain
  unchanged. Native visual/accessibility parity remains NOT RUN.
- **Compatibility to verify later:** unsigned/outlined defaults; signed Edit
  only when opted in; malformed `abc12345` shown raw, valid `12345.678`
  displayed `12,345.678`, signed `-1234.567` displayed `-1,234.567`; arbitrary
  decimals/trailing zeros, Metals `1250.755` weight, Manual custom calculator
  and no-soft-keyboard, Transfer target focus, Recurring and TransactionEdit
  legacy format/parser, TextField focus-local drafts and typed Dropdown null
  selection. The Account preview and all actual Add/Edit routes are **not
  adopted** by this PR.
- **Deferred at Mohamed's request:** Jest/unit/real-control Green, seven
  existing consumer regressions (old baseline **108 PASS**), TypeScript, lint,
  i18n checks, actual native/controlled smoke E2E, clipboard/caret/IME/TalkBack,
  pixel/RTL/tablet/landscape visual comparison. **NOT RUN after
  implementation**, not PASS. The native public Metals invalid-input Red and
  separate correction/Save/reopen baseline are earlier evidence only; future
  Add/Edit tests and all **35 Account QA** remain separate and NOT RUN.
- **Next ownership:** Root alone runs authorized static checks/real hooks and
  commissions M1's independent source review at this immutable SHA. Any fixes
  require a fresh exact-head and explicit file ownership. No PR/merge/retarget
  or new source/test write is authorized by this document.

**Current status: IMPLEMENTED SOURCE SNAPSHOT, UNVERIFIED; ALL WRITES HOLD.**
Historical T003/T008/T009 pre-source blockers below were explicitly overridden
for this bounded source delivery, not converted to test/quality/release PASS.
