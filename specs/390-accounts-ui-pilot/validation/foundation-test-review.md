# Independent foundation test-plan and coverage review (M1R/QA)

**Status:** SOURCE AUDIT ONLY — conditional test-draft acceptance; **NOT** T009 acceptance, Red execution, implementation approval, native QA, or the 35-case Accounts completion.

- **Repository:** Msg22/Monyvi
- **Governing authority:** `3264eba2b67bcc66cddc95e3fbdb36e8705ee642` (AGENTS.md, constitution, team-led-delivery, sprint-issue, TDD guidance).
- **Reviewed frozen source:** `f937a1ee9476fa5e177b968118455ae9babb436c`; API proposal parent `8fe1e021cc8ae393bd4c001d5e7901a880b1ae78`.
- **Evidence:** GitHub compare `8fe1e021...f937a1ee` reports ahead 7, **exactly five test files**: `packages/logic/src/utils/__tests__/amount-helpers.test.ts`, `apps/mobile/__tests__/components/ui/{TextField,Dropdown,GroupedDecimalInput,GroupedMoneyInput.keyboard}.test.tsx`; no changed production or approved mockup files. Existing public source at the pinned head still lacks the proposed helper exports, grouped opt-in props, and field feedback/name handling, establishing plausible *intended* Red targets, not observed execution failures.
- **Execution:** **NOT RUN by this auditor**. Root reports unchanged `4b64cf9...` baseline 12 suites/178 tests PASS; that cannot be promoted to new-head Red/Green. Native QA independently owns pinned local Red, outcome not supplied. T003 local-auth/emulator control **NOT PASS**. Existing mockup approval is not native fidelity evidence. No app/test/source/mockup edits in this review.

## Findings (specific remedial scope)

### GATE-1 — BLOCKER: meaningful Red and public-path prerequisites unavailable

`tasks.md:20,30–39`, `readiness.md:21–29`, `foundation-contract.md:193–208`: no T008 public-path Maestro file or runner result belongs to the five-file delta; T003 authenticated controllable synthetic local harness is not PASS. New-unit assertion source inspection can establish *expected* failures, not actual T009 Red. A missing launch/auth/emulator/build or a fail caused by test imports/mocks is not product-behavior Red. Root/Native QA must record targeted result, exact command/build/commit, failure relevance, and a controllable existing public journey (or explicit inability to satisfy the gate) **before** authorizing T010–T012. No test-only route, device claim, or synthetic bypass.

### Q1 — HIGH: Dropdown's accessible *current value* is not asserted

`Dropdown.test.tsx:261–290,367–412` checks button role, required accessible name, placeholder **visible text**, selected Cash **visible text**, icon and typed callback. It never asserts that a screen reader can discover the selected Cash/Bank value or unselected placeholder on the trigger. `foundation-contract.md:133–135` specifically requires selected value/placeholder discernible as state/value. An explicit `accessibilityLabel="Account, Required field"` may suppress descendant text's accessible announcement. **Add one parameterized real-trigger test** for empty and selected states that asserts readable value/state semantics (e.g., `accessibilityValue.text` or an approved equivalent) without duplicating requiredness. Do not prescribe a new generic picker or claim spoken TalkBack results; that remains native evidence.

### Q2 — HIGH: exactly-once required-name coverage misses partial qualifier collisions

`TextField.test.tsx:207–281` and `Dropdown.test.tsx:261–342` prove ordinary EN/AR, unqualified overrides, and prequalified overrides, but not `"Required field help"`, `"Unrequired field"`, Arabic phrase used as ordinary longer prose, or an equivalent qualifier with surrounding whitespace/punctuation. A naïve `includes(requiredText)` implementation could incorrectly omit the qualifier and still pass all authored tests, contrary to `foundation-contract.md:122–133`. **Add a few minimal complete-qualifier-versus-substring fixtures to both controls**, verifying exactly one complete localized qualifier and preserving the original override text. Check active language independently of `I18nManager.isRTL`; the existing `GroupedDecimalInput.test.tsx:270–296` already protects English under RTL. Dropdown's locale here is a narrowly mocked translator (`Dropdown.test.tsx:11–23`); confirm at least one EN/AR integration with real `common.required_field` localization before Green, not a claimed native announcement.

### Q3 — MEDIUM: unsigned backward-compatibility checks include a self-comparison and passive fixture

