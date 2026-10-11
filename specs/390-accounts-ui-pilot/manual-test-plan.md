# Accounts pilot — manual test plan and coverage disposition

**Current status (2026-10-11):** Accounts migration source authored at `0b780d05bda5e4d34c8e53e213502eda94316b47` on `codex/accounts-form-migration` after explicit Mohamed authorization and root SOURCE GO. Unit/integration/E2E authoring/runs remain **DEFERRED** at Mohamed's direction and manual verification is his responsibility. **ALL 35 cases NOT RUN**; no functional, native, visual or accessibility PASS is inferred from source publication.
**Sources**: Governing main `3264eba2b67bcc66cddc95e3fbdb36e8705ee642`, Foundation PR #390 base `b4a656e66263554a5dc001cee83a1431a3a9110b`, Accounts migration source `0b780d05bda5e4d34c8e53e213502eda94316b47`. Historical PR #383/d457 references in earlier planning are not current source acceptance evidence.
**Requirements**: [spec.md](spec.md). This map carries the coordinator's corrected 35 scenarios without promoting source inspection to passed tests.
**Visual approval**: Eight calibrated references and bindings approved on 2026-10-11, package sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e; all eight canonical bindings passed integrity verification. Design approval does not change any NOT RUN execution status.

## Setup and evidence rules

- Use authenticated test user with scoped local seed data: Cash, Bank and Digital Wallet; one known provider, Other provider, same/different provider nicknames, and Edit account with positive balance. Do not use real private financial records.
- Establish current app build, exact Git revision, platform/emulator, locale, theme, viewport, orientation, font scale, safe-area/navigation mode and network state before each run.
- For save assertions, reopen account and inspect user-visible Account/History result; instrument service/DB behavior only in deterministic integration tests where needed.
- For failures, stale queries or submission races, first verify a controlled harness exists. Do not claim a user journey that cannot reproduce its trigger.
- For offline create/edit/relaunch, use verified emulator network control and persistent seeded local data. Network-off does not justify querying cloud or bypassing current-user scope.
- Discover existing tests across repository before adding new suites. Existing evidence below is limited to inspected artifacts and must be resolved to actual test IDs/results during canonical task planning.
- Every case requires recorded result, screenshot/log where relevant and associated actual test ID or explicit manual/harness boundary. Current result for ALL 35 cases is NOT RUN.
- **Current authorization override:** The earlier tests-first planning prerequisite was superseded for this bounded Accounts implementation by Mohamed's express instruction to defer unit/integration/E2E authoring and runs. These checks remain **NOT RUN**, not PASS, and this matrix still governs his later manual acceptance. No scenarios or evidence rows have been removed or marked complete.

## Concrete balance and identity fixtures

| Class | Fixtures / expected existing behavior |
| --- | --- |
| Grouped display | Canonical 12345.678 displays as 12,345.678 in the editable input; existing preview remains 12345.678. Also enter 1234.50 and 1234567.8900; preserve canonical precision/trailing text during entry; saved result follows existing save conversion |
| Add valid | 0, 10, 1234.50, arbitrary existing-valid fractional length such as 1.123456; no new currency precision rejection |
| Edit valid | 0, -10, -1234.50, -1.123456; signed grammar and existing save conversion retained |
| Intermediate | Empty, -, 12.; keep editable and use existing completeness/validation timing |
| Invalid | abc, abc12345, 1..2, 12,34, 1,23,456, mixed sign/letters; retain raw verbatim through display and callbacks (abc12345 never becomes abc12,345), block invalid submission, correct to valid and recover |
| Grouped input | 1,234.50 / -1,234.50; accepted grouping becomes canonical when supported; signed migration must be proved, not assumed |
| Name | UI: whitespace-only then correction, valid trimmed name and 50-character boundary; preserve input maxLength 50. A 51-character payload is schema-only validation evidence, not a claim that the native input accepts it |
| Uniqueness | Same user/currency/nickname with manual Provider A versus Provider B is allowed; Provider A versus spaced/case-varied PROVIDER A conflicts. Same known identity conflicts regardless of display label; missing providers share one identity. Different currency/user is independent; current account excluded on Edit |
| Optional details | null institution, Other provider; empty optional metadata; UI: invalid three-digit card text then correction to four digits, preserving the existing digits-only four-character sanitizer. Five-character card payload is schema-only evidence; sender aliases retain existing validation |

These are test fixtures, not a new grammar. Leading zero, grouping/sign and save-conversion expectations must be checked against existing contracts; do not make a permissive parser or silently repair malformed values to satisfy a fixture.

## Corrected 35-case coverage matrix

Existing evidence codes:
- V: inspected account-validation.test.ts schema assertions.
- N: inspected GroupedDecimalInput.test.tsx and amount-helpers.test.ts numeric assertions.
- T: inspected TextField.test.tsx component assertions.
- H: inspected useAccountForm.test.ts/useEditAccountForm.test.ts hook assertions.
- I: inspected add/edit-account-institution-info.test.tsx, with mocked-control limitations.
- M: inspected Maestro accounts/egyptian-institution-presets.yaml.
- P: PR #383 component tests at its pinned head.
- “Gap” means not established by these inspected artifacts, not a repository-wide absence.

