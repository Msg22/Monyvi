# Accounts form migration — independent Phase 1 review and 35-case coverage audit

**CURRENT STATUS: PHASE 1 CONTRACT/QA AUDIT COMPLETE; PHASE 2 SOURCE REVIEW NOT STARTED.** This document reviews the approved adoption boundaries and published pre-migration source **only**. It does **not** approve or reject unpublished migration code. **No unit/integration/Jest/E2E/Maestro/device/manual runs and no native visual or accessibility PASS are claimed.**

## Authority and exact source boundary

| Item | Pinned authority / disposition |
| --- | --- |
| Repository, source read | \`Msg22/Monyvi\`, foundation #390 OPEN at exact \`b4a656e66263554a5dc001cee83a1431a3a9110b\` |
| Review branch/write permission | \`codex/accounts-form-migration-review\`, initially created at that exact SHA; **only** \`specs/390-accounts-ui-pilot/validation/accounts-migration-review.md\` may be created/updated |
| Source owner | Separate Normal ChatGPT source author on \`codex/accounts-form-migration\`; **completed migration source SHA pending root handoff**; no other code/test/docs ownership granted here |
| Governance / roles | \`AGENTS.md\`, \`.specify/memory/constitution.md\`, \`.agent/workflows/{team-led-delivery,sprint-issue,code-review}.md\` at governing \`3264eba2b67bcc66cddc95e3fbdb36e8705ee642\`; \`.agents/personas/frontend-developer.md\` and independent QA/TypeScript/logic/style role briefs defined in team-led-delivery (no tracked standalone QA persona). Ordered Phase 2 TS/React/async → logic/requirements → style/architecture, stopping on confirmed blockers. |
| Feature authority | \`specs/390-accounts-ui-pilot/{spec.md,plan.md,tasks.md,manual-test-plan.md,implementation-ownership.md}\`, \`contracts/{shared-fields,implementation-design}.md\`; user clarification in \`spec.md:10–12\` states **existing provider-aware uniqueness is correct** |
| Visual authority | **Already-approved** eight calibrated references, \`docs/mockups/accounts-ui-pilot/{design-contract.md,approval-manifest.json}\`, package SHA-256 \`265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e\`. Approval ≠ native fidelity |
| Foundation | Existing \`TextField\`, \`Dropdown\`, \`GroupedDecimalInput\`, \`GroupedMoneyInput\`, shared label/message helpers; foundation independently reviewed and **not in this migration writer's new ownership** |
| Latest human instruction | Migration explicitly approved; **all unit/integration/Jest/E2E/Maestro authoring AND execution deferred**. Mohamed owns manual/native, RTL, IME/caret, TalkBack and visual results. **Root must still perform real static typecheck, lint, formatting, i18n and Git hooks** on the completed migration SHA. Older TDD wording in the copied planning documents is historical and does not authorize new tests here. |

**Evidence classes (do not interchange):** \`source-inspected\` = relevant source/test assertions exist but no execution in this audit; \`authored-not-run\` = a YAML/test file exists somewhere but has no migration-run evidence; \`missing real-route proof\` = mocks/shared-field tests cannot certify the changed Account routes; \`manual NOT RUN\` = no actual result from Mohamed; \`conditional BLOCKED\` = only after a human verifies an essential failure/device trigger is unavailable; \`static checks pending\` = root to execute on exact later SHA. No test/visual/device result is inferred from an approved design.

## Phase 1 — Concrete migration adoption checkpoints (not assertions of new defects)

### ACM-01 · HIGH — Correct requiredness in the Account **owner controls**

**Authority:** \`spec.md:92–95\`; \`design-contract.md:55–68\`. Add needs **Account Type, Name, Currency, Initial Balance** marked, even with preselected Type. Edit needs **editable Name and Balance** only. Existing \`add-account.tsx:267–285,307–329\` renders \`AccountTypeSelector\`, Name \`TextField\`, a **local** \`CurrencySelectField\` and balance \`TextField\`; \`AccountTypeSelector.tsx:49–71\` uses horizontal \`radiogroup\`, with selected radio labels. Do **not** attach repeated required asterisks/phrases to every radio. The local Currency trigger must receive its own required label and accessible meaning of the selected currency; modifying generic \`Dropdown\` does not automatically cover it. Existing currency \`CurrencyPicker\` search/select/cancel must remain. Edit \`edit-account.tsx:418–470\` has locked Type/Currency via \`ReadOnlyDropdown\`, editable Name/Balance; locked fields **unmarked**, readable, with lock explanation. Provider/SMS/Card Last4 remain optional.

**Owner handoff:** reuse approved existing shared \`FieldLabel\`/localized required-name mechanism without reauthoring shared foundation or a universal form engine; EN/AR exactly-once requiredness, no default-required duplicate hint, genuine selected value and no unintended new copy.

### ACM-02 · HIGH — Canonical balance input and raw preview, not formatted form state

**Authority:** \`spec.md:95–98\`, \`contracts/implementation-design.md:20–31\`, \`design-contract.md:70–74\`. Current \`add-account.tsx:316–328\` and \`edit-account.tsx:458–470\` bind a \`TextField\` value/onChangeText to \`formData.balance\` with testID \`initial-balance-input\`. Existing Edit dirty state is **string equality** of \`formData.balance\` to original \`String(account.balance)\` (\`useEditAccountForm.ts:455–472\`). Existing Edit \`buildUpdateData\` calls \`parseFloat(formData.balance)\` (\`edit-account.tsx:271–287\`); existing Add and Edit Zod balance grammars accept **canonical dot-decimal, no grouping** (\`validation/account-validation.ts:6–23,73–89,169–180\`).

**Required adoption:** both routes should use the published thin \`GroupedMoneyInput\` **\`variant="default"\`**, pass \`value={formData.balance}\` and **\`onCanonicalChange\`** to \`updateField("balance", next)\`. Add is unsigned (default), starts \`"0"\`; Edit opts into \`allowNegative\`. Keep the existing \`testID\`, \`error\`, field focus/keyboard handling and direct preview input. \`12345.678\` becomes visible input \`12,345.678\` but **preview remains \`12345.678\`** and the form state remains \`12345.678\`. Edit \`-1234.567\` displays \`-1,234.567\` but remains canonical \`-1234.567\`. Malformed \`abc12345\` stays byte-for-byte raw, rejected by existing form schema; preserve existing arbitrary decimal length/trailing zeros and save conversion. No parse/round/strip formatter in screen logic.

**Concrete failure risk:** If a grouped display string enters \`formData.balance\`, \`parseFloat("12,345.678")\` would misinterpret it, validation fails or Edit becomes dirty solely from grouping. A focus/blur without a real numeric edit must **not** enable header Save, open the sheet or create financial effects. This is a migration review gate, **not** a defect in code not yet received.

### ACM-03 · HIGH — Provider-aware uniqueness and currency-selection race are **existing correct** rules

**Authority:** \`spec.md:10–12,99–101\`, \`manual-test-plan.md:29–33\`. Current \`services/edit-account-service.ts:163–181,235–308\`: uniqueness per **current user, currency, trimmed/case-folded nickname, provider identity**, with known \`institutionId\` precedence, otherwise whitespace-normalized manual \`providerDisplayName\`, otherwise no-provider identity; Edit excludes its own ID and deleted rows are ignored. \`useAccountForm.ts:105–208,213–233,238–366\` preserves current request cancellation/stale response checks, provider/type switches and a manual currency override against later profile preference loading; \`useEditAccountForm.ts:219–343\` holds Edit provider identity and pending Save.

**Preserve** equivalent manual provider conflicts, different manual provider allowance, known provider identity collisions, null/no-provider grouping, provider/type/currency reset eligibility, existing nonblocking uniqueness-query failure, the manual touched-currency rule, Current-user isolation and zero network dependency. Do not replace null IDs with empty strings or introduce a global nickname ban. **Only stale business documentation** may be corrected by its explicitly authorized writer; no provider business-rule or service edits by the migration worker.

### ACM-04 · HIGH — Silent/tracked financial effects, dismissal, default status and Save guards

Current \`edit-account.tsx:293–361\` compares parsed original/new balance; metadata-only Save calls \`performUpdate\` directly, changed balances open the existing \`BalanceChangedSheet\`. \`BalanceChangedSheet.tsx:110–146,250–339\`: **silent initially selected**, tracked is alternate, Confirm, backdrop/Android Back cancel. \`useUpdateAccount.ts:82–155\` and \`services/edit-account-service.ts:370–680\` own guarded balance commands and optional atomic adjustment; \`useCreateAccount.ts:35–95\` owns in-flight duplicate protection.

**Preserve exact public semantics:** metadata-only Save does not open a sheet; silent changed balance updates account with **zero** adjustment transactions; tracked changed balance produces **exactly one** history adjustment; backdrop/Android Back cancels commit and preserves unsaved form; failed Save retains correct feedback/ability to retry; rapid taps do not duplicate writes. Do not change service, schema, DB, financial precision policy, Delete, new Cancel gesture, or command identity as part of styling. Header Save stays in \`PageHeader\`.

### ACM-05 · MEDIUM/HIGH — Approved lock/default/optional layout without a redesign

At baseline \`ReadOnlyDropdown.tsx:76–116\` shows locked attribute radius12/old label with actionable tooltip; approved replacement geometry is radius16/default label **but still locked with its explanation**, not an ordinary disabled chooser. \`AccountTypeSelector.tsx:49–116\` must stay horizontally scrollable with intentionally partial next chip at compact widths. \`CurrencySelectField\` remains the local existing \`CurrencyPicker\` integration, with same supported currencies/search/cancel. \`SmsMatchingSection.tsx:63–136\` remains a **boxed optional Bank/Wallet section**; Cash hides provider/SMS; card digit input sanitizer at \`add-account.tsx:344–347\` / \`edit-account.tsx:536–539\` stays digits-only/max4. Edit's Default Account is **unboxed** (\`edit-account.tsx:473–521\`) and Danger Zone/Delete **continues below SMS** (\`:543–568\`).

Preserve baseline ordering: Add preview → horizontal Type → Name → conditional provider → Currency → Initial Balance → optional boxed SMS; Edit preview → locked Type → locked Currency → Name → conditional provider → Balance → unboxed Default → optional boxed SMS → Delete. Keep native ref/onFocus scroll/inset handling, unchanged preview and PageHeader Back/Save. Native sign keyboard, bottom inset, RTL and actual font/contrast cannot be claimed from JS source alone. Do not invent new CurrencyField adapter/flag glyph pack, warning threshold, drag-to-dismiss, extra footer Save or new dirty-exit confirmation.

### ACM-06 · Evidence limitations / no authorization for new automation

- **Existing SOURCE-INSPECTED automated test files:** \`__tests__/validation/account-validation.test.ts\` (Add negative, Edit signed, malformed/grouping, optional IDs); \`__tests__/hooks/{useAccountForm,useEditAccountForm}.test.ts\` (zero default, provider reset, debounce, stale identity, Save pending); shared \`__tests__/components/ui/{TextField,Dropdown,GroupedDecimalInput,GroupedMoneyInput.keyboard}.test.tsx\` and \`packages/logic/src/utils/__tests__/amount-helpers.test.ts\` (shared semantics). These assertions have **not** been executed for this Accounts migration.
- **Existing route tests are mocked at the changed UI boundary:** \`__tests__/app/add-account-institution-info.test.tsx:94–128\` and \`edit-account-institution-info.test.tsx:143–183\` mock the shared \`TextField\`, \`PageHeader\` and other controls and cover provider info/collapsed SMS. They **cannot prove real grouped/required/locked UI**.
- Existing \`apps/mobile/e2e/maestro/accounts/egyptian-institution-presets.yaml\` is **AUTHORED, not a verified run**. Previously authored T008 pilot create/edit/foundation YAML lived on a separate branch; its integration and run at this pin are **NOT ESTABLISHED**. New Account route integration automation is missing as executed evidence; all new authoring and all runs are **explicitly DEFERRED** by Mohamed. Do not commission new tests to fill this gap.
- Root-owned actual TypeScript checks, ordinary ESLint/Prettier/i18n and Git hooks on the eventual migration SHA are **REQUIRED/PENDING**, not covered by the unit/E2E deferral. No such checks were run by this reviewer.
- Approved HTML/PNG references and source class names do not establish native visual parity, safe-area/clipping, RTL/bidi/caret/IME, TalkBack/VoiceOver or actual spoken focus restoration. Mohamed owns manual/native evidence.

## Complete 35-case manual disposition matrix

**Every case remains \`NOT RUN\` for this migration at this Phase 1 checkpoint.** The older \`manual-test-plan.md:47–83\` maps case IDs to source evidence but has no actual results; source-inspected and authored test artifacts are **not** PASS. The manual owner must record build/SHA, device/locale/theme/font/insets, action/outcome, and remaining obstacle. Controlled error triggers cannot be invented.

| ID | Acceptance to validate through public UI | Preexisting source evidence and boundary | Status |
| --- | --- | --- | --- |
| 01 | Grouped Add/Edit input vs **ungrouped preview**, Save/reopen | Shared numeric tests; Account route linkage unverified | NOT RUN — Mohamed |
| 02 | Decimal length/trailing zeros, conversion unchanged | Schema and numeric source partial | NOT RUN — Mohamed |
| 03 | Edit negative, lone minus, grouped signed correction | Signed shared tests; native minus/clipboard not evidenced | NOT RUN — Mohamed |
| 04 | Add starts zero, accepts zero, rejects negative raw | Form hook and schema source | NOT RUN — Mohamed |
| 05 | Malformed letters/dots/comma groups exact raw then correction | Shared tests; real native paste distinct | NOT RUN — Mohamed |
| 06 | Fast typing and delayed parent updates preserve digits | TextField/GroupedDecimal test source | NOT RUN — Mohamed |
| 07 | Mid-string replacement, selection, comma deletion | No native caret evidence; human input boundary | NOT RUN — Mohamed |
| 08 | Clear, trailing dot, intermediate \`-\`, blur/refocus | Input and schema source partial | NOT RUN — Mohamed |
| 09 | Pristine Edit focus/blur does not enable Save/sheet | Dirty-state source; Account route not verified | NOT RUN — Mohamed |
| 10 | Add Type/Name/Currency/Initial Balance required; Edit Name/Balance only | Shared required props; local Type/Currency call sites unproved | NOT RUN — Mohamed |
| 11 | EN/AR required accessible name exactly once | Shared props, not spoken announcements | NOT RUN — Mohamed/TalkBack |
| 12 | Error > warning > helper, focused correction visible | Shared-field source; route not verified | NOT RUN — Mohamed |
| 13 | Temporarily disabled vs locked Type/Currency; lock tooltip works | ReadOnlyDropdown source, no native interaction | NOT RUN — Mohamed |
| 14 | Currency selection/picker search/cancel, late preference cannot overwrite touched choice | useAccountForm and picker source | NOT RUN — Mohamed |
| 15 | Type/provider switching resets existing optional fields; SMS collapse retained | Existing hook/mocked route tests | NOT RUN — Mohamed |
| 16 | Null institution / Other provider / Cash behavior | Schema, hook and presets flow source | NOT RUN — Mohamed |
| 17 | Scoped provider-aware nickname uniqueness, debounce, Edit exclusion | Current service/hook source, not public outcome | NOT RUN — Mohamed |
| 18 | Local uniqueness-query failure and recovery | Requires safe controlled failure; unavailable trigger = future BLOCKED | NOT RUN — Mohamed |
| 19 | Whitespace name error/correction, UI 50 chars vs schema 51 | Schema test source; actual UI not verified | NOT RUN — Mohamed |
| 20 | Sender alias and Card Last4 invalid3→valid4; sanitizer | Schema and conditional SMS source | NOT RUN — Mohamed |
| 21 | Save disabled/loading; failure feedback preserves form and retry | Guard source; controlled failure may be unavailable | NOT RUN — Mohamed |
| 22 | Rapid Save/Confirm one resulting account/effect | In-flight guards/atomic service source only | NOT RUN — Mohamed |
| 23 | Silent choice default; changed balance, no adjustment transaction | Existing sheet/route/source only | NOT RUN — Mohamed |
| 24 | Tracked choice produces exactly one adjustment/history record | Guarded service source, no public outcome | NOT RUN — Mohamed |
| 25 | Backdrop/Android Back cancels, no write, draft retained | BackHandler/onCancel source | NOT RUN — Mohamed |
| 26 | Failure/retry, metadata-only Save without sheet | Existing route, controlled failure may be unavailable | NOT RUN — Mohamed |
| 27 | Header Back, loading/not-found, no invented dirty guard | Edit route source | NOT RUN — Mohamed |
| 28 | Offline Add/Edit, local reopen/restart and user scoping | Local-first service architecture, not test evidence | NOT RUN — Mohamed |
| 29 | Default-account toggle and status unchanged | Edit hook/row source | NOT RUN — Mohamed |
| 30 | Scroll/bottom action vs nonzero inset (gesture/3-button), header Save separate | Existing ScrollView/inset source only | NOT RUN — Mohamed |
| 31 | Keyboard focus, correction, scroll to field and Save reachability | Existing keyboard callbacks/source | NOT RUN — Mohamed |
| 32 | Light/dark state colors and measured contrast | Approved references / NativeWind tokens, no native renders | NOT RUN — Mohamed |
| 33 | Arabic RTL layout, sign/currency bidi coherent | Locale/source only, native direction untested | NOT RUN — Mohamed |
| 34 | Compact/ordinary/tablet/landscape/enlarged text no clipping | Approved compact reference07, native variants absent | NOT RUN — Mohamed |
| 35 | Screen-reader order/labels/errors/locked and sheet focus restore | JS accessibility props only, no TalkBack/VoiceOver | NOT RUN — Mohamed |

**Accounting:** **35/35 NOT RUN for migration; 0 PASS; 0 FAIL asserted.** Cases 18,21,26 may be recorded as **BLOCKED only once** Mohamed establishes that their error trigger cannot safely be controlled. Native clipboard, caret, bidi, contrast and screen-reader cases remain manual, not fabricated automated evidence. Historical mockup approval and foundation Red/review do not change this matrix.

## Phase 2 handoff — NOT STARTED

**Trigger:** root gives exact immutable migration source SHA and base/diff. Do not review a moving branch. Review only source actually changed, then apply these gates in order:

1. **TypeScript/React/async:** imports, props/\`onCanonicalChange\`, hook call ownership, unchanged focus scroll/keyboard refs, stale uniqueness callback behavior and local state. Root executes typecheck/lint/i18n/hooks; this reviewer does not claim them.
2. **Logic/financial/failure paths:** inspect all ACM-01–04 requirements against exact changed lines. If form state holds grouped strings, \`parseFloat\` consumes grouping, uniqueness is redefined, command route alters silent/tracked effects, or provider/SMS/delete changes unintentionally, give precise blocker and minimal S1/source-owner correction, then STOP and recheck later.
3. **Style/architecture/static accessibility:** only if TS/logic clear. Inspect required group/currency local trigger and locked fields, existing design geometry/order/sections/Default/Delete, native safe-area source and approved NativeWind use. Human-only fidelity and spoken semantics are **NOT VERIFIED** by source.
4. **Evidence honesty:** no implied Green from unchanged shared test files or authored YAML; unit/E2E deferred, root static checks still required, Mohamed owns 35 manual cases.

**Priority for Mohamed's manual sampling** (not a reduction of 35): QA01/03–05/09/10 (format/value/required), QA14–17 (currency/provider), QA23–26 (financial meaning), then QA30–35 (device/RTL/accessibility). Record each case separately.

**Recommendation:** Authorized migration can continue with exclusive source ownership; **no source-level migration approval is issued until Phase 2**. Keep existing correctness boundaries; no new mockups, test suites, financial/provider rules, schema/service changes or global field redesign. This reviewer stops all other writes after this report.
