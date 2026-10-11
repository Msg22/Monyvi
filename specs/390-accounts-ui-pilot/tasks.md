# Tasks: Accounts UI Pilot

**Input**: spec.md, plan.md, research.md, data-model.md, contracts/ and approved
mockup manifest. **Current handoff (2026-10-11):** Accounts Add/Edit migration
was separately human-authorized, root SOURCE GO at
`488731442edfcaca96e680cbaf61d993805ce18c`, and S1 has authored the **source
portions** of T017 (Add/Type) and T023 (Edit/locked) at
`0b780d05bda5e4d34c8e53e213502eda94316b47` on `codex/accounts-form-migration`;
business-only uniqueness documentation aligned in the same commit. **Task
checkboxes and existing coverage/acceptance requirements remain unchanged**
because root static checks and independent review are pending, and Mohamed
deferred unit/integration/E2E execution. This does not declare full T017/T023
acceptance or any validation PASS. All 35 Accounts QA scenarios remain **NOT
RUN**. Older Foundation-first and test-first prerequisites below are historical
and overridden _for this explicitly authorized source delivery only_. **Visual
authority**:
sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e.
**Tests**: Mandatory strict TDD overrides template optional-test guidance.
Author and run meaningful unit/integration and controllable full-journey E2E Red
before related production edits; setup failure is not Red.

## Format and ownership

Tasks use sequential T001 IDs; story phases require US labels. No [P] markers
are applied because the implementation critical path and reserved shared-file
ownership are sequential. Safe read-only QA overlap is described below, without
authorizing concurrent writes.

Root is sole orchestrator. Provisional foundation owner owns shared UI/numeric
code and corresponding tests. Provisional Account owner owns Account
routes/controls, screen tests and Maestro journeys after foundation publication.
Reserved integration owner alone handles approved locale/barrel/global-style
requests and dependency wiring. Independent QA/reviewers own reports, never
implementers' tests. Canonical dispatch must name people/agents and narrow exact
allowlists before execution.

Paths under specs/390-accounts-ui-pilot/validation/, proposed new test suites,
proposed UI helpers and new Maestro files below are future task outputs, not
files claimed to exist. Existing starting suites are verified in research.md. No
database/service/business-rule change is included.

## Phase 1: Setup and blocked execution prerequisites

- [ ] T001 Record authorized duration/scope, worker allowlists and exact
      branch/main/PR383 dependency route in
      specs/390-accounts-ui-pilot/validation/readiness.md; current
      main3264eba2b67bcc66cddc95e3fbdb36e8705ee642 and pending
      head0e7ee55abf6fb18af37e29e4f2e48ba45604a31e must be refreshed before
      dispatch; no production work until root approves route and duration.
- [ ] T002 Reverify all eight
      docs/mockups/accounts-ui-pilot/\*.calibrated.binding.md against
      docs/mockups/accounts-ui-pilot/approval-manifest.json; record matching
      approved package and exit0 verification evidence in
      specs/390-accounts-ui-pilot/validation/bindings.md; invalid revisions
      block governed work.
- [ ] T003 Establish scoped synthetic-user, local DB, emulator/Metro, failure
      injection, offline/relaunch and clipboard/caret capability against
      apps/mobile/e2e/maestro/accounts/egyptian-institution-presets.yaml; record
      exact supported controls and unavailable capabilities in
      specs/390-accounts-ui-pilot/validation/harness.md without changing
      services, bypassing auth or using live SMS provider.
- [ ] T004 Independent QA audit the planned 35-case disposition in
      specs/390-accounts-ui-pilot/manual-test-plan.md and record baseline gaps
      in specs/390-accounts-ui-pilot/validation/qa-audit.md; no existing source
      assertion becomes a passed runtime result.

**Checkpoint**: T001–T003 must be explicitly PASS for affected execution, not
merely documented. Missing dependency route, invalid binding, unavailable
required harness or unapproved >4-hour delivery blocks production dispatch. T004
may proceed read-only while setup owners collect distinct evidence.

## Phase 2: Shared foundation blocking both stories

**Goal**: Publish compatible APIs without Account adoption or cross-app
migration.