| Case | Existing source evidence | Proposed deterministic / screen automation | Proposed user journey or device boundary | Requirement links |
| --- | --- | --- | --- | --- |
| 01. Grouped display, ungrouped canonical balance | N | Real Add/Edit integration; assert grouped input, unchanged raw preview and canonical value separately | Create custom grouped balance, reopen Edit | FR-004, FR-006 |
| 02. Existing decimal length and trailing zeros | V/N partial | Preserve Account-accepted precision, no input rounding | Enter/reopen supported precision cases; preserve existing save conversion | FR-004, FR-006 |
| 03. Signed Edit including minus intermediate and grouped paste | V only for schema acceptance | Numeric + real Edit integration; opt-in signed contract only if needed | Edit positive/negative balance and confirm each approved choice | FR-004, FR-005, FR-006, FR-007 |
| 04. Add zero/nonnegative and invalid negative submission | V/H | Real Add error/Save state, preserve raw negative text | Zero creation succeeds; negative balance shows existing inline error | FR-003, FR-005, FR-006 |
| 05. Malformed letters/multiple dots/bad grouping | V/N | Input/callback retain abc12345 verbatim without embedded grouping; invalid submission blocked, correction recovers | Paste only with verified native clipboard capability; otherwise driver input plus explicit paste device check | FR-005, FR-006 |
| 06. Rapid typing and external parent updates | N/T | Controlled rerender regressions without dropped digits | Native keyboard/device replay; inputText alone insufficient for IME proof | FR-007 |
| 07. Mid-string edits, selection replacement and deleting commas | Gap | Shared resolution/selection behavior where controllable | Emulator/native caret observation, physical IME sampling | FR-004, FR-007 |
| 08. Clear field, decimal intermediates, blur/refocus | N/T partial | Preserve intermediate text and current validation timing | Clear/correct/refocus balance while keyboard open | FR-005, FR-007 |
| 09. Formatting-only pristine Edit | H partial | Real grouped display does not dirty canonical state | Open Edit, focus/blur, Save stays pristine | FR-004 |
| 10. Visible required name/balance/currency/type | T required prop only | Actual labels/required props; Type group required once, not every radio; optional fields unmarked | Inspect required fields in Add/Edit mockup-approved semantics | FR-002, FR-003 |
| 11. Localized required names, explicit label overrides | Gap; T hints are insufficient | Requiredness exactly once in EN/AR and override cases | TalkBack/VoiceOver actual announcements | FR-002, FR-018 |
| 12. Error/warning/helper precedence and focused error | T errors partial | Approved message contract; error survives focus, warnings do not invalidate | Screen reader error discovery plus approved rendered states | FR-014, FR-018 |
| 13. Editable/disabled/read-only behavior | T/P partial | Disabled input suppression, locked values stable, tooltip usable | Edit locked Type/Currency remains unchanged | FR-011, FR-018 |
| 14. Preferred currency and manual override | H | Late preference result doesn't replace touched selection | Add selection/cancel/search/reopen, supported currencies retained | FR-008 |
| 15. Optional provider/SMS sections and type change reset | I/M partial | Real controls, existing reset rules, toggle preserves existing data rules | Bank/Wallet/Cash switching and optional details | FR-009 |
| 16. Null institution IDs/Other provider | V/M partial | null preserved, empty ID invalid, correct provider option state | Cash and Other-provider save | FR-009 |
| 17. Uniqueness debounce/stale answers/provider identity | H/V partial | Currency/name/provider/type changes ignore stale local results; explicit known/manual/no-provider identity fixtures | Same nickname/currency with different manual providers succeeds; normalized same manual or known identity rejected; Edit excludes current account | FR-010 |
| 18. Local uniqueness query failure/recovery | Gap | Preserve existing nonblocking failure behavior, no network assumption | Deterministic local failure only through supported test harness | FR-010 |
| 19. Name limits/whitespace and field correction | V | Schema 51-character rejection separate from real Name maxLength 50 and whitespace correction | Whitespace-only name, correction and save; 50-character UI boundary without impossible 51-character entry | FR-005, FR-012 |
| 20. Optional sender aliases/card last four errors | V/I partial | Current optional validation; five-character card schema fixture separate from UI four-digit sanitizer; clean reset/unmount | Expand, enter three-digit card error, correct to four digits and save; preserve digits-only filtering | FR-009 |
| 21. Save disabled/loading/submission failure/retry | Gap at real-screen layer | Public Save state, failure feedback, form retained, retry | Successful create; deterministic failure journey only if harness exists | FR-012 |
| 22. Repeated Save/Confirm taps | Gap | Existing submission guard prevents extra command calls | Rapid taps; verify one resulting user-visible record where controllable | FR-012 |
| 23. Balance sheet silent choice | Gap in inspected suites | Sheet selection and route command integration | Balance changed without new adjustment transaction | FR-013 |
| 24. Balance sheet tracked choice | Gap in inspected suites | Route/service integration preserving existing atomic command | Changed balance and one visible adjustment transaction | FR-013 |
| 25. Balance sheet cancel/backdrop/Android Back | Gap in inspected suites | onCancel/BackHandler and form retention | Maestro Back on emulator, no persistence after cancellation | FR-013 |
| 26. Balance update failure, retry and metadata-only save | Gap | Existing failure feedback; edits retained; retry doesn't duplicate | Harness-supported failure/retry; pristine balance saves metadata without unnecessary sheet | FR-012, FR-013 |
| 27. Navigate back/not-found/loading | Source behavior; no dirty prompt proved | Preserve current routing and safe loading/not-found states | Back and missing-ID route when authenticated harness supports it | FR-019 |
| 28. Offline create/edit and local persistence after relaunch | Source local service design | Real local DB integration, scoped reads/writes | Emulator network control + restart if supported; record harness gaps | FR-015 |
| 29. Default-account toggle regression | H partial | Existing default dirty/update semantics | Existing toggle behavior retained; no new auto-promotion rule | FR-015 |
| 30. Scroll bottom clearance and touched sheet bottom actions | Source insets | Nonzero inset included in correct surface's layout contract | Gesture/3-button navigation; header Save assessed separately | FR-017 |
| 31. Keyboard opening, focus next, error correction, scrolling | Source behavior | Deterministic focus/scroll calculations where feasible | Emulator keyboard baseline; physical keyboard/IME variants supplemental | FR-007, FR-017 |
| 32. Light/dark surfaces and contrast | Source/classes only | State token consistency; compute/measure contrast | Rendered screenshot comparison, no pass from classes alone | FR-001, FR-016 |
| 33. English/Arabic RTL and mixed-direction signed numbers | T/P partial | Labels/names/messages/localized required semantics | Rendered RTL controls, minus/currency placement, screen readers | FR-002, FR-016, FR-018 |
| 34. Compact/ordinary/tablet/orientation/enlarged text | Constants; no rendered proof | Focused shared breakpoint contract tests | Emulator screenshots and interaction; readable controls without clipping | FR-016, FR-017 |
| 35. Screen-reader order and modal focus restoration | Gap | Accessible props/state assertions | TalkBack/VoiceOver complete navigation, modal open/close and return focus | FR-018 |

