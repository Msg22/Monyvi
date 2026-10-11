# Foundation code review — FINAL ordered static review

**CURRENT DISPOSITION: CLEAR — NO CONFIRMED SOURCE BLOCKERS at
`b56f2edea09dd1848da9177779ab8a0080ebce56`. Both historical findings FCR-01 and
FCR-01R are RESOLVED.** The TypeScript/React/async, logic/requirements, and
style/architecture passes are complete **as source inspection only**. This is
**not** evidence that automated tests, E2E, native functionality, accessibility
announcements, or visual fidelity passed; those statuses remain separate below.
There are **zero open confirmed actionable blockers from this independent source
review**.

## 1. Frozen scope, evidence, and exact revisions

| Evidence / lane                     | Exact revision or result                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository                          | `Msg22/Monyvi`                                                                                                                                                                                                                                                                                                            |
| **FINAL reviewed source target**    | `b56f2edea09dd1848da9177779ab8a0080ebce56`, branch `codex/ui-field-foundation`                                                                                                                                                                                                                                            |
| Final correction parent             | `2df548762c6fbda841b26cc64453c83ea6b511fd` — GitHub compare `2df548..b56f2` = **one commit; FieldLabel.tsx only; +4 / -1**                                                                                                                                                                                                |
| Original implementation source      | `e992d747c3d900c3043a170d79274cbf3b594177..83572c8a5546bc4963055f25a9e847ec061d309a`: **five commits; exactly six production files** (four modified, two added)                                                                                                                                                           |
| Intermediate changes                | `83572c8..b56f2` additionally includes annotation-only edits in four existing tests and one implementation-plan update. Root independently confirmed no assertion changes; this reviewer did not author either. Five of the original six production blobs are byte-identical to `83572c8`; only `FieldLabel.tsx` evolved. |
| Frozen public API                   | `8fe1e021cc8ae393bd4c001d5e7901a880b1ae78`, `specs/390-accounts-ui-pilot/validation/foundation-contract.md`                                                                                                                                                                                                               |
| Authored/strengthened test baseline | `6e51a4889da545f64d6de0a19f848ca764b3161f`; **not a post-implementation test result**                                                                                                                                                                                                                                     |
| Governance and dependency           | Main `3264eba2b67bcc66cddc95e3fbdb36e8705ee642` (AGENTS, constitution, team-led-delivery, sprint-issue); current PR #383 dependency `0e7ee55abf6fb18af37e29e4f2e48ba45604a31e`                                                                                                                                            |
| Approved visual/binding authority   | Eight-image package SHA256 `265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e`, with shared state board `08-shared-field-states.calibrated.binding.md`; **not native-fidelity evidence**                                                                                                                   |
| Independent review history          | Initial report `ac3f1677ec36d596ae0289bb916108f221344509` from source `83572c8`, first correction review `606a766e2981c592caaced44315d8346f70fa087` from source `2df548`; those historical BLOCK dispositions are superseded by this FINAL report                                                                         |
| Review write boundary               | Only this `specs/390-accounts-ui-pilot/validation/foundation-code-review.md` on separate branch `codex/ui-field-foundation-code-review`. No source, tests, mockups, YAML, other docs, PRs or merges changed.                                                                                                              |

The six audited production files at the final source target are:

1. `packages/logic/src/utils/amount-helpers.ts` (modified, 385 lines)
2. `apps/mobile/components/ui/TextField.tsx` (modified, 215 lines)
3. `apps/mobile/components/ui/Dropdown.tsx` (modified, 438 lines)
4. `apps/mobile/components/ui/GroupedDecimalInput.tsx` (modified, 133 lines)
5. `apps/mobile/components/ui/FieldLabel.tsx` (new originally, final corrected,
   68 lines)
6. `apps/mobile/components/ui/FieldMessage.tsx` (new, 56 lines)

`GroupedMoneyInput.tsx` remains the thin unchanged wrapper (props alias +
delegation); existing `packages/logic/src/index.ts:26` wildcard-exports the new
pure helper exports. These were read for compatibility, not added to the source
diff.

## 2. Historical findings — both resolved at FINAL source

### FCR-01 — RESOLVED (closing parenthesis, period, other terminal punctuation)