`amount-helpers.test.ts:322–338` compares the new unsigned resolver to the *current* `resolveAmountInputChange`; both could change together and equality would still pass. `GroupedDecimalInput.test.tsx:582–594` feeds an already-negative `value` and only asserts display, not an actual default-unsigned change callback. `foundation-contract.md:30–41,64–68,99–101,167–174` requires old two-argument outputs unchanged and unsigned callers unaffected. **Freeze two or three explicit legacy accepted/value fixtures** (valid grouped one-character edit, invalid paste, default negative), and exercise an actual negative `changeText` through default `GroupedDecimalInput` or `GroupedMoneyInput` to prove emitted raw text and absence of signed acceptance. Keep old `formatAmountInput("abc12345") === "abc12,345"` test: fixing invalid display must not change the legacy formatter.

### Q4 — MEDIUM: asynchronous focus/refocus and selection intent are incompletely exercised

`GroupedDecimalInput.test.tsx:426–580` uses synchronous controlled React state and `fireEvent.changeText`; prior tests `:125–231` exercise formatted typing/comma deletion, while `:233–268` tests *ordinary TextField* delayed draft behavior, not grouped numeric with stale external props. The new suite does not explicitly replay a stale-parent update, a malformed draft across blur/refocus, or a selection-range replacement with observed canonical sequence. `TextField.test.tsx:45–70` guards stale parent **for ordinary fields**, which is valuable but not a numeric proxy. **Add one deterministic grouped controlled-rerender/blur cycle** asserting the full callback sequence, exact malformed raw display, and eventual valid grouping, plus a selection-event fixture only where RNTL exposes a stable public prop. Driver `changeText`/simulated selection is never physical caret, clipboard paste, IME, or bidi evidence.

### Q5 — MEDIUM: feedback/accessibility assertions omit edge precedence and advisory styling

`TextField.test.tsx:330–416`, `Dropdown.test.tsx:414–471`, and grouped `:656–677` check nonempty error > warning > helper, focused error, alert, and non-invalid warning. They do not distinguish empty (`""`) feedback from a real error/warning, or assert the warning's approved `gold-600` token. Dropdown tests check red border and alert but not an invalid accessibility state on the trigger; `foundation-contract.md:137–155` covers the message/error semantics. **Add a compact empty-string precedence fixture and a warning-token/invalid-state assertion using public rendered props**; preserve actionable correction hints when focused. Class assertions are not visual-contrast or screen-reader PASS.

### Q6 — MEDIUM: consumer and public-path coverage is planned, not supplied by these five files

`foundation-contract.md:181–205` enumerates ManualTransactionEntry calculator/ref/no keyboard (C01), TransferFields target independence (C02), MetalHoldingForm 3-decimal weight and price (C03), recurring native amount parser (C04), and TransactionEditModal formatted edits (C05). No corresponding consumer suite was changed in `8fe1...f937`; the coordinator's 12/178 baseline is a separately reported prior result with unspecified per-suite coverage. Before T013, root must run the **existing exact cited suites**, attach revision/commands, and add only a smallest missing case if a changed contract is unguarded. For FND-E01–E03, obtain root's T003-controlled public path before expecting Maestro Red; future Add/Edit Accounts adoption is explicitly a different PR.

## Contract-to-test traceability (source coverage, never executed status)