## Reproducible journey groups

1. **Create (01–08, 10–12, 14–22)**: Open Add, inspect baseline labels/zero/default type, enter name and grouped balance, select supported currency/provider, exercise optional fields, correct invalid required/optional values, save, reopen. Repeat with Cash/Bank/Wallet and zero. On failure retain fields, retry; rapid Save should create one visible record.
2. **Edit (01–13, 19–27, 29)**: Open seeded Edit, inspect locked attributes/explanation, focus/blur without edits, verify pristine state, modify metadata only, then change balance. Test silent and tracked choices independently, each with positive and negative results. Dismiss via backdrop and Android Back; no persistence and entered form remains. Repeated Confirm and harness-supported retry must not duplicate effects.
3. **Provider/name lifecycle (14–20)**: Switch type/provider/currency while debounce is pending; verify stale local answers cannot overwrite current feedback. Exercise same provider duplicate, eligible Other provider and null identity. Force local query failure only through a supported controlled harness; preserve current nonblocking failure behavior.
4. **Offline persistence (28–29)**: Disable connectivity on supported emulator, create and edit valid account, reopen, restart app and reopen again; verify local outcome and default status. Do not wait for cloud sync or expose foreign user rows.
5. **Presentation/accessibility (10–13, 30–35)**: Compare actual rendered states against approved immutable mockup revision in EN/AR, light/dark, compact/ordinary/tablet/landscape/enlarged text. Open keyboard and scroll to correct field errors. Check bottom sheet actions above nonzero system inset, independently from header Save. Navigate with actual TalkBack/VoiceOver, open/dismiss sheet and confirm focus return.

Each group's result is NOT RUN. Matrix cases remain individually reportable even when one journey exercises several.

## Automation versus native boundaries

- Deterministic input resolution, validation, controlled rerenders, stale-result suppression, command counts, dirty state and props/state semantics belong in focused unit/integration tests.
- Complete create/edit/balance-choice journeys, Android Back, offline restart and ordinary keyboard/responsive checks can be automated when emulator/harness controls exist; verify capability before marking manual-only.
- Actual native clipboard paste requires runner clipboard/paste capability. Driver inputText demonstrates entered text only.
- Native caret/selection/IME variations need appropriate emulator observations and supplemental physical-device samples.
- Required accessibility labels/hints/state assertions do not prove actual spoken names/order, modal focus behavior or screen-reader usability. TalkBack/VoiceOver evidence remains explicit.
- Class assertions do not prove contrast, clipping, direction or fidelity. Measure contrast and compare rendered screenshots/token pairs.
- Generated mockups are references, not app screenshots or execution evidence. Record visual completion separately from functional tests/CI.

## Handoff record template

For every case record: case ID; exact build/revision; requirement; fixture/actions; expected public outcome; actual result; actual unit/integration/E2E test identifiers; rendered/device evidence; remaining blocker or manual boundary; reviewer. Use PASS/FAIL/BLOCKED/NOT RUN honestly. No results have been filled in this stage.
