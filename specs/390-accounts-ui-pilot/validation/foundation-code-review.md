# Independent foundation code review — ordered static source inspection

> **CURRENT RE-REVIEW (exact source `2df548762c6fbda841b26cc64453c83ea6b511fd`): FCR-01's original parenthesis/terminal-period examples are FIXED, but a narrower quoted-qualifier case remains BLOCKING (FCR-01R). TypeScript/React static pass has no confirmed blocker; logic pass stopped at FCR-01R; style/architecture pass NOT STARTED by mandatory ordering. See current addendum below. The original `83572c8a...` findings are retained as historical evidence, not assertions about the repaired code. No tests/device checks were run by this reviewer.

**CURRENT DISPOSITION: FCR-01 PARTIALLY RESOLVED at `2df548762c6fbda841b26cc64453c83ea6b511fd`; residual FCR-01R BLOCKS LOGIC and style remains NOT STARTED.** Historical report below describes source `83572c8a...`; current evidence appears in the appended re-review. This is an independent static review, not executed TypeScript, unit, E2E, device, fidelity, or accessibility evidence. Mohamed expressly deferred automated tests and owns manual validation; S1 retains exclusive correction ownership. The report is the **only** write in this lane.

## Immutable scope / authority

| Role | Exact pin |
| --- | --- |
| Repository | `Msg22/Monyvi` |
| Governance | `3264eba2b67bcc66cddc95e3fbdb36e8705ee642` — AGENTS, constitution, team-led-delivery, sprint-issue |
| Parent dependency | `0e7ee55abf6fb18af37e29e4f2e48ba45604a31e` (PR #383 contextual source) |
| Production delta | `e992d747c3d900c3043a170d79274cbf3b594177..83572c8a5546bc4963055f25a9e847ec061d309a` |
| Final source/handoff head; review branch parent | `bf05b41e95207295854756c3a312e59f3c787290`; direct parent `83572c8a5546bc4963055f25a9e847ec061d309a` |
| Frozen approved API | `8fe1e021cc8ae393bd4c001d5e7901a880b1ae78`; `validation/foundation-contract.md` |
| Strengthened authored test source | `6e51a4889da545f64d6de0a19f848ca764b3161f`; five suites, **NOT** post-implementation execution |
| Approved binding | Eight-image package SHA-256 `265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e`; relevant `08-shared-field-states` plus 01–07, design contract |
| Review order | (1) TypeScript/React/async; (2) logic/requirements; (3) style/architecture only after preceding lanes clear |

The verified GitHub compare reports **five commits, exactly six production paths**: modified `apps/mobile/components/ui/{Dropdown,GroupedDecimalInput,TextField}.tsx`, modified `packages/logic/src/utils/amount-helpers.ts`, and new `apps/mobile/components/ui/{FieldLabel,FieldMessage}.tsx`. The existing `GroupedMoneyInput.tsx` remains unchanged and delegates to GroupedDecimalInput. No Account routes, services, tests, schema, locale, barrel, financial contracts, mockups or dependency files are part of this source delta. The final handoff commit adds only `validation/foundation-implementation-plan.md`.

## 1. TypeScript, React, and async lifecycle — completed static pass

**No confirmed blocking type/React lifecycle regression established by inspection.** This does **not** claim successful typechecking, linting, hook execution, or device rendering.

- New pure functions and options at `amount-helpers.ts:236–328` are additive; the old `formatAmountInput`, `resolveAmountInputChange` and `parseAmountInput` signatures/implementations remain unchanged at lines 52–60 and 185–234. The already-existing `packages/logic/src/index.ts:26` wildcard export supplies the new names.
- `GroupedDecimalInput.tsx:15–44,54–132` adds optional `variant`, `allowNegative`, `warning`, `helperText`, `accessibilityHint` without replacing the existing `onCanonicalChange(value: string)` contract; the `useCallback` depends on `allowNegative`, `value` and callback. Existing `inputRef`, `onFocus`, `onBlur`, keyboard suppression, adornments, styles, and `syncWhileFocused` are forwarded.
- `TextField.tsx:69–125` preserves the original focused draft effect and focus/blur callbacks; its changed fields use pure name/message selection and do not add new effects or asynchronous work. `Dropdown.tsx:259–437` keeps `value:T|null`, `onChange(T)`, disabled/modal/inline callbacks. Its new selected text accessibility value is a descriptive string rather than numeric range.
- Static type inspection cannot certify the RN `aria-invalid` prop on the Dropdown trigger or the actual accessibility tree; root owns exact TypeScript/lint and native validation. An unverified typing/native possibility is **not** reported as a confirmed blocker.

## 2. Logic / requirements — STOP at confirmed contract violation

### FCR-01 — HIGH / BLOCKING: punctuation-terminated prequalified names receive a duplicate required qualifier

**Source:** [`apps/mobile/components/ui/FieldLabel.tsx:20–33`](https://github.com/Msg22/Monyvi/blob/83572c8a5546bc4963055f25a9e847ec061d309a/apps/mobile/components/ui/FieldLabel.tsx#L20-L33).

**Affected consumers:** [`TextField.tsx:78–84,150–154`](https://github.com/Msg22/Monyvi/blob/83572c8a5546bc4963055f25a9e847ec061d309a/apps/mobile/components/ui/TextField.tsx#L78-L84) and [`Dropdown.tsx:288–294,355–361`](https://github.com/Msg22/Monyvi/blob/83572c8a5546bc4963055f25a9e847ec061d309a/apps/mobile/components/ui/Dropdown.tsx#L288-L294).

**Contract:** `validation/foundation-contract.md:122–133` and `contracts/implementation-design.md:33–37` require the localized `Required field` / `حقل مطلوب` qualifier exactly once with explicit, already-prequalified overrides; complete equivalent qualifiers must not be appended a second time, and callers' surrounding whitespace/punctuation should be preserved. The approved package requires the same shared required-name semantics.

**Deterministic source-path counterexample (not a test run):**

```text
label: "Amount"
accessibilityLabel: "Amount (Required field)"
required: true
requiredText: "Required field"

checked = base.trimEnd() -> "Amount (Required field)"
checked.endsWith("Required field") -> false, due to closing ")"
returned accessible name -> "Amount (Required field), Required field"
```

Likewise, `"Amount, Required field."` returns `"Amount, Required field., Required field"`; an Arabic prequalified override closed by punctuation has the corresponding duplicate. Both examples contain one **complete** qualifier before composition, unlike the correctly handled partial strings `"Required field help"` and `"UnRequired field"`. The code only recognizes suffixes where the required phrase is the absolute final text after trimming whitespace; any trailing punctuation defeats the completed-qualifier check. This is a confirmed pure-code branch inconsistency, **not** evidence of a particular existing route having such an override or of actual TalkBack duplication.

**Minimal S1-owned correction:** Inspect the final, localized qualifier as a **complete token** with optional permitted trailing delimiter punctuation/parenthesis in detection only; when already complete, return the original `accessibilityLabel` *unchanged*. Preserve valid caller formatting (including trailing punctuation/whitespace), enforce whole qualifier rather than substring matching, and keep EN/AR locale selection. Do not broadly strip punctuation or rewrite label strings. If testing resumes by human approval, add the two focused public-control cases through the existing TextField and Dropdown tests; no new helper/route/locale or Account migration is needed. Do not use `I18nManager.isRTL` as the language source.

**Impact / acceptance:** The shared field foundation currently cannot guarantee the frozen **exactly-once** accessible-name behavior for supported explicit overrides. Request S1's minimal fix and root source re-review before accepting the helper as fully conformant. Scope is confined to text accessibility, not persistence, auth, finance, schema, or requiredness ownership; no tests or native announcement were executed here.

**Review stop:** Per the ordered review protocol, logic does **not** clear FCR-01. The architecture/style/fidelity pass is **NOT STARTED**, not passed. Other numeric/display paths were source-inspected in this lane without establishing a separate confirmed blocker before this stop; they are not certified Green. The source currently expresses signed opt-in, legacy unsigned delegation, raw invalid classification, arbitrary fractions, and presentation-only messaging, but behavior at actual runtime remains unverified.

## 3. Coverage, execution, and ownership honesty

- **TypeScript check, lint, i18n and real hooks:** NOT RUN here; root owns them.
- **Post-implementation Jest/unit/integration:** **DEFERRED / NOT RUN** per latest human instruction. Previously reported Red on pre-implementation source or a public Metals Red is not post-Green.
- **T008 Maestro/new Account routes:** NOT RUN/DEFERRED for this source reviewer; Account adoption remains later PR.
- **Native caret/clipboard/IME, keyboard, RTL Arabic, TalkBack/VoiceOver, visual/responsive/dark fidelity:** NOT RUN; approved mockup image/binding verification is not native proof.
- **35 Accounts cases:** NOT RUN in this lane; do not change financial flows or declare their completion.
- **Repo mutations:** Only this report on the isolated review branch from exact `bf05b41e95207295854756c3a312e59f3c787290`. No source/tests/mockups/YAML/other docs, PRs, issues, merges, or runtime state changed.

**Recommendation:** **BLOCK source acceptance on FCR-01 until the approved name-qualifier behavior is corrected**. Root should grant only S1 a narrowly scoped code correction and arrange ordered re-review; do not infer that the unstarted style pass is clean. No testing deferral is reversed by this finding.

---

## Current ordered source re-review — `2df548762c6fbda841b26cc64453c83ea6b511fd`

**Authority and revision:** Original independent report commit `ac3f1677ec36d596ae0289bb916108f221344509` at review branch parent `bf05b41e95207295854756c3a312e59f3c787290`; originally reviewed source `83572c8a5546bc4963055f25a9e847ec061d309a`. Corrected immutable source target `2df548762c6fbda841b26cc64453c83ea6b511fd` on S1's separate foundation branch. Its direct parent is `8d7d589ad38d629b5f6278968644c0a6254e2612`. GitHub's `8d7d..2df5` compare establishes **one production file modified** (`FieldLabel.tsx`); the intervening four-test-file annotation commit only adjusted reported unsafe-assignment typing, not assertions, per root's verified comparison. From original `83572c8a..2df5`, only `FieldLabel.tsx`, four test files, and the existing implementation-plan note changed. No other foundation production code changed.

**Frozen review sources:** `validation/foundation-contract.md` as of `8fe1e021cc8ae393bd4c001d5e7901a880b1ae78`, governing `3264eba2b67bcc66cddc95e3fbdb36e8705ee642`, dependent PR #383 `0e7ee55abf6fb18af37e29e4f2e48ba45604a31e`, approved eight-reference binding package SHA-256 `265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e`, authored tests `6e51a4889da545f64d6de0a19f848ca764b3161f`. S1 remains sole foundation code-fix owner. This reviewer owns only this report.

### Ordered pass dispositions at corrected source

| Pass | Disposition | Source-grounded explanation |
| --- | --- | --- |
| **1. TypeScript / React / async** | **STATIC INSPECTION COMPLETE — no confirmed blocker** | The sole new production delta is a pure string helper body at `FieldLabel.tsx:23–42`; it does not add async calls, React hooks, public prop signatures, locale dependencies, or component lifecycle work. The previously inspected `TextField` focus/draft and `GroupedDecimalInput` callbacks remain unchanged. Root **reports** mobile/logic typechecks passed at the prior source snapshot; this auditor did not run compilation, lint, tests, or native validation on `2df5`. |
| **2. Logic / requirements** | **PARTIAL FCR-01 FIX, BLOCKED by FCR-01R** | Existing `(` plus closing `)` and trailing period cases are handled. But matching closing smart quotes/guillemets are stripped while their opening counterparts are not treated as valid whole-qualifier boundaries. See deterministic example below. Stop this pass on the valid, exact-once contract violation. |
| **3. Style / architecture / accessibility consistency** | **NOT STARTED / NOT PASSED** | Ordered workflow prohibits advancing while valid logic blocker FCR-01R remains. Previously read NativeWind class and helper structure do not constitute a completed style audit. Native visual, bidi, TalkBack and accessibility-tree evidence remain unexecuted. |

### FCR-01 resolution: verified for original report examples

**Source:** [`FieldLabel.tsx:20–42` at `2df54876`](https://github.com/Msg22/Monyvi/blob/2df548762c6fbda841b26cc64453c83ea6b511fd/apps/mobile/components/ui/FieldLabel.tsx#L20-L42).

The new `candidate = base.replace(/[\\s)...]/u, "")`-style final punctuation removal is actually implemented as `base.replace(/[\\s)\\]}'"»”’.,،؛:;!?؟]+$/u, "")`. This is **detection only**; the successful branch returns original `base` byte-for-byte (`FieldLabel.tsx:36–37`). Static control-flow cases:

| Locale / input | Result implied by the new branch | Disposition |
| --- | --- | --- |
| EN `Amount (Required field)` | `Amount (Required field)` | Original FCR-01 counterexample **FIXED** |
| EN `Amount, Required field.` | `Amount, Required field.` | Terminal punctuation **FIXED** |
| AR `رصيد الحساب، حقل مطلوب.` | Same string, preserved | Arabic comma / terminal punctuation **FIXED** |
| EN `Required field help` or `UnRequired field` | Adds `, Required field` as a distinct complete qualifier | Partial/subword false matches still avoided |
| AR `معلومات حقل مطلوب إضافية` | Adds `، حقل مطلوب` | Partial phrase still distinct |
| Optional `required: false` with any explicit override | Returns original `base` unchanged at line21 | Optional overrides preserved |

These are **source-derived expected results, not executed unit assertions or TalkBack observations**.

### FCR-01R — HIGH / BLOCKING: closing quote supported without its matching opening qualifier boundary

**Location:** `apps/mobile/components/ui/FieldLabel.tsx:25–42`; [exact source](https://github.com/Msg22/Monyvi/blob/2df548762c6fbda841b26cc64453c83ea6b511fd/apps/mobile/components/ui/FieldLabel.tsx#L25-L42).

**Frozen contract:** `validation/foundation-contract.md:122–133`: if an explicit override already contains an **equivalent complete** required qualifier, keep the caller's full text unchanged and do not repeat requiredness, in both EN/AR. This is not a test for unqualified partial phrases. The new source explicitly strips trailing closing guillemet `»` and smart quote `”` (line25) but its opening-boundary whitelist (lines28–35) omits `«`, `“`, and analogous opening `‘`.

**Deterministic, source-inspected counterexamples:**

```text
AR base = "الرصيد «حقل مطلوب»", required=true, requiredText="حقل مطلوب"
candidate after line25 = "الرصيد «حقل مطلوب"
candidate.endsWith(requiredText) = true
prefix at line27 = "الرصيد «"      // endsWith(«), not in complete-boundary set
hasCompleteBoundary = false
actual composed name = "الرصيد «حقل مطلوب»، حقل مطلوب"
expected = "الرصيد «حقل مطلوب»"

EN base = "Balance “Required field”", required=true, requiredText="Required field"
candidate after line25 = "Balance “Required field"
prefix = "Balance “"               // opening smart quote not accepted
actual = "Balance “Required field”, Required field"
expected = "Balance “Required field”"
```

This is a **confirmed code-path duplication for already-prequalified input**, not evidence that current Account screens supply these exact overrides, nor evidence of spoken duplication on an emulator. It is not a compiler/runtime crash claim. The broad class of FCR-01 is therefore **PARTIALLY RESOLVED**, not fully closed. Root may keep its original issue identifier; no separate issue/PR action is authorized.

**Smallest S1-owned correction:** Apply a **symmetric complete-qualifier boundary** test to already-recognized closing quote pairs (at least `«/»`, `“/”`, and `‘/’`) without broad substring matching. Keep `required: false` early return and return the original untouched string when complete. Maintain required locale from `common.required_field`, not RTL settings. Do not normalize caller text, alter optional names, reinterpret partial phrases such as `UnRequired field`, introduce locale keys, or change other UI/financial code. Any future tests for these cases require renewed explicit permission; automated tests remain deferred.

**Severity rationale:** The shared TextField and Dropdown consume this one helper. An already-complete localized required phrase can be announced twice as an accessibility name, directly violating the frozen exactly-once API. Fix is localized to one pure helper and does not require Account adoption. This is a code-path contract blocker despite its narrower input shape.

### Execution, assumptions and handoff boundaries

- **Root-reported:** Previous mobile and logic TypeScript checks passed at the S1 pre-fix production snapshot with authored tests; the intervening unsafe-assignment test annotations were repaired, but the reviewer did not independently rerun lint, types or i18n at corrected head. No source claim is promoted to an executed PASS.
- **DEFERRED by Mohamed:** Unit/integration/E2E/real-hook checks, native/emulator, clipboard, caret, IME, visual fidelity, TalkBack/VoiceOver and complete Accounts journeys; 35 manual scenarios are human-owned and cannot be inferred from this report. Previously observed pre-implementation Red is not post-implementation Green.
- **Scope:** No source, tests, YAML, approved mockup bytes, other docs, issues or PRs changed. This addendum modifies only `foundation-code-review.md` on the same isolated review branch. Review stops after confirmed logic blocker. Neither style nor release acceptance is granted.

**Recommendation for root:** Ask S1 for one narrow helper fix addressing FCR-01R and return the next immutable source revision for ordered re-review. Do not use this addendum to demand automatic tests or new runtime setup. **Current overall static code-review acceptance: BLOCKED.**
