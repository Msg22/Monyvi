# US2: Add Gold or Silver holding

Owner: Slice 7 Add/Edit Base: `4992ec5bdba3b941eba5939ad4297f4773af85b3`
Requirements: FR-008–FR-015, FR-017, FR-087–FR-094 Success criteria: SC-002,
SC-003, SC-005, SC-010, SC-011, SC-015, SC-021, SC-024, SC-026 Automated
counterpart: `metal-holding-form-validation.test.ts`, planned
`add-metal-holding-command-service.integration.test.ts`, `metals-add.test.tsx`,
and `e2e/maestro/metals/add-holding.yaml`.

## Preconditions

- Authenticated fixture user with no foreign-user data visible to the form.
- Gold and Silver catalog-v1 fixtures; `gold-999` is the exact `24K · 999`
  choice and factor `0.999`.
- Fresh, stale, unknown, missing, and offline rate fixtures; Add facts must
  never depend on a network response.
- Approved normal-flow reference: `05-add-holding-entry.png`.
- Test date fixed before and after each purchase-date boundary.

| ID      | Preconditions and fixture                         | User journey                                                                                           | Expected observable result                                                                                                                            | Automated?                        | Evidence                            |
| ------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------- |
| US2-M01 | Fresh Gold rate; English LTR                      | Enter all required Gold facts, optional Coin and Arabic/emoji note                                     | Same form normalizes input, shows chosen purity/factor and compact preview, then saves with direct Add holding.                                       | Unit + UI + Maestro               | T076/T078 Red; T079 unexecuted      |
| US2-M02 | Fresh Silver rate; Arabic RTL                     | Enter Arabic-Indic digits, Arabic decimal mark, and Arabic grouping                                    | Form and preview show same normalized exact values without bidi breakage.                                                                             | Unit + UI + device                | T076/T078 Red; device proof pending |
| US2-M03 | Fresh rate; decimal-comma input                   | Enter decimal-comma weight and price                                                                   | Values normalize once, review matches submitted canonical decimals.                                                                                   | Unit + UI + Maestro               | T076/T078/T079 pending              |
| US2-M04 | Any rate state                                    | Leave every required field blank or use null for unselected purity/currency/date                       | Focusable field errors identify each missing fact; empty-string IDs are never used as a missing-value sentinel.                                       | Unit + UI                         | T076/T078 Red                       |
| US2-M05 | Any rate state                                    | Try zero, negative, non-finite, over-precision, over-range, wrong currency scale, and future date      | Submission remains blocked with specific recovery state; no command is attempted.                                                                     | Unit + UI + Maestro               | T076/T078/T079 pending              |
| US2-M06 | Any rate state                                    | Choose Platinum, mismatched purity, or bare/generic 24K                                                | Only Gold/Silver catalog choices are possible; `24K · 999` persists as code `gold-999`, version `1`, factor `0.999`.                                  | Unit + UI + Maestro               | T076/T078/T079 pending              |
| US2-M07 | Policy-selected unusual supported weight or price | Submit before, then after, acknowledgment                                                              | First submission stays in form with explicit warning; acknowledgment permits direct Add without a review route or arbitrary currency-blind rejection. | Unit + UI + Maestro               | T076/T078/T079 pending              |
| US2-M08 | Missing/invalid rate or offline cache             | Complete valid facts and inspect preview, then submit                                                  | Preview says valuation unavailable; holding facts remain complete, save locally, and later sync is pending rather than blocking.                      | Unit + integration + UI + Maestro | T076–T079 pending                   |
| US2-M09 | Offline valid fixture                             | Add holding, restart app, reopen portfolio                                                             | One locally saved holding remains with exact acquisition facts and no partial record.                                                                 | Integration + Maestro + device    | T077/T079 pending                   |
| US2-M10 | Pending local writer / injected local failure     | Repeatedly tap Add, then retry after failure                                                           | Pending state prevents duplicate/exit; failure preserves input and produces no partial holding; retry yields one outcome.                             | Integration + UI + Maestro        | T077–T079 pending                   |
| US2-M11 | Fresh and unavailable rates                       | Add with Bar, Coin, Jewelry, then no physical form or notes                                            | Optional facts stay optional, render/description changes only with physical form, and valuation inputs are unchanged.                                 | Unit + UI + device                | T076/T078 Red; device proof pending |
| US2-M12 | Add route                                         | Test EN/AR RTL, light/dark, compact/ordinary/tablet/landscape, 200% text, keyboard, TalkBack/VoiceOver | Required order, preview, status, error focus, safe-area CTA, names, and input associations remain reachable and understandable.                       | UI + device                       | T078 Red; device proof pending      |

## Timed acceptance

Measure US2-M01 and US2-M02 from opening Add Holding until local success. Record
locale, direction, device, build, fixture, duration, and whether optional fields
were skipped. SC-002 passes only when a valid Add completes in under two
minutes; no timing claim exists until QA records it.

## Manual-only rationale

### Manual-only: US2-M09, US2-M12, SC-002

Scenario: Physical offline/restart, native accessibility, visual reflow,
safe-area, keyboard, and timing inspection across device matrix.

Why automation cannot honestly control it: current Maestro/device harness cannot
reliably configure all native assistive technologies, font scales, tablets,
orientations, gesture/navigation-bar modes, and measured human completion time.

Deterministic coverage retained: T076 validates normalization and field
contracts; T077 will prove local atomicity/restart; T078 will cover controlled
UI state; T079 will drive reproducible Gold/Silver/offline journeys.

Human owner and environment: Mohamed on current Android and iOS builds, EN/AR,
light/dark, compact phone and tablet, with fresh and unavailable-rate fixtures.

Pass/fail evidence: video or screenshots plus build, device/OS,
locale/direction, theme, scale, viewport, navigation mode, network/rate fixture,
timings, and result.

Runner follow-up: add a controlled native accessibility/reflow harness when
those conditions become reliable.