**Source:**
[`apps/mobile/components/ui/FieldLabel.tsx:20–45`](https://github.com/Msg22/Monyvi/blob/b56f2edea09dd1848da9177779ab8a0080ebce56/apps/mobile/components/ui/FieldLabel.tsx#L20-L45).

`base.replace(/[\s)\]}'"»”’.,،؛:;!?؟]+$/u, "")` computes a _detection-only_
candidate; it does not modify the eventual accessible name. A complete final
`requiredText` after a valid qualifier boundary returns the **original** `base`
at lines39–40. Thus `Amount (Required field)`, `Amount, Required field.`,
`الرصيد، حقل مطلوب.`, and whitespace-padded already-prequalified overrides do
not receive a duplicate. This resolves the original `83572c8` source-path
finding.

### FCR-01R — RESOLVED (paired smart quotation and Arabic guillemet delimiters)

**Exact change:**
`2df548762c6fbda841b26cc64453c83ea6b511fd..b56f2edea09dd1848da9177779ab8a0080ebce56`,
**only `FieldLabel.tsx:35–38`**. The complete qualifier boundary now includes
opening `«`, `“`, and `‘`, complementing closing `»`, `”`, and `’` already
removed for detection at line25. Illustrative source-derived expected outcomes:

| Required? | Active phrase       | Explicit accessible name                                   | Source-derived composition                          | Review                            |
| --------- | ------------------- | ---------------------------------------------------------- | --------------------------------------------------- | --------------------------------- |
| Yes       | EN `Required field` | `Amount (Required field)`                                  | **Same, unchanged**                                 | FCR-01 fixed                      |
| Yes       | EN `Required field` | `Amount, Required field.`                                  | **Same, unchanged**                                 | FCR-01 fixed                      |
| Yes       | EN `Required field` | `Balance “Required field”`                                 | **Same, unchanged**                                 | FCR-01R fixed                     |
| Yes       | EN `Required field` | `Balance ‘Required field’`                                 | **Same, unchanged**                                 | FCR-01R fixed                     |
| Yes       | AR `حقل مطلوب`      | `الرصيد «حقل مطلوب»`                                       | **Same, unchanged**                                 | FCR-01R fixed                     |
| Yes       | AR `حقل مطلوب`      | `رصيد الحساب، حقل مطلوب`                                   | **Same, unchanged**                                 | Complete qualifier                |
| Yes       | EN `Required field` | `Required field help`                                      | `Required field help, Required field`               | Partial phrase is not a qualifier |
| Yes       | EN `Required field` | `UnRequired field`                                         | `UnRequired field, Required field`                  | Subword match rejected            |
| Yes       | AR `حقل مطلوب`      | `معلومات حقل مطلوب إضافية`                                 | `معلومات حقل مطلوب إضافية، حقل مطلوب`               | Partial phrase is not a qualifier |
| No        | EN or AR            | Any explicit override, including one containing the phrase | **Same, unchanged**                                 | Early optional return at line21   |
| Yes       | EN/AR               | Unqualified ordinary label/override                        | Append `, Required field` or `، حقل مطلوب` **once** | Existing locale behavior          |

All results in this table are **derived from reading the exact pure helper**,
not executed test output, live screen-reader announcements, or a promise about
unrelated unsupported punctuation conventions. `TextField.tsx:78–84` and
`Dropdown.tsx:288–294` both use this shared helper with the active
`common.required_field` translation, not `I18nManager.isRTL`. Existing locales
contain EN `Required field` and AR `حقل مطلوب`; no new locale file or key is
required. The frozen exact-once rule is source-satisfied for the approved
complete/partial boundary fixtures.

## 3. Ordered pass 1: TypeScript, React lifecycle, and async correctness — CLEAR (static)

**No confirmed TypeScript/React/async blocker found across the six audited
production files.**

- `amount-helpers.ts:236–328` adds narrow
  `EditableAmountInputOptions.allowNegative?`, `EditableAmountDisplay`,
  `resolveEditableAmountInputChange(text, previousValue, options?)`, and
  `getEditableAmountDisplay(value, options?)`. New exports are reached through
  existing `packages/logic/src/index.ts:26`, without a barrel edit or new
  runtime DB import.
- `TextField.tsx:23–39,69–125` preserves `TextInputProps`, `inputRef`,
  `onFocus/onBlur`, ordinary focus-local `draftValue` and the `syncWhileFocused`
  behavior. The error/label selectors are synchronous pure derivations; the
  change introduces no new asynchronous operations, effects, cleanup, or
  dependency cycles.
- `GroupedDecimalInput.tsx:15–44,54–132` adds optional
  variant/signed/message/hint props while keeping
  `onCanonicalChange(value:string)`. The existing `useCallback` captures
  `allowNegative`, `value`, and `onCanonicalChange`; native input ref, keyboard
  type, input mode and `showSoftInputOnFocus`, focus/blur callbacks, styles, and
  adornments are forwarded to `TextField`.
- `Dropdown.tsx:33–71,259–437` preserves generic `T extends string|number`,
  `value:T|null`, typed `onChange(T)`, disabled/onToggle, modal and inline
  selection, selected adornment and text formatting. Its accessible value is
  `{text: ...}`, not an invented numeric range. `FieldLabel.tsx`/
  `FieldMessage.tsx` introduce no hooks.
- The sole final quote-boundary edit is a pure string predicate. It does not
  change props, class names, React JSX structure, translation calls, or
  asynchronous behavior.

**Executed-check provenance is distinct:** Root reports **actual** full mobile
and logic TypeScript checks, real ordinary-commit ESLint/autofix, Prettier,
i18n, and pre-push privacy checks all **PASS** at local commit
`1655fd3690e6d5a1f51088dc59dc9c8312d1dcff` (containing the `2df548` source plus
formatting/foundation YAML). The root plans to repeat required checks for
**`b56f2`**. This independent reviewer **did not run any of those commands** and
does **not** transfer the earlier PASS status onto `b56f2`. Real hooks/static
checks are not part of Mohamed's test deferral.

## 4. Ordered pass 2: logic, failure paths, and frozen contract — CLEAR (static)

**No further confirmed actionable logic blocker found.**

| Contract                                     | Exact relevant source                                                                               | Source-based disposition                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed opt-in; unsigned legacy untouched     | `amount-helpers.ts:185–234,236–312`; `GroupedDecimalInput.tsx:59–60,85–92`                          | `allowNegative` defaults false and delegates to preexisting resolver; old two-argument resolver/parser and formatter implementations unchanged. Signed intermediate `-`, grouped paste, sign removal, and formatted one-character edit paths are separate opt-in behavior.                                                         |
| Recognized grouping vs malformed raw         | `amount-helpers.ts:253–269,319–328`; `GroupedDecimalInput.tsx:85–111`                               | Recognized entries group; `abc12345`, `12..34`, malformed commas, repeated signs and scientific notation classify raw and are displayed without comma insertion. Rejected callbacks forward **exact original native text**, not a fabricated corrected amount.                                                                     |
| No rounding or new precision cap             | `amount-helpers.ts:253–328`                                                                         | Pure strings/regex/formatter; no `Number`/`parseFloat`/currency precision conversion in the new functions. Source supports `12345.678` → `12,345.678`, `-1234.567` → `-1,234.567` with opt-in, `1250.755` → `1,250.755`, arbitrary fractional digits and trailing zeros. Domain/save conversion remains existing caller ownership. |
| Outlined/unsigned consumer preservation      | `GroupedDecimalInput.tsx:59–60,99–130`; unchanged `GroupedMoneyInput.tsx:8,19–23`                   | Grouped controls default **outlined** and **unsigned**; explicit `variant="default"` enables future Accounts UI without globally changing Metals/Manual/Transfer consumers. Money wrapper delegates all props unchanged.                                                                                                           |
| Feedback precedence and correction           | `FieldMessage.tsx:14–55`; `TextField.tsx:85–94,144–163,207–211`; `Dropdown.tsx:295–304,335–362,421` | Whitespace-only error/warning falls through; one primary `error > warning > helper` slot, error alert/invalid border and input/trigger `aria-invalid`, warning advisory without invalid state. A different caller-supplied correction hint is preserved.                                                                           |
| Required/localized names; optional, disabled | `FieldLabel.tsx:14–45`; `TextField.tsx:78–88`; `Dropdown.tsx:288–300,351–363`                       | Exactly-once complete qualifier boundaries resolved as above; visible required star once; duplicate default required hint omitted; optional override unchanged; temporarily disabled selection stays disabled; selected/placeholder `accessibilityValue.text` exposed with trigger button role.                                    |
| Scope of change                              | GitHub six-file production compare                                                                  | No Account Add/Edit route adoption, provider/SMS, BalanceChangedSheet, financial workflows, auth/sync/schema, locale, dependency or app-wide rollout. Currency adapter remains intentionally deferred.                                                                                                                             |

The source-level compatibility checks do **not** prove native clipboard
paste/caret/IME behavior, async delayed parent rerenders under real devices,
persisted financial semantics, or native screen-reader output. They are **not**
new source blockers without observable evidence. No speculative defect is
promoted to a confirmed bug.

## 5. Ordered pass 3: style, architecture, and static accessibility consistency — CLEAR (static)

**No confirmed style/architecture blocker against the approved shared-foundation
scope.**

- `FieldLabel.tsx:48–66` replaces duplicate TextField/Dropdown label and
  red-star markup with a small shared label; both consumers still pass their
  existing `className` and `style`. The source stays presentation-only; the pure
  name composer is deterministic and shares the real existing locale key.
- `FieldMessage.tsx:25–55` factors previously repeated inline error rendering
  into a small selector/renderer, rather than a universal form engine. The
  existing `.input-error` class is `mt-1.5 px-2 text-xs font-bold text-red-500`
  in `apps/mobile/global.css:21–22`. Warning uses
  `mt-1.5 px-2 text-xs font-bold text-gold-600`, approved by
  `design-contract.md:45–46`; `gold.600` is registered in
  `apps/mobile/tailwind.config.js:94–99`. Helper stays supplementary muted text.
- `TextField.tsx:127–164` retains its preexisting default
  `rounded-2xl border bg-white p-4` / outlined `min-h-11 rounded-lg` class
  grammar. Focusing doesn't introduce a new ring or hide the selected error; the
  color selection changes only to the approved nonempty-error selector. Its
  leading/trailing adornments and native style forwarding remain in place.
- `Dropdown.tsx:305–350` preserves the existing default/outlined variant classes
  and trigger sizing, existing chevron/adornment/selection UI, selected option
  state and modal code. The new button role, name, value and disabled/invalid
  state are semantically consistent at source level with the frozen contract.
  Source props are **not** real TalkBack/VoiceOver proof.
- `GroupedDecimalInput.tsx:99–130` reuses `TextField` instead of introducing a
  new field engine; logical input scope and callback ownership remain distinct
  from Account validation and persistent financial services. `packages/logic`
  owns the new pure numeric classification, avoiding app-side business logic
  duplication.
- Approved eight-image binding `08` declares error > warning > helper, no
  focus-ring change, existing default control grammar, red500 and gold600,
  English/Arabic shared specimens, and separate native unknowns. The source
  doesn't alter fonts, page composition, responsive breakpoints, account Type
  row, SMS/Delete, sheet, or visual assets. Native screenshot, RTL/bidi,
  contrast, inset, animation, and screen-reader fidelity **remain human-owned
  and unverified**.

This style verdict is confined to **source consistency with registered classes
and approved contract**, not pixel-perfect UI comparison or a measured
accessibility audit. No second-order code changes or new abstractions are
recommended.

## 6. Final evidence matrix and handoff

| Activity                                                                                                   | Disposition / responsible owner                                                                |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Independent code source review at exact `b56f2`**                                                        | **CLEAR — 3 ordered passes complete, no confirmed blockers**                                   |
| Original FCR-01 / FCR-01R                                                                                  | **RESOLVED in final source**; previous reports archived by references above, not open findings |
| Root's TypeScript / ESLint-autofix / Prettier / i18n / privacy checks at local `1655fd369...`              | **ROOT-REPORTED ACTUAL PASS** (older source mix, not this review's execution)                  |
| Required check reruns on final `b56f2`                                                                     | **ROOT-OWNED / PENDING**; no PASS imputed                                                      |
| Unit/integration, T008 E2E, emulator                                                                       | **DEFERRED by Mohamed**; no Green claim                                                        |
| Native visual/manual input and accessibility, TalkBack/VoiceOver, RTL/caret/IME, all 35 Accounts scenarios | **Mohamed-owned manual validation / NOT ASSERTED**                                             |
| Foundation production, tests, approved bindings, schema, services, routes, PRs                             | **UNMODIFIED by this reviewer**                                                                |

**Final recommendation:** The corrected six-file shared foundation may **clear
independent static code review** at `b56f2edea09dd1848da9177779ab8a0080ebce56`.
Root retains ownership of required final-head lint/type/i18n/hooks/static checks
and integration/PR gates; Mohamed retains explicitly deferred unit/E2E/emulator
and manual/native verification decisions. This is **not release or runtime
acceptance**, but there is **no current source-review correction requested of
S1**. All further writes HOLD after this report publication.