- [ ] T005 Inspect bounded existing callers of
      apps/mobile/components/ui/GroupedDecimalInput.tsx, GroupedMoneyInput.tsx,
      TextField.tsx and Dropdown.tsx plus
      packages/logic/src/utils/amount-helpers.ts; record frozen current-PR
      capabilities, exact proposed variant/signed contracts and
      unsigned/outlined/weight/keypad regression set in
      specs/390-accounts-ui-pilot/validation/foundation-contract.md.
- [ ] T006 Author failing signed opt-in, valid grouping/edit/correction, raw
      malformed display classification and unchanged precision regressions in
      packages/logic/src/utils/**tests**/amount-helpers.test.ts; preserve
      unsigned parser default and old call signatures.
- [ ] T007 Author failing real-control tests in
      apps/mobile/**tests**/components/ui/GroupedDecimalInput.test.tsx and
      TextField.test.tsx plus proposed
      apps/mobile/**tests**/components/ui/Dropdown.test.tsx for default opt-in,
      outlined default, required-name override/locale, error/warning/helper, no
      new focus ring, callbacks and fast controlled drafts.
- [ ] T008 Account owner author new grouped Add/signed Edit public journeys in
      proposed apps/mobile/e2e/maestro/accounts/ui-pilot-create.yaml and
      ui-pilot-edit.yaml before foundation production edits, plus existing
      exposed draft/focus/correction/Save regression smoke in proposed
      apps/mobile/e2e/maestro/accounts/ui-pilot-foundation.yaml. New feature
      journeys may remain Red until Account adoption; smoke alone is
      compatibility evidence. No new test-only product screen.
- [ ] T009 Run T006–T008 and record meaningful Red for newly changed foundation
      contracts plus already-passing public regression journeys; record exact
      failures/build/revision in
      specs/390-accounts-ui-pilot/validation/foundation-red.md; T004 QA checks
      failure relevance; stop for setup failure or missing public signal before
      production work.
- [ ] T010 Foundation owner implement only proved minimum opt-in signed
      resolution and valid/raw display support in
      packages/logic/src/utils/amount-helpers.ts; preserve existing unsigned
      signatures/behavior, invalid text and arbitrary Account precision, no
      parsing/rounding financial values on keystrokes.
- [ ] T011 Foundation owner integrate shared visible label, localized
      required-name and approved feedback contracts into
      apps/mobile/components/ui/TextField.tsx and Dropdown.tsx; proposed
      apps/mobile/components/ui/FieldLabel.tsx and FieldMessage.tsx only where
      repeated responsibilities justify extraction; preserve PR383
      null/error/adornment contracts and focus-local drafts.
- [ ] T012 Foundation owner expose explicit default/outlined and signed options
      through apps/mobile/components/ui/GroupedDecimalInput.tsx and
      GroupedMoneyInput.tsx; outlined/unsigned remain defaults, retain current
      PR383 focus/blur/style/soft-input forwarding, invalid abc12345 displayed
      verbatim, and keep any justified currency presentation adapter at proposed
      apps/mobile/components/currency/CurrencyField.tsx backed by existing
      CurrencyPicker.tsx.
- [ ] T013 Run changed shared unit/real-control and affected consumer regression
      suites Green; publish exact foundation API/revision and T006–T008 results
      with existing smoke compatibility separate from new Account journey Red
      (pending Green at T018/T025) in
      specs/390-accounts-ui-pilot/validation/foundation-green.md; reserved owner
      handles only named locale/export/style requests, no concurrent shared
      writers.

**Checkpoint**: Meaningful shared-contract Red/Green and compatible API evidence
required before Account adoption. New Account E2E authored/run Red before
foundation changes remains pending adoption Green at T018/T025; do not claim
full Account journey Green at T013. If a journey already passes unchanged
behavior, retain it as a regression and require another meaningful failure for
the changed contract rather than fabricating Red.

## Phase 3: User Story 1 — Create consistent Accounts (P1)

**Goal**: Add uses approved default controls without changing current validation
or persistence. **Independent test**: Create Cash/Bank/Wallet, zero and custom
balance, correct invalid fields, reopen offline/relaunch; verify entered versus
persisted result.

- [ ] T014 [US1] Author/update real Add control tests in proposed
      apps/mobile/**tests**/app/add-account-ui-pilot.test.tsx, existing
      app/add-account-institution-info.test.tsx, hooks/useAccountForm.test.ts
      and validation/account-validation.test.ts for
      grouped/canonical/raw-preview separation, required Type group once,
      preference race, provider/SMS resets, stale uniqueness, failure and
      repeated Save; preserve native maxLength/card sanitizer and schema-only
      oversized fixtures.
