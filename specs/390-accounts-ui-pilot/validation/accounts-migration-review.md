# Accounts migration — FINAL AKB-01 focused source re-review

**CURRENT DISPOSITION: CLEAR — AKB-01 RESOLVED by independent static review at exact Accounts source HEAD `c6d67355eb3dac81145422c027c87af1c5a4ab89`.** Ordered TypeScript/React/async → logic/requirements → style/architecture passes completed with **zero newly confirmed blockers** in the bounded correction. This supersedes the earlier BLOCKED report at `f6e2d88c6134bc823ea3cd833dc10ecfab5f004b`. Static review does not establish native keyboard behavior, Jest/E2E Green, actual device fidelity, release acceptance or PR merge readiness.

## 1. Exact immutable evidence and scope

- Repo `Msg22/Monyvi`; corrected production commit **`67616c2f080541c1ae922d24e0ed987d8f9a7aeb`**, parent `f6e2d88c6134bc823ea3cd833dc10ecfab5f004b`. Verified GitHub diff is **only three source files**: `apps/mobile/app/(private)/add-account.tsx`, `apps/mobile/app/(private)/edit-account.tsx`, `apps/mobile/components/ui/GroupedDecimalInput.tsx`.
- **Examined final handoff head `c6d67355eb3dac81145422c027c87af1c5a4ab89`**, parent `67616c2...`, tree `f7d19501b7264e3c48e30694e9d43c29817cfd97`. Diff `67616c2..c6d67355` changes **only** `specs/390-accounts-ui-pilot/contracts/{implementation-design,shared-fields}.md` and `validation/accounts-migration-plan.md`; there is **no post-fix production change**.
- PR [#393](https://github.com/Msg22/Monyvi/pull/393) was verified **OPEN / DRAFT** at `c6d67355...`, stacked on Foundation `codex/ui-field-foundation`. Foundation PR #390 remains an independent unchanged source head `b4a656e66263554a5dc001cee83a1431a3a9110b`. Previously authored `foundation-pr-review-triage.md` is a **separate report** and not part of this Accounts review change.
- Scoped reviewer ownership remains **only** `specs/390-accounts-ui-pilot/validation/accounts-migration-review.md` on `codex/accounts-form-migration-review`; source, tests, approved mockups, other docs/triage, issues, PRs, refs and native data were not mutated.

## 2. Ordered pass 1 — TypeScript, React and async — CLEAR (static)

At [`GroupedDecimalInput.tsx:15–47`](https://github.com/Msg22/Monyvi/blob/c6d67355eb3dac81145422c027c87af1c5a4ab89/apps/mobile/components/ui/GroupedDecimalInput.tsx#L15-L47), the source adds the optional **`readonly preserveKeyboardType?: boolean`** alongside existing optional `inputMode` and `keyboardType` types, defaults it to `false` in destructuring at line 71, then forwards the derived `inputMode` to unchanged `TextField`. `undefined` is legal for the optional RN prop; the custom prop is consumed by the grouped wrapper and **not spread into native TextInput**. `GroupedMoneyInputProps = GroupedDecimalInputProps` and `<GroupedDecimalInput {...props} />` at `GroupedMoneyInput.tsx:8,19–23` preserve typed delegation without a wrapper edit. Both Account routes' boolean shorthand `preserveKeyboardType` is valid. Hook order, focused draft `syncWhileFocused`, `useCallback` dependencies, input refs and native focus/blur forwarding are unchanged. **No confirmed TypeScript/React/async blocker** was established in the three-file source correction; this reviewer ran no compiler/tests.

## 3. Ordered pass 2 — exact keyboard precedence and consumers — CLEAR (AKB-01 fixed)

**Effective implementation:** [`GroupedDecimalInput.tsx:97–125`](https://github.com/Msg22/Monyvi/blob/c6d67355eb3dac81145422c027c87af1c5a4ab89/apps/mobile/components/ui/GroupedDecimalInput.tsx#L97-L125) derives `resolvedInputMode` as follows:

| Input branch | Forwarded `inputMode` | Preservation |
| --- | --- | --- |
| `showSoftInputOnFocus === false` (any opt-in/explicit mode) | **`"none"`** | Existing Manual/Transfer calculator native soft-keyboard suppression wins |
| Otherwise, explicit `inputMode` supplied (including numeric/decimal/text/none) | **That exact mode** | Existing RN `inputMode` precedence remains |
| Otherwise, `preserveKeyboardType === true` | **`undefined`** | RN uses the existing caller `keyboardType` |
| Otherwise, option omitted/false | **`"decimal"`** | All legacy grouped consumers retain previous default mode |

Installed `package-lock.json` pins **React Native 0.83.6**. Its primary source [`TextInput.js:811–820`](https://github.com/facebook/react-native/blob/v0.83.6/packages/react-native/Libraries/Components/TextInput/TextInput.js#L811-L820) maps `inputMode="numeric"` to `number-pad`, while [`TextInput.js:928–933`](https://github.com/facebook/react-native/blob/v0.83.6/packages/react-native/Libraries/Components/TextInput/TextInput.js#L928-L933) uses `inputMode ? mappedKeyboardType : keyboardType`. Android [`ReactTextInputManager.kt:1134–1138`](https://github.com/facebook/react-native/blob/v0.83.6/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/textinput/ReactTextInputManager.kt#L1134-L1138) defines native `numeric` with both decimal and signed flags. Thus the new explicit **opt-in + omitted mode** restores the **same requested keyboard configuration** as the pre-migration Account `TextField keyboardType="numeric"`. This is source-level prop-equivalence, **NOT native keypad/IME PASS**.

[Add `add-account.tsx:330–345`](https://github.com/Msg22/Monyvi/blob/c6d67355eb3dac81145422c027c87af1c5a4ab89/apps/mobile/app/%28private%29/add-account.tsx#L330-L345) and [Edit `edit-account.tsx:460–476`](https://github.com/Msg22/Monyvi/blob/c6d67355eb3dac81145422c027c87af1c5a4ab89/apps/mobile/app/%28private%29/edit-account.tsx#L460-L476) **remove `inputMode="numeric"`**, preserve `keyboardType="numeric"` and opt in with `preserveKeyboardType`. Add remains unsigned; Edit independently retains `allowNegative`. `value={formData.balance}`, canonical callback → `updateField("balance", text)`, required/error/focus, preview, dirty state, validation and save-time financial conversion remain unchanged. The source change adds no new money grammar/rounding or domain behavior.

**Unmodified consumer inventory inspected at this exact source**: `ManualTransactionEntry.tsx:610–619` and `TransferFields.tsx:244–253` still have `showSoftInputOnFocus={false}` (forward `"none"`); `MetalHoldingForm.tsx:470–485` weight explicitly has `inputMode="decimal"`/`keyboardType="decimal-pad"`; purchase price `GroupedMoneyInput` at 541–551 uses default **decimal** mode. No unchanged consumer opts into the new flag. Recurring-payment fields and TransactionEditModal use separate legacy inputs. No override affects those consumers or their canonical resolver. **AKB-01 is resolved in published source; no new confirmed behavioral blocker found.**

## 4. Ordered pass 3 — style and architecture — CLEAR (static)

The three production deltas change **only** GroupedDecimalInput's optional prop/keyboard-mode resolver and the two Account call-site keyboard props. There is no new NativeWind styling, geometry, labels, localization, mockup asset, account form order, provider/SMS section, BalanceChangedSheet, Delete, shared amount-logic rule, hook/service/schema or financial operation. The option is explicit and default-off rather than a risky global `keyboardType === "numeric"` heuristic. **No style/architecture deviation confirmed in this focused review.** Prior broader source-review findings remain recorded historically but do not constitute new defects here.

## 5. Executed checks, future publication identity, and HOLD

- **Actual root-reported checks on byte-identical production source:** ordinary commit `e87efc215ca43b76d3513187dea75897e980eda3` ESLint/autofix, Prettier and i18n **PASS** (15:21 UTC); prepush privacy **PASS** (15:23:43 UTC), **dbsync SKIPPED**. Root says all production blobs are identical to `c6d67355...`. **Fresh full TypeScript check was PENDING** in this handoff; do not mark it PASS unless root reports the actual result. The reviewer ran **no commands**.
- Root reported local tree `d6e0fc2c4e35b07da99ef40b5977057174cbef41` differs from `c6d67355...` only by **three formatted contracts/handoff documents** and will publish a final tree after TypeScript. Final publishing requires an **identity check** that all production blobs match this reviewed source; **any new code delta requires focused re-review**. Nothing here authorizes background execution.
- **Mohamed's deferrals remain binding:** no new/run unit, Jest, integration, E2E, Maestro, emulator or native testing. **All 35 Accounts manual QA cases remain NOT RUN**; Android/iOS actual minus and decimal keys, vendor IME, cursor, clipboard, RTL, TalkBack and visual/mockup parity are unobserved. No Green or fidelity claims.
- Foundation PR #390 and its independently published triage remain unchanged and outside this Accounts report/PR scope; draft Accounts PR #393 remains separate.

**FINAL RECOMMENDATION: CLEAR the independent source-review AKB-01 block at exact `c6d67355eb3dac81145422c027c87af1c5a4ab89`.** Root retains fresh TypeScript/hook result and final-tree reconciliation/PR readiness decisions; Mohamed retains deferred manual/native acceptance. This does not grant merge authorization or expand other owners' file allowlists. **Review writes HOLD after this report publication.**

---

## Historical AKB-01 source review (superseded by the correction)

**HISTORICAL RECORD:** The former **BLOCKED** result at `f6e2d88...` correctly identified `inputMode="numeric"` overriding `keyboardType="numeric"`. It is no longer a current blocker at `c6d67355...`; the evidence is retained below for traceability. Historical Phase 1 matrix remains 35/35 NOT RUN.

# Historical blocked source review at f6e2d88 (superceded)

**HISTORICAL BLOCKED DISPOSITION (NOW SUPERSEDED): on AKB-01 (HIGH) at `f6e2d88c6134bc823ea3cd833dc10ecfab5f004b`.** Independent TypeScript/React/async source inspection established no new confirmed type/hook blocker. Ordered logic/requirements review **STOPS on a confirmed React Native keyboard-prop mapping regression**; earlier style/architecture clearance is historical and not a final full-review approval. This current disposition **supersedes the earlier `0b780d05...` CLEAR**. It is NOT native keyboard execution, an E2E failure, or an executed unit test.

## F. Final source identity, provenance, and scope

| Item | Exact evidence / status |
| --- | --- |
| Repository / final reviewed commit | `Msg22/Monyvi`; `codex/accounts-form-migration` at **`f6e2d88c6134bc823ea3cd833dc10ecfab5f004b`** |
| Published final tree | **`7abe324d8dbc034de6f317a26aa0cc24b86fa1d9`** — same tree as root-reported actual hooked local `6afd1feae025ee0697f599e401d4b4c675c444be` |
| Previous independent source review | `0b780d05bda5e4d34c8e53e213502eda94316b47`; original four-file source adoption and approved uniqueness amendment |
| Confirmed final delta | `0b780d05..f6e2d88`: two commits ahead, zero behind. Among production, only `add-account.tsx` and `AccountTypeSelector.tsx` changed **import/JSX whitespace formatting**; `edit-account.tsx` and `ReadOnlyDropdown.tsx` have the exact prior blobs. Additional changes are approved/historical formatting and handoff-status docs, not a financial/provider/schema/service/locale/test/Foundation implementation change. Root reports identical emitted-runtime AST for all four production files. |
| Root actual validation | Root reports **PASS**: ESLint/autofix, Prettier and i18n on local `04758`; docs ordinary hooks at `6afd1fe`; full mobile `tsc --noEmit` at 14:51:58 UTC; actual prepush QA_SMS/privacy at 14:52:59 UTC; approved binding package 8/8 integrity. **DB sync explicitly SKIPPED.** These results are root-reported, **not tests run by this reviewer**, and do not prove keyboard behavior. |
| React Native installed version | `apps/mobile/package.json` pins **`react-native: 0.83.6`**; `package-lock.json:18812–18815` pins package `node_modules/react-native` **0.83.6** / `react-native-0.83.6.tgz`. |
| Manual/automated boundaries | Unit/Jest/integration/E2E/Maestro authoring and execution **DEFERRED by Mohamed**; all **35 manual cases NOT RUN** here. Native screenshot, keyboard/IME/caret/RTL and TalkBack are Mohamed-owned and unverified. |

## F.1 AKB-01 — HIGH / BLOCKER: explicit numeric inputMode changes selected keyboard

**Changed Account source at final exact commit:**

- [`add-account.tsx:342–343`](https://github.com/Msg22/Monyvi/blob/f6e2d88c6134bc823ea3cd833dc10ecfab5f004b/apps/mobile/app/%28private%29/add-account.tsx#L342-L343) now passes **both** `keyboardType="numeric"` and **new** `inputMode="numeric"` to the grouped Initial Balance.
- [`edit-account.tsx:473–474`](https://github.com/Msg22/Monyvi/blob/f6e2d88c6134bc823ea3cd833dc10ecfab5f004b/apps/mobile/app/%28private%29/edit-account.tsx#L473-L474) passes the same pair to the grouped signed Edit Balance.
- The pre-migration `b4a656e...` Add (`add-account.tsx:317–328`) and Edit (`edit-account.tsx:459–470`) both passed **only** `keyboardType="numeric"` to ordinary `TextField`, not `inputMode`.
- `GroupedMoneyInput.tsx` delegates all props to `GroupedDecimalInput`; [`GroupedDecimalInput.tsx:67–68,94–117`](https://github.com/Msg22/Monyvi/blob/f6e2d88c6134bc823ea3cd833dc10ecfab5f004b/apps/mobile/components/ui/GroupedDecimalInput.tsx#L67-L117) **defaults `inputMode="decimal"`** and forwards a non-null resolved input mode to the shared `TextField`. Shared [`TextField.tsx:144–150`](https://github.com/Msg22/Monyvi/blob/f6e2d88c6134bc823ea3cd833dc10ecfab5f004b/apps/mobile/components/ui/TextField.tsx#L144-L150) spreads that through to native React Native `TextInput`.

**React Native 0.83.6 PRIMARY SOURCE, verified at published immutable tag `v0.83.6`:**

1. [`TextInput.js:811–820`](https://github.com/react/react-native/blob/v0.83.6/packages/react-native/Libraries/Components/TextInput/TextInput.js#L811-L820) defines `inputMode numeric → keyboardType number-pad`, and `inputMode decimal → keyboardType decimal-pad`.
2. [`TextInput.js:928–933`](https://github.com/react/react-native/blob/v0.83.6/packages/react-native/Libraries/Components/TextInput/TextInput.js#L928-L933) assigns `keyboardType={inputMode ? inputModeToKeyboardTypeMap[inputMode] : keyboardType}`: a truthy `inputMode` therefore **wins** over the explicit `keyboardType="numeric"`. RN's public TextInput documentation confirms that precedence.
3. [Android `ReactTextInputManager.kt:757–766`](https://github.com/react/react-native/blob/v0.83.6/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/textinput/ReactTextInputManager.kt#L757-L766) selects different keyboard native flags for `numeric`, `number-pad`, `decimal-pad`.
4. [Android `ReactTextInputManager.kt:1134–1138`](https://github.com/react/react-native/blob/v0.83.6/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/textinput/ReactTextInputManager.kt#L1134-L1138): `number-pad` = `TYPE_CLASS_NUMBER`; `decimal-pad` = `TYPE_CLASS_NUMBER | TYPE_NUMBER_FLAG_DECIMAL`; `numeric` = **`TYPE_CLASS_NUMBER | TYPE_NUMBER_FLAG_DECIMAL | TYPE_NUMBER_FLAG_SIGNED`**.

**Deterministic behavioral configuration difference:** Current migration routes request **`number-pad`** and therefore no Android decimal or signed input-type flags. The old Account `keyboardType="numeric"` requested **both decimal AND signed flags**, accommodating Add decimals and Edit negative values. This breaks the frozen requirement to preserve the prior Account keyboard behavior and is materially at odds with `spec.md FR-004–007`, `manual-test-plan.md` QA02/03/06–08/31, and the accepted migration plan's unchanged keyboard contract. It is a confirmed **native configuration regression**, not proof that any particular OEM keyboard physically lacks dot/minus, and no native app was executed by this reviewer.

**Critical correction detail:** Merely removing the explicit `inputMode="numeric"` from the routes will **not** restore old behavior. With no mode prop, `GroupedDecimalInput` defaults to `inputMode="decimal"`; RN then chooses `decimal-pad`, which restores the decimal flag but **not** the signed flag. The supported RN inputMode enumeration does not provide a value mapping to `keyboardType="numeric"`. Unsafe casts or fabricated `null`/empty-string modes are not acceptable fixes.

**Minimum source-fix request (MUST be root-authorized due to shared foundation ownership):**
- Remove the newly explicit `inputMode="numeric"` from **both** Account balance routes while keeping their established `keyboardType="numeric"`.
- Ask root to grant a tiny *separate* `GroupedDecimalInput` compatibility adjustment so that when a caller specifies `keyboardType="numeric"` **without an explicit inputMode**, the wrapper forwards `inputMode={undefined}` rather than silently defaulting to `"decimal"`. Preserve current default for other grouped decimal consumers and `showSoftInputOnFocus={false}` → `"none"` native suppression; do not change numeric grammar/rounding or financial policy. A conditional fallback confined to `keyboardType === "numeric"` is a reasonable candidate, subject to root's exact consumer analysis and approved allowlist.
- Root reruns required real static checks/hooks at the corrected immutable source; independent reviewer rechecks the focused published delta. Mohamed remains owner of actual numeric/signed keyboard and IME/manual evidence. **This report author makes no code changes.**

**Severity/stop:** A legitimate source-level regression can pass TypeScript and formatting gates. The previously claimed three-pass CLEAR on `0b780d05` did not inspect exact installed RN keyboard routing and is **withdrawn for final acceptance**. Stop after this valid HIGH logic blocker; style/architecture is not newly accepted.

## F.2 Current ordered-review and validation matrix

| Gate | Current result |
| --- | --- |
| TypeScript / React / async static recheck | No confirmed type/hook regressions in final import/JSX-format-only delta. Root's exact hooked-tree TypeScript/hook checks reported PASS. |
| Logic / business / input behavior | **BLOCKED on AKB-01** (verified native keyboard mapping). No other newly confirmed business/financial issues raised. |
| Style / architecture | Previous source-level review remains historically recorded; per ordered stop rule it is **NOT a final unconditional CLEAR** while logic blocker persists. |
| Services/finance/provider/SMS/locale/tests/foundation | No production changes to those files in this migration/hooked delta. A narrowly authorized foundation compatibility change is needed for the keyboard fix. |
| Jest/unit/integration/E2E/Maestro | Explicitly **DEFERRED**, no post-migration runs claimed. |
| Manual UI/native/RTL/caret/IME/TalkBack/fidelity | **35/35 NOT RUN in this lane; UNKNOWN**, Mohamed-owned. |
| Foundation PR #390 | Separate unchanged foundation `b4a656...`, issue #392 noted by root; no review-branch PR actions. |

**FINAL RECOMMENDATION:** **BLOCK the Accounts migration source review at exact `f6e2d88c6134bc823ea3cd833dc10ecfab5f004b`** until AKB-01 is corrected under root-authorized exclusive source ownership and the corrected immutable revision receives a focused recheck. Existing checks remain valid within their reported scope but do not establish the native keyboard input-type contract. Do not lift Mohamed's test deferral or invent runtime evidence. **Only this one review Markdown file has been edited.**

---

## HISTORICAL Phase 2/Phase 1 audit (conclusions superseded where noted)

**NOTE:** The earlier Phase 2 at `0b780d05...` reported CLEAR based on the four-file source/contract review; that verdict is **superseded** by AKB-01's new pinned RN 0.83.6 finding. Earlier clean TS/finance/style checks remain available for reference, but their CLEAR labels do **not** override the blocker. The prior 35-row manual matrix and YAML accounting still apply as NOT RUN.

## Historical Phase 2 source review (prior conclusion SUPERSEDED)

**PRIOR DISPOSITION (SUPERSEDED by AKB-01): STATIC SOURCE REVIEW CLEAR (no confirmed blockers) for the exact immutable migration source `0b780d05bda5e4d34c8e53e213502eda94316b47`.** All three mandated passes—(1) TypeScript/React/async, (2) logic/requirements and failure paths, (3) style/architecture/static accessibility—were completed against that exact published commit in order. **This is NOT test Green, an executed typecheck, native/visual/accessibility fidelity approval, final hooked tree approval, or release acceptance.** Root-run static hooks and final-tree reconciliation remain pending; Mohamed explicitly deferred Jest/unit/integration/E2E/Maestro and owns manual/native results.

## P2.1 — Exact source and ownership evidence

| Item | Pin or check |
| --- | --- |
| Repository / change base | `Msg22/Monyvi`, `b4a656e66263554a5dc001cee83a1431a3a9110b` |
| **Source examined** | **`0b780d05bda5e4d34c8e53e213502eda94316b47`**, source branch `codex/accounts-form-migration` |
| GitHub commit compare | `b4a656e...0b780d05`: **ahead 2 / behind 0**. Original planning commit plus source commit; **exactly four modified production files**, one approved uniqueness business-doc correction and a new previously accepted migration planning note |
| Changed production paths | `apps/mobile/app/(private)/add-account.tsx`; `apps/mobile/app/(private)/edit-account.tsx`; `apps/mobile/components/add-account/AccountTypeSelector.tsx`; `apps/mobile/components/edit-account/ReadOnlyDropdown.tsx` |
| Approved documentation path | `docs/business/business-decisions.md:267–279`, replacing only old nickname/provider identity wording; `specs/390-accounts-ui-pilot/validation/accounts-migration-plan.md` included as the previously accepted planning artifact |
| Unchanged code dependencies | Shared UI/numeric foundation, provider/SMS components, `BalanceChangedSheet`, `CurrencyPicker`, `AccountPreviewCard`, Account hooks, account services/DB/financial writers, locales, schema, package exports, tests, assets and mockup bindings |
| Scope contract | `specs/390-accounts-ui-pilot/spec.md`, `contracts/{shared-fields,implementation-design}.md`, `manual-test-plan.md`, approved `docs/mockups/accounts-ui-pilot/{design-contract.md,approval-manifest.json}`; governing main `3264eba2b67bcc66cddc95e3fbdb36e8705ee642` |
| Approved reference authority | Eight calibrated references and sidecars; SHA-256 `265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e`. Published approval/integrity is **not** native comparison evidence |
| Review ownership | Only `specs/390-accounts-ui-pilot/validation/accounts-migration-review.md` on separate `codex/accounts-form-migration-review` branch. Source worker and root remain exclusive owners of source/autofix/validation. |

### P2.2 — Ordered pass 1: TypeScript / React / async — **CLEAR by static inspection**

**No confirmed compile, hook-order, lifecycle, stale closure or async-source blocker was established in the four-file delta.** Root owns *actual* TypeScript, ESLint, formatting, i18n and real-hook checks; this reviewer did not execute them.

- **Add**: `add-account.tsx:23–26,53–89,274–344` imports existing published `GroupedMoneyInput` and `FieldLabel/composeFieldAccessibleName`. The local `CurrencySelectField` calls `useTranslation("common")` unconditionally at component top level. Required accessible name and selected text are derived directly from received `value`; its existing `onOpen/onClose/onChange` and `CurrencyPicker` remain intact. `AccountTypeSelector` gets `required`, and Name remains the existing `TextField` with a simple `required` prop.
- **Edit**: `edit-account.tsx:24–26,430–475` imports the existing grouped wrapper and passes `variant="default"`, `allowNegative`, `value={formData.balance}`, `onCanonicalChange(value)`, the prior testID, error, focus and keyboard props. No hook is added or moved across conditional returns; `EditAccountForm` still isolates account-loaded hooks from the loading/not-found returns.
- **Type group**: `AccountTypeSelector.tsx:18–23,42–65` adds a type-safe optional `required?: boolean` default false; uses the existing active-locale `common.required_field` via `composeFieldAccessibleName`; the original radio `onChange(value: AccountType)`, selected/disabled state and mapping are unchanged.
- **Locked control**: `ReadOnlyDropdown.tsx:57–115` changes only visual markup/classes to a shared `FieldLabel`, preserving the existing hook, display value, lock `Pressable` and tooltip state/callbacks.
- **Dependency compatibility**: `GroupedMoneyInput.tsx:8,19–23` delegates its existing `GroupedDecimalInputProps`; `GroupedDecimalInput.tsx:15–44,54–132` already declares `variant`, `allowNegative`, `onCanonicalChange(string)`, `inputMode`, `keyboardType`, `onFocus`; `TextField.tsx` composes required names and passes keyboard/focus/native input props to RN TextInput. No new imports, services or async flow introduced by the migration.

**Manual keyboard evidence boundary:** The new route explicitly supplies `keyboardType="numeric"` and `inputMode="numeric"` (Add `add-account.tsx:328–344`, Edit `edit-account.tsx:460–475`). RN documents `inputMode` precedence over `keyboardType` ([React Native TextInput](https://reactnative.dev/docs/textinput)); the prior Account controls already used `keyboardType="numeric"`. No *native* minus/decimal/IME availability is proven by source inspection. This is **not a confirmed regression**, and the reviewer does not assert one. Mohamed owns actual signed-input and keyboard checks (QA03/06–08/31/33).

### P2.3 — Ordered pass 2: logic, requirements and failure paths — **CLEAR by static inspection**

**No confirmed new logic or financial-semantic blocker was established.** The migration makes presentation-prop and callback changes, without editing business/validation/persistence owners.

| Contract / priority | Exact source evidence | Reviewed outcome |
| --- | --- | --- |
| **Add: required Type/Name/Currency/Initial Balance** | `add-account.tsx:53–89,274–287,307–344` and `AccountTypeSelector.tsx:42–65` | Type group and local Currency trigger use shared required label/name; Name + balance declare `required`. Type is marked once at *group* (not each radio); existing Type remains preselected and horizontally scrollable. Currency's selected value is exposed as text, while its existing picker is retained. |
| **Edit: only Name and Balance required; locked Type/Currency unmarked** | `edit-account.tsx:418–439,460–475`, `ReadOnlyDropdown.tsx:77–115` | Both editable fields declare `required`. Locked display receives no `required` prop/star or editable picker; value, lock button and Tooltip survive. |
| **Canonical grouped input; ungrouped preview** | `add-account.tsx:327–344`; `edit-account.tsx:460–475`; unchanged `GroupedDecimalInput.tsx:85–111`; unchanged `AccountPreviewCard` | Both pass *canonical* `formData.balance` as `value`, and route `onCanonicalChange` directly to existing `updateField("balance",text)`. Recognized text is grouped **only for input display**; preview still receives raw `formData.balance`. Invalid `abc12345` remains raw in the foundation and goes through existing schema validation. |
| **Signed only on Edit, no new precision rule** | Add grouped props omit `allowNegative` (foundation defaults false); Edit explicitly passes `allowNegative` | Existing `account-validation.ts:6–23` remains nonnegative Add/signed Edit; new callbacks introduce no numeric coercion/rounding, fractional cap or changed initial `0` from `useAccountForm`. |
| **Formatting-only pristine Edit and Save** | `useEditAccountForm.ts:455–472`; `edit-account.tsx:271–361`; grouped `syncWhileFocused` in foundation | Dirty state compares ungrouped canonical strings. UI grouping does not call `updateField` on render/focus; unchanged `buildUpdateData` parses canonical string. A grouped display string is not passed to `parseFloat`, so no new form-level numeric meaning change is introduced. |
| **Provider-aware nickname and currency choice** | `docs/business/business-decisions.md:267–279`, `services/edit-account-service.ts:163–181,235–308`, `useAccountForm.ts:105–233` | Documentation now matches existing current-user/currency/trimmed nickname and known/manual/no-provider identity; the service and hooks remain byte-unchanged. Currency search/cancel/manual override and stale-result handling remain existing owners. No Account type dimension added to uniqueness. |
| **Provider/SMS optional metadata** | Unchanged `InstitutionProviderSection`/`SmsMatchingSection`; Add/Edit route condition and callbacks unchanged | Bank/Wallet eligibility, null identities/Other provider, sender chips, Card Last4 sanitizer/reset/optional status are not rewritten by this adoption. |
| **Financial confirmations/default/delete/retry** | `edit-account.tsx:271–361,473–603`, unchanged `BalanceChangedSheet`, `useUpdateAccount`, service | Save still validates canonical balance; unchanged metadata-only path skips sheet; changed balance still presents silent/tracked. Backdrop/Android Back cancellation, guarded writer/adjustment, submission and retry handling, unboxed default toggle and existing Delete path are not edited. No change to financial schema, RPC, sync or service occurs. |

**Failure-path honesty:** Static unchanged ownership does not establish observed zero/one transaction counts, duplicate-tap suppression during native races, asynchronous profile preference delivery, offline relaunch, or the exact public Save/reopen result. These remain existing contracts requiring Mohamed's manual outcomes where applicable; no new failure injection, automatic test or sample data mutation was performed.

### P2.4 — Ordered pass 3: style / architecture / static accessibility consistency — **CLEAR by static inspection**

**No confirmed source-level deviation from the approved four-file adoption scope and registered NativeWind patterns.** Visual and screen-reader fidelity are explicitly **UNKNOWN**.

- **Shared default field surface:** Add and Edit grouped balance now pass `variant="default"` to the existing `TextField` substrate (`rounded-2xl`, `border`, `p-4`), instead of introducing new bespoke money controls. Both Name fields already use the default surface. Source consumes existing `input-label` and required red star semantics; shared error/warning/helper precedence remains unmodified.
- **Add Type and currency:** `AccountTypeSelector.tsx:58–124` preserves the horizontal `ScrollView`, chip height/radius, selection checkmark, leading icons, per-radio `selected` and default Cash choice. The new required `FieldLabel` belongs to the group and the `radiogroup` carries a localized required name, rather than duplicating it on radio choices. Currency keeps existing emoji/chevron, modal/search/cancel and dark surface; new shared label/accessible selected-value contract attaches to the **local** trigger. No new flag icons, currency adapter or picker redesign.
- **Edit locked attributes:** `ReadOnlyDropdown.tsx:77–115` uses approved `input-label mb-2` and `rounded-2xl ... p-4` versus old `rounded-xl py-3.5`. Its muted locked fill/value, lock button, explanation tooltip and disabled-versus-locked distinction are retained at source level. No Edit Type/Currency required marker or new chooser.
- **Composition unchanged:** Preview remains first; Add Type → Name → optional provider → Currency → initial balance → optional SMS; Edit locked Type/Currency → Name → optional provider → Balance → unboxed Default → boxed optional SMS → Danger Zone/Delete below. PageHeader Back/Save, existing `insets.bottom + 160` vertical scrolling, keyboard focus callbacks, balance sheet and optional sections are unaffected.
- **Design bindings:** `01` Add EN, `02` Edit EN, `03/04` AR/dark, `05` validation, `06` existing sheet, `07` compact/enlarged, `08` shared field state are all already approved within package `265cd15f...`. This static pass inspects component hierarchy and token use; it did **not** compare native screenshots/overlays, measure contrast, screenreader focus, RTL caret/IME, safe-area positions or 1.5x text rendering. HTML reference CSS pixels cannot be asserted equal to native dp. Mohamed owns QA30–35.

**Architecture:** no new generic FormField, no service/query in presentation, no finance policy, no reimplementation of existing shared foundation, no unauthorized provider/locale/DB edits. A presentational label and currency trigger are updated where their responsibility already resides.

### P2.5 — Exact-source review result and validation limitations

| Lane | At examined `0b780d05...` | Responsibility and status |
| --- | --- | --- |
| **Independent TS/React/async source review** | **CLEAR (static only)** | Reviewer completed; no confirmed blocker |
| **Independent logic/requirements source review** | **CLEAR (static only)** | Reviewer completed; no confirmed blocker |
| **Independent style/architecture source review** | **CLEAR (static only)** | Reviewer completed; no confirmed blocker |
| Root-owned **actual typecheck, ESLint, formatting, i18n, real ordinary-commit/prepush hooks** | **IN PROGRESS / OUTCOME NOT PROVIDED for final hooked tree** | Root must report command results and final immutable head |
| All new/existing **unit/Jest/integration/E2E/Maestro authoring and execution** | **DEFERRED by Mohamed** | No automated Green asserted; no runs or writes performed |
| **35 manual QA cases / device / native screenshots / RTL/bidi/caret/clipboard/IME / TalkBack/VoiceOver** | **35/35 NOT RUN in this reviewer lane; fidelity UNKNOWN** | Mohamed owns actual results and environment |
| **T008 YAML accounting at base `b4a656...`** | **Verified tracked: `accounts/egyptian-institution-presets.yaml` and `accounts/ui-pilot-foundation.yaml`; pilot create/edit YAML NOT tracked in this source snapshot** | Foundation smoke authored/tracked ≠ executed/integrated Account Create/Edit automation. Earlier pilot Create/Edit YAML was authored on a separate E2E review branch. ALL NOT RUN for migration. |
| **Final hooked source tree** | **NOT PROVIDED YET** | If root's autofix/format/hook commit changes `0b780d05...` production bytes, obtain exact published commit+diff and do a focused independent recheck **before applying this verdict to the final tree**. No self-rebase/merge/fix. |

**Conclusion for precisely `0b780d05bda5e4d34c8e53e213502eda94316b47`:** **No confirmed actionable source-review blocker, three ordered passes CLEAR.** Do **not** upgrade this statement to "migration tests PASS", "native mockup parity PASS", "manual 35 PASS", or "final hooked build PASS". Root is responsible for reconciling any subsequent source modifications and exact tree. Mohamed remains responsible for human native/manual validation. The reviewer has not made changes outside this report.

---

## Preserved Phase 1 contract/35-scenario audit (historical source boundary)

**HISTORICAL PHASE 1 STATUS:** Original contract/coverage report below was prepared against `b4a656e66263554a5dc001cee83a1431a3a9110b` before an implementation SHA existed. Its "Phase 2 NOT STARTED" text is historical and **superseded by the current Phase 2 CLEAR disposition above**. The 35-case `NOT RUN` statuses remain current until Mohamed reports actual results. Markdown code delimiters were repaired in this single owned report as authorized.

# Accounts form migration — independent Phase 1 contract/coverage audit (original)

**CURRENT STATUS: PHASE 1 CONTRACT/QA AUDIT COMPLETE; PHASE 2 SOURCE REVIEW NOT STARTED.** This document reviews the approved adoption boundaries and published pre-migration source **only**. It does **not** approve or reject unpublished migration code. **No unit/integration/Jest/E2E/Maestro/device/manual runs and no native visual or accessibility PASS are claimed.**

## Authority and exact source boundary

| Item | Pinned authority / disposition |
| --- | --- |
| Repository, source read | `Msg22/Monyvi`, foundation #390 OPEN at exact `b4a656e66263554a5dc001cee83a1431a3a9110b` |
| Review branch/write permission | `codex/accounts-form-migration-review`, initially created at that exact SHA; **only** `specs/390-accounts-ui-pilot/validation/accounts-migration-review.md` may be created/updated |
| Source owner | Separate Normal ChatGPT source author on `codex/accounts-form-migration`; **completed migration source SHA pending root handoff**; no other code/test/docs ownership granted here |
| Governance / roles | `AGENTS.md`, `.specify/memory/constitution.md`, `.agent/workflows/{team-led-delivery,sprint-issue,code-review}.md` at governing `3264eba2b67bcc66cddc95e3fbdb36e8705ee642`; `.agents/personas/frontend-developer.md` and independent QA/TypeScript/logic/style role briefs defined in team-led-delivery (no tracked standalone QA persona). Ordered Phase 2 TS/React/async → logic/requirements → style/architecture, stopping on confirmed blockers. |
| Feature authority | `specs/390-accounts-ui-pilot/{spec.md,plan.md,tasks.md,manual-test-plan.md,implementation-ownership.md}`, `contracts/{shared-fields,implementation-design}.md`; user clarification in `spec.md:10–12` states **existing provider-aware uniqueness is correct** |
| Visual authority | **Already-approved** eight calibrated references, `docs/mockups/accounts-ui-pilot/{design-contract.md,approval-manifest.json}`, package SHA-256 `265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e`. Approval ≠ native fidelity |
| Foundation | Existing `TextField`, `Dropdown`, `GroupedDecimalInput`, `GroupedMoneyInput`, shared label/message helpers; foundation independently reviewed and **not in this migration writer's new ownership** |
| Latest human instruction | Migration explicitly approved; **all unit/integration/Jest/E2E/Maestro authoring AND execution deferred**. Mohamed owns manual/native, RTL, IME/caret, TalkBack and visual results. **Root must still perform real static typecheck, lint, formatting, i18n and Git hooks** on the completed migration SHA. Older TDD wording in the copied planning documents is historical and does not authorize new tests here. |

**Evidence classes (do not interchange):** `source-inspected` = relevant source/test assertions exist but no execution in this audit; `authored-not-run` = a YAML/test file exists somewhere but has no migration-run evidence; `missing real-route proof` = mocks/shared-field tests cannot certify the changed Account routes; `manual NOT RUN` = no actual result from Mohamed; `conditional BLOCKED` = only after a human verifies an essential failure/device trigger is unavailable; `static checks pending` = root to execute on exact later SHA. No test/visual/device result is inferred from an approved design.

## Phase 1 — Concrete migration adoption checkpoints (not assertions of new defects)

### ACM-01 · HIGH — Correct requiredness in the Account **owner controls**

**Authority:** `spec.md:92–95`; `design-contract.md:55–68`. Add needs **Account Type, Name, Currency, Initial Balance** marked, even with preselected Type. Edit needs **editable Name and Balance** only. Existing `add-account.tsx:267–285,307–329` renders `AccountTypeSelector`, Name `TextField`, a **local** `CurrencySelectField` and balance `TextField`; `AccountTypeSelector.tsx:49–71` uses horizontal `radiogroup`, with selected radio labels. Do **not** attach repeated required asterisks/phrases to every radio. The local Currency trigger must receive its own required label and accessible meaning of the selected currency; modifying generic `Dropdown` does not automatically cover it. Existing currency `CurrencyPicker` search/select/cancel must remain. Edit `edit-account.tsx:418–470` has locked Type/Currency via `ReadOnlyDropdown`, editable Name/Balance; locked fields **unmarked**, readable, with lock explanation. Provider/SMS/Card Last4 remain optional.

**Owner handoff:** reuse approved existing shared `FieldLabel`/localized required-name mechanism without reauthoring shared foundation or a universal form engine; EN/AR exactly-once requiredness, no default-required duplicate hint, genuine selected value and no unintended new copy.

### ACM-02 · HIGH — Canonical balance input and raw preview, not formatted form state

**Authority:** `spec.md:95–98`, `contracts/implementation-design.md:20–31`, `design-contract.md:70–74`. Current `add-account.tsx:316–328` and `edit-account.tsx:458–470` bind a `TextField` value/onChangeText to `formData.balance` with testID `initial-balance-input`. Existing Edit dirty state is **string equality** of `formData.balance` to original `String(account.balance)` (`useEditAccountForm.ts:455–472`). Existing Edit `buildUpdateData` calls `parseFloat(formData.balance)` (`edit-account.tsx:271–287`); existing Add and Edit Zod balance grammars accept **canonical dot-decimal, no grouping** (`validation/account-validation.ts:6–23,73–89,169–180`).

**Required adoption:** both routes should use the published thin `GroupedMoneyInput` **`variant="default"`**, pass `value={formData.balance}` and **`onCanonicalChange`** to `updateField("balance", next)`. Add is unsigned (default), starts `"0"`; Edit opts into `allowNegative`. Keep the existing `testID`, `error`, field focus/keyboard handling and direct preview input. `12345.678` becomes visible input `12,345.678` but **preview remains `12345.678`** and the form state remains `12345.678`. Edit `-1234.567` displays `-1,234.567` but remains canonical `-1234.567`. Malformed `abc12345` stays byte-for-byte raw, rejected by existing form schema; preserve existing arbitrary decimal length/trailing zeros and save conversion. No parse/round/strip formatter in screen logic.

**Concrete failure risk:** If a grouped display string enters `formData.balance`, `parseFloat("12,345.678")` would misinterpret it, validation fails or Edit becomes dirty solely from grouping. A focus/blur without a real numeric edit must **not** enable header Save, open the sheet or create financial effects. This is a migration review gate, **not** a defect in code not yet received.

### ACM-03 · HIGH — Provider-aware uniqueness and currency-selection race are **existing correct** rules

**Authority:** `spec.md:10–12,99–101`, `manual-test-plan.md:29–33`. Current `services/edit-account-service.ts:163–181,235–308`: uniqueness per **current user, currency, trimmed/case-folded nickname, provider identity**, with known `institutionId` precedence, otherwise whitespace-normalized manual `providerDisplayName`, otherwise no-provider identity; Edit excludes its own ID and deleted rows are ignored. `useAccountForm.ts:105–208,213–233,238–366` preserves current request cancellation/stale response checks, provider/type switches and a manual currency override against later profile preference loading; `useEditAccountForm.ts:219–343` holds Edit provider identity and pending Save.

**Preserve** equivalent manual provider conflicts, different manual provider allowance, known provider identity collisions, null/no-provider grouping, provider/type/currency reset eligibility, existing nonblocking uniqueness-query failure, the manual touched-currency rule, Current-user isolation and zero network dependency. Do not replace null IDs with empty strings or introduce a global nickname ban. **Only stale business documentation** may be corrected by its explicitly authorized writer; no provider business-rule or service edits by the migration worker.

### ACM-04 · HIGH — Silent/tracked financial effects, dismissal, default status and Save guards

Current `edit-account.tsx:293–361` compares parsed original/new balance; metadata-only Save calls `performUpdate` directly, changed balances open the existing `BalanceChangedSheet`. `BalanceChangedSheet.tsx:110–146,250–339`: **silent initially selected**, tracked is alternate, Confirm, backdrop/Android Back cancel. `useUpdateAccount.ts:82–155` and `services/edit-account-service.ts:370–680` own guarded balance commands and optional atomic adjustment; `useCreateAccount.ts:35–95` owns in-flight duplicate protection.

**Preserve exact public semantics:** metadata-only Save does not open a sheet; silent changed balance updates account with **zero** adjustment transactions; tracked changed balance produces **exactly one** history adjustment; backdrop/Android Back cancels commit and preserves unsaved form; failed Save retains correct feedback/ability to retry; rapid taps do not duplicate writes. Do not change service, schema, DB, financial precision policy, Delete, new Cancel gesture, or command identity as part of styling. Header Save stays in `PageHeader`.

### ACM-05 · MEDIUM/HIGH — Approved lock/default/optional layout without a redesign

At baseline `ReadOnlyDropdown.tsx:76–116` shows locked attribute radius12/old label with actionable tooltip; approved replacement geometry is radius16/default label **but still locked with its explanation**, not an ordinary disabled chooser. `AccountTypeSelector.tsx:49–116` must stay horizontally scrollable with intentionally partial next chip at compact widths. `CurrencySelectField` remains the local existing `CurrencyPicker` integration, with same supported currencies/search/cancel. `SmsMatchingSection.tsx:63–136` remains a **boxed optional Bank/Wallet section**; Cash hides provider/SMS; card digit input sanitizer at `add-account.tsx:344–347` / `edit-account.tsx:536–539` stays digits-only/max4. Edit's Default Account is **unboxed** (`edit-account.tsx:473–521`) and Danger Zone/Delete **continues below SMS** (`:543–568`).

Preserve baseline ordering: Add preview → horizontal Type → Name → conditional provider → Currency → Initial Balance → optional boxed SMS; Edit preview → locked Type → locked Currency → Name → conditional provider → Balance → unboxed Default → optional boxed SMS → Delete. Keep native ref/onFocus scroll/inset handling, unchanged preview and PageHeader Back/Save. Native sign keyboard, bottom inset, RTL and actual font/contrast cannot be claimed from JS source alone. Do not invent new CurrencyField adapter/flag glyph pack, warning threshold, drag-to-dismiss, extra footer Save or new dirty-exit confirmation.

### ACM-06 · Evidence limitations / no authorization for new automation

- **Existing SOURCE-INSPECTED automated test files:** `__tests__/validation/account-validation.test.ts` (Add negative, Edit signed, malformed/grouping, optional IDs); `__tests__/hooks/{useAccountForm,useEditAccountForm}.test.ts` (zero default, provider reset, debounce, stale identity, Save pending); shared `__tests__/components/ui/{TextField,Dropdown,GroupedDecimalInput,GroupedMoneyInput.keyboard}.test.tsx` and `packages/logic/src/utils/__tests__/amount-helpers.test.ts` (shared semantics). These assertions have **not** been executed for this Accounts migration.
- **Existing route tests are mocked at the changed UI boundary:** `__tests__/app/add-account-institution-info.test.tsx:94–128` and `edit-account-institution-info.test.tsx:143–183` mock the shared `TextField`, `PageHeader` and other controls and cover provider info/collapsed SMS. They **cannot prove real grouped/required/locked UI**.
- Existing `apps/mobile/e2e/maestro/accounts/egyptian-institution-presets.yaml` is **AUTHORED, not a verified run**. At this immutable base, `apps/mobile/e2e/maestro/accounts/ui-pilot-foundation.yaml` **is tracked** beside `egyptian-institution-presets.yaml`; `ui-pilot-create.yaml` and `ui-pilot-edit.yaml` **are not tracked at this base** (authored separately on an E2E review branch). None of these flows was executed for this migration. New Account route integration automation is missing as executed evidence; all new authoring and all runs are **explicitly DEFERRED** by Mohamed. Do not commission new tests to fill this gap.
- Root-owned actual TypeScript checks, ordinary ESLint/Prettier/i18n and Git hooks on the eventual migration SHA are **REQUIRED/PENDING**, not covered by the unit/E2E deferral. No such checks were run by this reviewer.
- Approved HTML/PNG references and source class names do not establish native visual parity, safe-area/clipping, RTL/bidi/caret/IME, TalkBack/VoiceOver or actual spoken focus restoration. Mohamed owns manual/native evidence.

## Complete 35-case manual disposition matrix

**Every case remains `NOT RUN` for this migration at this Phase 1 checkpoint.** The older `manual-test-plan.md:47–83` maps case IDs to source evidence but has no actual results; source-inspected and authored test artifacts are **not** PASS. The manual owner must record build/SHA, device/locale/theme/font/insets, action/outcome, and remaining obstacle. Controlled error triggers cannot be invented.

| ID | Acceptance to validate through public UI | Preexisting source evidence and boundary | Status |
| --- | --- | --- | --- |
| 01 | Grouped Add/Edit input vs **ungrouped preview**, Save/reopen | Shared numeric tests; Account route linkage unverified | NOT RUN — Mohamed |
| 02 | Decimal length/trailing zeros, conversion unchanged | Schema and numeric source partial | NOT RUN — Mohamed |
| 03 | Edit negative, lone minus, grouped signed correction | Signed shared tests; native minus/clipboard not evidenced | NOT RUN — Mohamed |
| 04 | Add starts zero, accepts zero, rejects negative raw | Form hook and schema source | NOT RUN — Mohamed |
| 05 | Malformed letters/dots/comma groups exact raw then correction | Shared tests; real native paste distinct | NOT RUN — Mohamed |
| 06 | Fast typing and delayed parent updates preserve digits | TextField/GroupedDecimal test source | NOT RUN — Mohamed |
| 07 | Mid-string replacement, selection, comma deletion | No native caret evidence; human input boundary | NOT RUN — Mohamed |
| 08 | Clear, trailing dot, intermediate `-`, blur/refocus | Input and schema source partial | NOT RUN — Mohamed |
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

1. **TypeScript/React/async:** imports, props/`onCanonicalChange`, hook call ownership, unchanged focus scroll/keyboard refs, stale uniqueness callback behavior and local state. Root executes typecheck/lint/i18n/hooks; this reviewer does not claim them.
2. **Logic/financial/failure paths:** inspect all ACM-01–04 requirements against exact changed lines. If form state holds grouped strings, `parseFloat` consumes grouping, uniqueness is redefined, command route alters silent/tracked effects, or provider/SMS/delete changes unintentionally, give precise blocker and minimal S1/source-owner correction, then STOP and recheck later.
3. **Style/architecture/static accessibility:** only if TS/logic clear. Inspect required group/currency local trigger and locked fields, existing design geometry/order/sections/Default/Delete, native safe-area source and approved NativeWind use. Human-only fidelity and spoken semantics are **NOT VERIFIED** by source.
4. **Evidence honesty:** no implied Green from unchanged shared test files or authored YAML; unit/E2E deferred, root static checks still required, Mohamed owns 35 manual cases.

**Priority for Mohamed's manual sampling** (not a reduction of 35): QA01/03–05/09/10 (format/value/required), QA14–17 (currency/provider), QA23–26 (financial meaning), then QA30–35 (device/RTL/accessibility). Record each case separately.

**Recommendation:** Authorized migration can continue with exclusive source ownership; **no source-level migration approval is issued until Phase 2**. Keep existing correctness boundaries; no new mockups, test suites, financial/provider rules, schema/service changes or global field redesign. This reviewer stops all other writes after this report.
