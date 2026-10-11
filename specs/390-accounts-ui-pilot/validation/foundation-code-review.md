# Independent foundation code review — ordered static source inspection

**Disposition: BLOCKING LOGIC FINDING; later style pass STOPPED.** This is an independent static review, not executed TypeScript, unit, E2E, device, fidelity, or accessibility evidence. Mohamed expressly deferred automated tests and owns manual validation; S1 retains exclusive correction ownership. The report is the **only** write in this lane.

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