- [ ] T015 [US1] Complete the earlier T008 journey draft with controllable
      create/correct/provider-name/currency/optional-SMS/failure-retry/duplicate-save/offline-relaunch
      scenarios in proposed
      apps/mobile/e2e/maestro/accounts/ui-pilot-create.yaml; use only harness
      capabilities established by T003 and record blocked triggers explicitly.
- [ ] T016 [US1] Run new relevant T014–T015 coverage meaningfully Red and record
      unit/screen/journey failures in
      specs/390-accounts-ui-pilot/validation/create-red.md before Add production
      edits.
- [ ] T017 [US1] Adopt published shared contracts in
      apps/mobile/app/(private)/add-account.tsx,
      components/add-account/AccountTypeSelector.tsx and only explicitly
      necessary InstitutionProviderSection.tsx/SmsMatchingSection.tsx consumers;
      required group once, GroupedMoneyInput default/unsigned, existing
      CurrencyPicker workflow, preview formatter and current header/sections
      retained.
- [ ] T018 [US1] Execute Add Green automation and public Account reopen
      outcomes; record actual tests/results mapped to QA01–12/14–22/28/29 in
      specs/390-accounts-ui-pilot/validation/create-green.md; no provider,
      service or save conversion changes.

**Checkpoint**: US1 independently testable with all relevant setup/native gaps
explicit; shared foundation alone is not complete Account delivery.

## Phase 4: User Story 2 — Edit without financial meaning changes (P1)

**Goal**: Edit preserves signed values, pristine state and existing balance
choices. **Independent test**: Metadata-only save, positive/negative
silent/tracked changes, failures/retries, dismissal and relaunch each produce
the existing expected Account/History outcome.

- [ ] T019 [US2] Author real Edit tests in proposed
      apps/mobile/**tests**/app/edit-account-ui-pilot.test.tsx, existing
      app/edit-account-institution-info.test.tsx and
      hooks/useEditAccountForm.test.ts for signed default input, malformed
      correction, precision, pristine focus/blur, locked attributes,
      metadata-only save, uniqueness exclusion and default state.
- [ ] T020 [US2] Author proposed
      apps/mobile/**tests**/components/edit-account/BalanceChangedSheet.test.tsx
      for existing silent default, tracked choice, Confirm guard/failure retry,
      backdrop/Android Back cancellation/form retention and nonzero bottom inset
      if touched; include command integration via route test without changing
      service behavior.
- [ ] T021 [US2] Complete the earlier T008 journey draft with positive/negative
      silent/tracked, metadata-only, dismissal, retry/rapid Confirm and
      offline/restart scenarios in proposed
      apps/mobile/e2e/maestro/accounts/ui-pilot-edit.yaml; inspect user-visible
      Account/History, no private function invocation as E2E result.
- [ ] T022 [US2] Run T019–T021 meaningful Red for changed Edit contracts before
      adoption and record exact failure/harness boundaries in
      specs/390-accounts-ui-pilot/validation/edit-red.md.
- [ ] T023 [US2] Adopt default/signed GroupedMoneyInput and approved locked
      label/radius presentation in apps/mobile/app/(private)/edit-account.tsx
      and components/edit-account/ReadOnlyDropdown.tsx; preserve Back/Save, raw
      preview, unboxed Default, boxed SMS and Delete below SMS.
- [ ] T024 [US2] Update
      apps/mobile/components/edit-account/BalanceChangedSheet.tsx only when
      approved presentation/inset regressions prove a needed change; retain
      silent/tracked/Confirm, existing transition/BlurView, backdrop/Android
      Back, and no Cancel or drag gesture; otherwise record unchanged
      implementation in specs/390-accounts-ui-pilot/validation/edit-green.md.
- [ ] T025 [US2] Execute Green Edit and command-count/local persistence
      regression evidence for QA03/07–09/13/17–29/30; record actual test
      identifiers and public outcomes in
      specs/390-accounts-ui-pilot/validation/edit-green.md.

## Phase 5: User Story 3 — Supported presentation and accessibility (P2)

**Goal**: Approved controls remain readable and understandable across supported
contexts. **Independent test**: Complete Add/Edit/sheet navigation in EN/AR,
light/dark, compact/ordinary/tablet/landscape/enlarged text and actual
screen-reader navigation.