| Trace | Existing/new assertion at f937 | Audit |
| --- | --- | --- |
| **FND-L01–L02** valid formatted and malformed exact-raw classification | `amount-helpers.test.ts:269–298` | COVERED in proposed source, NOT RUN |
| **FND-L03–L05** signed minus/intermediates, grouping/paste, edits, arbitrary decimals/trailing zeros, weight3 | `amount-helpers.test.ts:300–313,340–407` | COVERED; browser/native selection unproved |
| **FND-L06** old unsigned two-argument behavior | `amount-helpers.test.ts:315–338` | PARTIAL; equality-with-legacy is not an immutable expected value |
| **FND-I01–I03** outlined omission, default opt-in, raw invalid to valid, signed canonical | `GroupedDecimalInput.test.tsx:392–546` | COVERED in proposed source |
| **FND-I04** comma/sign deletion, focused state, stale props/selection | `GroupedDecimalInput.test.tsx:125–268,548–580` | PARTIAL; missing grouped stale-parent/refocus/selection behavior |
| **FND-I05–I07** required override, event/ref/keyboard/style/adornment, focused error | `GroupedDecimalInput.test.tsx:596–677` | COVERED for tested props; native accessibility/focus not proved |
| **FND-K01–K03** money keyboard suppression, outlined unsigned default, forwarded default/signed/refs/styles and trailing decimals | `GroupedMoneyInput.keyboard.test.tsx:30–167` | COVERED for rendered props; native keyboard not proved |
| **FND-T01–T03** EN/AR required names, override, optional/disabled markers | `TextField.test.tsx:156–177,206–328` | PARTIAL; complete vs partial qualifier not tested |
| **FND-T04–T06** error/focus, warning/helper order, unchanged focus border, ordinary draft | `TextField.test.tsx:45–70,330–416` | PARTIAL; empty text/advisory token/nativity absent |
| **FND-D01–D03** null/placeholder, selected adornment, required EN/AR and override | `Dropdown.test.tsx:98–175,261–342` | PARTIAL; longer qualifier substring and value announcement gap |
| **FND-D04–D06** alert/warning/helper, enabled/disabled, typed selection | `Dropdown.test.tsx:388–497` | PARTIAL; disabled already supported in source, no fabricated new API; accessible selected value missing |
| **FND-C01–C05** current real consumer regression | Named in `foundation-contract.md:181–205`, no consumer file in compare | PLANNED/T013; do not substitute old baseline count for pass |
| **FND-E01–E03** real existing public journey and future Account journeys | No Maestro file in compare; T003 not PASS | BLOCKED/PENDING harness; future Account route migration separately owned |

The proposed API behavior mapping is internally consistent with the pinned contract: `resolveEditableAmountInputChange`/`getEditableAmountDisplay` are additive; signed is opt-in, grouped valid entry emits dot-decimal canonical, malformed `abc12345` displays exactly raw, `12345.678` groups to `12,345.678`, `1250.755` and trailing zeros do not acquire a precision cap. Shared `TextField`/`Dropdown` preserve default geometry and preexisting responsibilities; grouped inputs preserve omitted outlined/unsigned and explicit default/signed. No broad currency adapter or new finance logic is needed. The test names mostly assert public state/props rather than private functions; `Reflect.get` in the pure test intentionally discovers not-yet-exported helpers instead of importing absent symbols. Class/style inspections are narrow contract tests, **not** native fidelity proof.

## Minimal bounded follow-up and acceptance recommendation

1. **Before declaring accepted Red:** run the five pinned suites and classify expected missing shared behaviors separately from import/setup/typecheck failures; record exact failed assertions and command/build SHA. Independent QA validates relevance; **do not** invent test outcomes.
2. **Smallest test additions:** (a) complete vs partial EN/AR qualifier cases in TextField and Dropdown; (b) selected/empty Dropdown accessible value; (c) explicit old unsigned fixtures plus changeText negative callback; (d) numeric stale-parent/refocus/correction sequence; (e) empty feedback precedence and warning/invalid semantics. These belong to the existing S1 test owner **after** separate root assignment; this auditor does not edit them.
3. **Before production permission:** root resolves T003 and a meaningful T008 public-path signal, or pauses/escalates the approved gate. The 4b64 baseline, Welcome-screen emulator, Jest `changeText`, local synthetic auth work, and screenshot/prop assertions alone cannot certify it.
4. **Before T013:** run cited existing-consumer suites and verify the stable foundation against signed/default opt-in, legacy unsigned/outlined, and 3-decimal weight; report actual Green commands, typecheck/lint/i18n separately. No Accounts-route migration, new Account balance Save, silent/tracked update, or persisted preview testing belongs to this PR.
5. **Later Accounts QA:** all 35 cases stay NOT RUN for this audit. Native clipboard paste, caret/IME/RTL bidi, keyboard suppression as actually rendered, TalkBack/VoiceOver, modal focus, dark/theme contrasts, viewport/insets and visual overlay remain native/device or controlled-E2E evidence, never inferred PASS.

**Recommendation:** **CONDITIONAL ACCEPT** of the five-file tests as a useful T006/T007 draft with genuine new behavioral targets; **DO NOT ACCEPT T009, start T010–T012, or call foundation complete** on this source audit. Prioritize Q1/Q2/Q3 before adopting the public accessibility/unsigned API, Q4/Q5 as focused coverage, and GATE-1 independently under the root's harness ownership. Preserve separate S1 test authorship and all other lanes. No test runner, device, API provider, remote business data, PR/issue or source mutations were performed by this auditor.

