# Implementation Design Contracts: Accounts UI Pilot

Planning proposal for canonical task refinement after root review. No production API has been changed.

**Visual authority**: Approved eight-image package sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e.
**Source authority**: Main3264eba2b67bcc66cddc95e3fbdb36e8705ee642; current pendingPR3830e7ee55abf6fb18af37e29e4f2e48ba45604a31e. See research.md for exact file blobs.

## Specialized component contracts

| Component | Planned compatibility contract |
| --- | --- |
| TextField | Keep TextInput props, event types, ref, adornments and focus-local draft; share visible label and localized required-name composition; retain default/outlined variants |
| GroupedDecimalInput | Keep onCanonicalChange and all pending PR forwarding; add variant defaulting to outlined; add explicit signed option defaulting false; share valid-display/raw-invalid decision without input rounding |
| GroupedMoneyInput | Continue delegation; same compatible numeric capabilities, explicit default variant for Accounts |
| Dropdown | Retain current pending PR null selection/error/adornment contract and generic onChange(T); no reimplementation or absent-ID empty string |
| Currency presentation adapter | Render given CurrencyType and callbacks through shared label/surface, reuse CurrencyPicker; never fetch preference or database; create only if repeated responsibilities justify adapter |
| AccountTypeSelector | Existing horizontal radio composition; shared required group label/name exactly once; no replacement control |
| ReadOnlyDropdown | Approved default-compatible geometry/label with muted locked presentation; unmarked requiredness, unchanged actionable lock explanation |

Exact prop names (proposed variant and allowNegative) require one foundation owner's published API before Account work. A numeric option changes entry presentation grammar only, not Account schema or financial validation. Existing unsigned consumers retain signed rejection/correction semantics and outlined visuals; weight precision and ordinary keypad behavior are regression dependencies.

## Numeric resolution and display

1. Classify raw text against the selected existing unsigned or explicitly signed entry grammar before formatting. Valid/intermediate accepted numeric text may be grouped without precision loss; malformed text is displayed verbatim.
2. Resolve only known-good grouping and supported editing changes to canonical dot-decimal state. Preserve invalid pasted text for existing inline validation rather than sanitizing it.
3. Signed Edit coverage includes minus alone, negative grouped paste, sign insertion/removal, grouped comma deletion, mid-string replacement, selection and correction to valid input.
4. Preserve arbitrary accepted decimal length, trailing zeros and completeness validation. No Number/parseFloat/save conversion inside this presentation extension.
5. Ordinary TextField drafts stay focus-local; numeric opt-in synchronization must not lose rapid typing or transient invalid text after controlled rerenders/blur.
6. Canonical12345.678 → input12,345.678; preview12345.678. Invalidabc12345 → inputabc12345. Formatting-only Edit remains pristine.

Minimum helper extension belongs in packages/logic and accepts plain strings/options. Do not globally change parser semantics or introduce runtime database imports. Write failing compatibility tests against actual consumers before choosing the final algorithm; a source-inspected risk is not evidence of a reproduced native caret defect.

## Label, feedback and accessible naming

Requiredness comes from existing editable form rules. Compose localized accessible name exactly once, including explicit override names; avoid duplicating the same required announcement in hint and name. Type is required once at the group, not on every radio. Optional fields and locked Edit Type/Currency remain unmarked.

Approved message order is error > warning > helper. Necessary correction instructions remain discoverable. Error remains visible while focused; focus uses existing border without new ring. Warning is presentation-only and never adds a financial threshold or blocks Save.

Use one small shared FieldLabel/name helper and FieldMessage where actual repeated consumers support extraction. No universal conditional form interface. Localized user text uses existing i18n conventions; any new catalogue/export/style change goes to the reserved integration owner.

## Layout and behavior

Retain PageHeader Back arrow/header Save, current preview placement/formatter, horizontal Type scroller, form scrolling, unboxed Default row, boxed SMS and existing Delete section below SMS. Keep supported currencies and picker lifecycle.

Balance sheet retains existing silent/tracked choices, initially silent, Confirm, backdrop/Android Back cancellation and current transition. No new Cancel button, drag gesture, dirty-leave prompt or financial warning.

Apply approved registered tokens and shared NativeWind compounds; respect interactive opacity/shadow exceptions. Use constants/ui.ts responsiveness; ordinary row composition remains until measured width/font scale requires reflow. Any touched bottom action gets explicit nonzero-inset coverage.

## Native calibration and fidelity boundary

The approved reference uses exact CSS-to-PNG pixels, browser Arial/Arabic fallback and SVG currency stand-ins; app font and platform glyph behavior stay unchanged. Capture actual native viewport/density/font scale/insets before comparison. Native BlurView, caret/IME/bidi, transitions and screen-reader modal focus are not established by the reference.

Tablet/landscape must produce measured rendered evidence, not copied guessed coordinates. Material mismatch outside approved logical geometry returns to root/Mohamed before altering product design. Design approval does not permit inventing unknown fidelity facts.

## Handoff acceptance

Foundation publishes exact compatible API and Green regressions before Account adoption. Adopted routes then pass real-control integration and complete controllable Maestro journeys. Mandatory35-case coverage remains linked; native/manual gaps are explicit. Reverify eight immutable sidecars at use time; report functional, visual, accessibility and CI results independently.

## AKB-01 — Account numeric keypad compatibility (approved technical correction)

The previous Account balances used native `TextField keyboardType="numeric"` with no inputMode. At React Native `0.83.6`, truthy `inputMode` overrides keyboardType: `"numeric"` selects Android `number-pad` (no signed/decimal flags); the grouped field's implicit `"decimal"` selects `decimal-pad` (decimal but not signed). Neither reproduces native `keyboardType="numeric"` flags.

**Minimum default-safe API:** `GroupedDecimalInputProps.preserveKeyboardType?: boolean` defaults to **false**. After existing `showSoftInputOnFocus === false → "none"` suppression, an explicitly supplied inputMode always takes precedence; when the new opt-in is **true** and inputMode is **omitted**, forward `inputMode={undefined}` and let RN use the retained `keyboardType`. Otherwise keep existing grouped default `inputMode="decimal"`. `GroupedMoneyInput` passes the option through unchanged. Both Account routes now use `keyboardType="numeric" preserveKeyboardType` with **no explicit inputMode**. Add stays unsigned, Edit signed via its independent `allowNegative` opt-in.

**Scope and consumers:** Only Add/Edit opt in. ManualTransactionEntry and TransferFields retain calculator keyboard suppression; MetalHoldingForm weight retains explicit `decimal`, purchase-price retains grouped `decimal` default. All other unchanged grouped consumers remain on the default-false path; RecurringPaymentFormFields and TransactionEditModal use their own inputs. No numeric grammar, validation, precision, formatting, dirty detection, save-time conversion or finance behavior changes.

**Evidence/limits:** Source correction `67616c2f080541c1ae922d24e0ed987d8f9a7aeb` on `codex/accounts-form-migration`; independent AKB-01 report `3cf399f35cedb0ff63b5e2065605ed6495f02674`. RN 0.83.6 mapping is primary-source/configuration evidence; it is **not** a native keyboard PASS. Root's earlier hook/typecheck PASS applied to pre-fix `f6e2d88...`, so the corrected head needs fresh real static checks and focused M1 re-review. Mohamed's deferred unit/E2E and manual-native testing policy remains in force; 35 Account QA cases NOT RUN in this lane.