- [ ] T026 [US3] Author localized visible/accessible required-name override,
      Type-group once, optional/locked/error semantics and modal lifecycle
      assertions in proposed
      apps/mobile/**tests**/app/accounts-ui-pilot-accessibility.test.tsx using
      real controls; native announcements remain separate.
- [ ] T027 [US3] Author ordinary/compact/font-scale layout and nonzero-inset
      assertions in proposed
      apps/mobile/**tests**/app/accounts-ui-pilot-layout.test.tsx using
      apps/mobile/constants/ui.ts contracts; do not equate class assertions to
      clipping or contrast.
- [ ] T028 [US3] Author controllable
      keyboard/error-correction/theme/language/direction/viewport journeys in
      proposed apps/mobile/e2e/maestro/accounts/ui-pilot-presentation.yaml;
      verify each driver capability and separate physical IME/caret/TalkBack
      gaps.
- [ ] T029 [US3] Run relevant T026–T028 Red before any further presentation
      production correction and record exact changed-behavior failures versus
      already-passing regressions in
      specs/390-accounts-ui-pilot/validation/presentation-red.md.
- [ ] T030 [US3] Assigned existing owners correct only proved approved
      presentation regressions in apps/mobile/components/ui/TextField.tsx,
      Dropdown.tsx, components/edit-account/ReadOnlyDropdown.tsx and the two
      Account routes; shared changes return to foundation owner,
      locale/style/export requests to reserved owner; record no-op where passing
      coverage requires no edit.
- [ ] T031 [US3] Capture matched native baseline and
      compact/ordinary/tablet/landscape/dark/RTL/enlarged screenshots with
      viewport/density/font/insets in
      specs/390-accounts-ui-pilot/validation/visual/ and compare with approved
      calibrated bindings; record native font/emoji/BlurView/transition
      calibration and material deviations, never guess metrics or silently
      redesign.
- [ ] T032 [US3] Verify actual native clipboard paste, signed caret/selection,
      IME/bidi and keyboard variants with verified runner controls or explicit
      device-only cases; record actions/build/outcomes and unsupported-harness
      reason in specs/390-accounts-ui-pilot/validation/native-input.md.
- [ ] T033 [US3] Execute actual TalkBack/VoiceOver order, required name exactly
      once, errors, locked explanation, sheet open/close and focus restoration;
      record platform-specific PASS/FAIL/BLOCKED evidence in
      specs/390-accounts-ui-pilot/validation/accessibility.md; props alone do
      not pass this task.
- [ ] T034 [US3] Publish T026–T033 Green/results and remaining blocked variants
      in specs/390-accounts-ui-pilot/validation/presentation-green.md;
      functional, visual and accessibility completion must remain distinct.

## Phase 6: Cross-cutting review and handoff

- [ ] T035 Independent QA audit all 35 rows against actual
      unit/integration/journey/device evidence in
      specs/390-accounts-ui-pilot/validation/coverage-matrix.md; record
      deterministic automation gaps and native/harness reasons, no inferred
      passes.
- [ ] T036 Run focused shared-consumer regression, typecheck, lint and
      applicable i18n checks from quickstart.md; record exact commands/revisions
      and unrelated baseline or environment failures in
      specs/390-accounts-ui-pilot/validation/checks.md.
- [ ] T037 Independent TypeScript reviewer inspect exact integrated revision
      against spec.md/contracts and publish findings in
      specs/390-accounts-ui-pilot/validation/review-typescript.md; owners
      fix/recheck before next reviewer.
- [ ] T038 Independent logic reviewer follow completed TypeScript review,
      inspect failure paths/spec/35-case coverage and publish findings in
      specs/390-accounts-ui-pilot/validation/review-logic.md; owners fix/recheck
      before next reviewer.
- [ ] T039 Independent style reviewer follow completed logic review, inspect
      architecture/shared reuse/approved styling and publish findings in
      specs/390-accounts-ui-pilot/validation/review-style.md;
      visual/native/accessibility evidence remains separate.
- [ ] T040 Assigned owners apply only valid scoped review corrections, rerun
      affected meaningful checks and request reviewer revalidation; root records
      exact accepted revision in
      specs/390-accounts-ui-pilot/validation/review-resolution.md;
      product/schema/ownership conflicts return to root rather than patches.
- [ ] T041 Produce final specs/390-accounts-ui-pilot/validation/handoff.md
      linking actual 35-case coverage, immutable visual revision,
      functional/visual/accessibility/CI status, deferred #359/#360 adoption and
      device/harness gaps; no commit/push/PR/issue/merge action without separate
      authorization.

## Dependencies and safe parallel opportunities

T001–T003 → T005–T009 → T010–T013 → US1 T014–T018 → US2 T019–T025 → US3
T026–T034 → T035–T041.

T004 QA may inspect published requirements/readiness read-only while setup
gathers evidence; later it can audit completed test batches during T006–T028
without changing them. Within US1/US2/US3, the Account owner authors
deterministic and Maestro suites sequentially; QA reviews published batches
independently. T031–T033 device evidence may be scheduled independently only
after production correction T030 and harness prerequisites are complete, with
distinct report paths and root-granted device access. No concurrent writes to
shared UI, locales or tests.

## Explicit 35-case execution map

Task mappings describe required coverage, not existing execution. Existing
manual case IDs remain authoritative; all results NOT RUN.

| QA case                            | Deterministic / real-screen tasks    | Controllable journey tasks                       | Native/manual boundary                                                  |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------- |
| 01 Grouped/canonical/preview       | T006,T007,T014,T019                  | T015,T021                                        | T031 rendered comparison                                                |
| 02 Precision/trailing zeros        | T006,T007,T014,T019                  | T015,T021                                        | T032 native editing sampling                                            |
| 03 Signed Edit                     | T006,T007,T019                       | T021                                             | T032 signed caret/grouped paste                                         |
| 04 Add zero/negative               | T014                                 | T015                                             | Raw negative preserved; no valid negative save                          |
| 05 Malformed raw text              | T006,T007,T014,T019                  | T015,T021                                        | T032 actual paste only if clipboard runner verified                     |
| 06 Rapid typing/parent updates     | T007,T014,T019                       | T015,T021 driver entry                           | T032 actual IME; inputText insufficient                                 |
| 07 Selection/comma correction      | T006,T007,T019                       | T021 only supported selection controls           | T032 native caret/selection if runner missing                           |
| 08 Clear/intermediate/blur         | T006,T007,T014,T019                  | T015,T021                                        | T032 keyboard/refocus                                                   |
| 09 Pristine Edit formatting        | T019                                 | T021                                             | T031 real control result                                                |
| 10 Required visible group          | T007,T014,T026                       | T015,T028                                        | T031 rendered group; T033 spoken semantics                              |
| 11 Required override/localization  | T007,T026                            | T028 only locale controls                        | T033 actual announcements NOT RUN                                       |
| 12 Message/focused error           | T007,T014,T026                       | T015,T028                                        | T031 states; T033 error discovery                                       |
| 13 Editable/disabled/locked        | T007,T019,T026                       | T021,T028                                        | T033 lock navigation/explanation                                        |
| 14 Preference/currency lifecycle   | T014                                 | T015                                             | T003 deterministic preference race harness                              |
| 15 Optional reset/sections         | T014,T019                            | T015,T021                                        | Existing type/section rules retained                                    |
| 16 Null/Other provider             | T014,T019                            | T015,T021                                        | Null not empty ID                                                       |
| 17 Provider-aware stale uniqueness | T014,T019                            | T015,T021                                        | Stale races deterministic; distinct/equivalent manual provider fixtures |
| 18 Local query failure             | T014,T019                            | T015,T021 only T003 failure harness              | If no harness, integration proof plus explicit blocked full journey     |
| 19 Name correction/limits          | T014                                 | T015                                             | 51-character schema-only; UI maxLength50                                |
| 20 Optional sender/card errors     | T014,T019                            | T015,T021                                        | Three-digit→four UI correction; five-digit schema-only                  |
| 21 Save fail/retry/state           | T014,T019,T020                       | T015,T021 with T003 injection                    | Unavailable failure injection is blocked, never fake success            |
| 22 Repeated Save/Confirm           | T014,T019,T020                       | T015,T021 with controllable rapid taps           | Verify one public resulting record                                      |
| 23 Silent sheet choice             | T019,T020                            | T021                                             | Existing silent default retained                                        |
| 24 Tracked sheet choice            | T019,T020                            | T021                                             | One public adjustment outcome                                           |
| 25 Backdrop/Android Back           | T019,T020                            | T021                                             | Android Back automatable; iOS/modal focus T033                          |
| 26 Update failure/metadata save    | T019,T020                            | T021 with failure harness                        | No unnecessary sheet for metadata-only                                  |
| 27 Back/loading/missing account    | T014,T019                            | T015,T021 where scoped route fixture supported   | T003 missing-ID/auth harness; no dirty prompt introduced                |
| 28 Offline/relaunch                | T014,T019 local integration          | T015,T021 with verified network/restart controls | T003 blocked if environment cannot preserve scoped local seed           |
| 29 Default toggle                  | T014,T019                            | T015,T021                                        | No new default promotion                                                |
| 30 Bottom inset/scroll             | T020,T027                            | T028                                             | T031 gesture/3-button/native insets                                     |
| 31 Keyboard/focus/scroll           | T007,T027                            | T028 ordinary keyboard                           | T032 physical IME variants                                              |
| 32 Light/dark/contrast             | T007,T027 token/contrast measurement | T028                                             | T031 rendered comparisons; classes insufficient                         |
| 33 RTL/signed bidi                 | T006,T007,T026                       | T028                                             | T031 Arabic rendering; T032 bidi/caret; T033 reader                     |
| 34 Responsive/enlarged             | T027                                 | T028 supported viewport controls                 | T031 compact/ordinary/tablet/landscape/text scale                       |
| 35 Reader/modal focus              | T020,T026 props/state only           | T028 navigation only                             | T033 actual TalkBack/VoiceOver required                                 |

T035 resolves every row to actual test IDs/results or explicit native/harness
reason; deterministic requirements must not be silently reclassified
manual-only.

## Requirements and success criteria traceability

| Requirement | Tasks                              |
| ----------- | ---------------------------------- |
| FR-001      | T007,T011–T018,T023,T030,T031      |
| FR-002      | T007,T011,T014,T026,T033           |
| FR-003      | T007,T014,T017,T019,T023,T026      |
| FR-004      | T006,T007,T010,T012,T014,T019,T025 |
| FR-005      | T006,T007,T010,T012,T014,T019,T032 |
| FR-006      | T006,T010,T014–T019,T021–T025      |
| FR-007      | T007,T012,T019,T027,T028,T032      |
| FR-008      | T014,T015,T017,T018                |
| FR-009      | T014,T015,T017,T019,T021           |
| FR-010      | T014,T015,T019,T021                |
| FR-011      | T019,T023,T026,T033                |
| FR-012      | T014–T025                          |
| FR-013      | T019–T025,T033                     |
| FR-014      | T007,T011,T026,T030,T031,T033      |
| FR-015      | T014,T015,T019,T021,T025           |
| FR-016      | T026–T034                          |
| FR-017      | T020,T027–T032                     |
| FR-018      | T007,T020,T026,T028,T033           |
| FR-019      | T014,T019,T020,T023,T025           |
| FR-020      | T001,T002,T031,T040,T041           |
| SC-001      | T013,T018,T025,T031,T039           |
| SC-002      | T007,T026,T031,T033                |
| SC-003      | T006,T014,T019,T025                |
| SC-004      | T015,T018,T021,T025                |
| SC-005      | T027–T034                          |
| SC-006      | T035,T041                          |

## Implementation strategy and estimates

Recommended first delivery: T001–T013, prerequisite preflight1–2h plus
foundation3–4h = **4–6 elapsed hours from current state**. It does not deliver
complete Add/Edit migration. Full pilot including35-case automation/native
verification/reviews remains **10–16 elapsed hours**; root must obtain explicit
duration/scope direction before substantive implementation because forecast
exceeds four hours.

After foundation publication, US1 is the first independently usable Account
increment, followed by US2 and US3; complete delivery still requires every
relevant coverage/evidence gate. Root checks progress every30 active minutes and
applies mandatory overrun stop rules. Missing iOS/device/clipboard/failure
harness is reported with exact blocker, not hidden by passing CI.

## Generation record and stop

Read speckit-tasks skill, re-read before/after-tasks optional commit hooks and
skipped both. Inspected setup-tasks.sh: read-only feature/spec/plan/template
validation; used equivalent bounded PowerShell path/doc validation. No
production/tests, branch/commit/push/issue writes or orchestration performed.

Stop after task generation for root review and separate read-only analysis. Do
not run implement or dispatch the above tasks from this document.
