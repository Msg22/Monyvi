# US2: Add Gold or Silver holding

Owner: Slice 7 Add/Edit  
Requirements: FR-008–FR-015, FR-017, FR-087–FR-094  
Success criteria: SC-002, SC-003, SC-005, SC-010, SC-011, SC-015, SC-021,
SC-024, SC-026  
Automated counterparts: `metal-holding-form-validation.test.ts`,
`useAddMetalHoldingForm.test.tsx`,
`add-metal-holding-command-service.integration.test.ts`,
`metals-add.test.tsx`, and `e2e/maestro/metals/add-holding.yaml`.

## Evidence boundary

Recorded implementation head: `c6a371974662ef60cd44eccd9ad53e03f1ffcf1b`.

- Hosted Code Quality & Tests, Financial Action pgTAP, and Android Build
  Verification passed on that head. Android E2E was skipped.
- The recorded review-focused Add/Edit group is 62/62 tests: Add hook 8, Edit
  hook 9, Edit route 18, facade integration 9, legacy Edit 2, validation 8,
  unusual-value policy 5, and holding preview 3.
- `add-holding.yaml` is authored but has not run. Physical-device, manual, and
  timed results remain pending.
- This document does not claim a new local run.

## Preconditions

- Use a disposable authenticated fixture user.
- Prepare Gold and Silver catalog-v1 choices; `gold-999` is displayed as
  `24K · 999` and carries factor `0.999`.
- Prepare fresh, stale, unknown, missing, and offline rate fixtures. Add facts
  must never depend on a network response.
- Use English and Arabic app language fixtures. Editable financial input always
  uses Latin digits and `.` as the decimal separator in both languages.
- Fix the test date before and after each purchase-date boundary.

## Scenario matrix

| ID | Preconditions | Steps | Expected observable result | Evidence status |
| --- | --- | --- | --- | --- |
| US2-M01 | Fresh Gold rate; English LTR | Enter all required Gold facts, optional Coin, and an Arabic/emoji note; submit once | The same form shows the selected purity and compact preview, then saves directly with one local holding | Automated pass recorded; Maestro/manual pending |
| US2-M02 | Fresh Silver rate; Arabic RTL | Enter valid Latin-digit values such as `10.125` and `1,234.50); inspect preview and submit | RTL layout remains readable; the exact values are not reinterpreted; later display localization does not alter stored facts | Automated pass recorded; device pending |
| US2-M03 | Any rate state | Try grouped `1,234.50`, then `12,5`, Arabic-Indic digits, Arabic decimal mark, scientific notation, signs, and embedded whitespace such as `12 34` | Correct three-digit grouping is accepted; every other form is rejected without deletion or reinterpretation of characters | Automated pass recorded; manual pending |
| US2-M04 | Any rate state | Leave required fields blank or leave purity/currency/date unselected; submit | Focusable field errors identify every missing fact; no empty-string ID is used as a missing sentinel | Automated pass recorded; manual pending |
| US2-M05 | Any rate state | Try zero, negative, non-finite, over-precision, over-range, wrong currency scale, and future date | Submission stays in the form, no command runs, and recovery copy identifies the invalid fact | Automated pass recorded; Maestro/manual pending |
| US2-M06 | Catalog fixture | Inspect Gold/Silver purity choices and attempt an unsupported metal or mismatched purity through the available test fixture | Only Gold/Silver catalog choices are accepted; user-facing labels appear instead of internal codes; `24K · 999` persists as `gold-999` version `1` factor `0.999` | Automated pass recorded; device pending |
| US2-M07 | EGP 10,000,000+ purchase; no rates/offline | Submit before and after acknowledging the unusual-value warning | The EGP warning appears without needing market rates; acknowledgment permits direct Add and does not invent a review route | Automated pass recorded; manual pending |
| US2-M08 | Fresh/stale/unknown/missing rates | Compare the displayed metal/FX rate digits with the fixture, then submit a valid holding | Displayed reference precision matches the consumed snapshot; stale/unknown required rates request acknowledgment; missing rates make valuation unavailable but do not block valid local save | Automated pass recorded; device pending |
| US2-M09 | Offline valid fixture | Add, terminate the app, restart, and reopen My Metals | Exactly one locally saved holding remains with complete acquisition facts and no partial row | SQLite pass recorded; Maestro/device pending |
| US2-M10 | Dirty form, pending writer, and injected failure | Attempt header Back, Cancel, Android hardware Back, and iOS gesture; then submit repeatedly and retry after failure | Every dirty exit offers Keep editing/Discard; pending blocks exit and duplicates; failure preserves input and retry creates one result | Automated pass recorded; Maestro/device pending |
| US2-M11 | Fresh and unavailable rates | Add Bar, Coin, Jewelry, then omit physical form and notes | Optional facts stay optional; physical form changes description only and never valuation inputs | Automated pass recorded; device pending |
| US2-M12 | Add route | Exercise EN/AR, light/dark, compact/ordinary/tablet/landscape, 200% text, keyboard, TalkBack/VoiceOver, and top/bottom safe areas | Required order, stacked reflow, preview, status, errors, labels, dirty-exit sheet, and CTA remain reachable and understandable | UI automation recorded; physical-device proof pending |

## Review-fix spot checks

1. In Arabic mode, paste `12,5` and `12 34` into Weight and Purchase price.
   Confirm each remains invalid and is not silently changed to `125` or
   `1234`.
2. With no usable market rates, enter an EGP purchase of at least 10,000,000.
   Confirm the unusual-value warning still appears and must be acknowledged.
3. Load a low-value FX reference such as `0.0067`. Confirm the preview shows
   the supplied rate precision rather than rounding it to ordinary money
   precision.
4. For a non-EGP purchase, make only the EGP reference stale. Confirm the
   acquisition preview freshness follows the required metal and purchase-
   currency references; the EGP rate affects only the unusual-value policy.
5. Change any field, then try every navigation exit. Confirm each path uses the
   same dirty-exit decision and Discard actually exits.

## Timed acceptance

Measure US2-M01 and US2-M02 from opening Add Holding until local success. Record
locale, direction, device, build, fixture, duration, and optional fields used.
SC-002 passes only when a valid Add completes in under two minutes; no timing
claim exists until QA records it.

## Manual-only record

For device-only rows, record build/head, device and OS, locale/direction, theme,
font scale, viewport/orientation, navigation mode, network/rate fixture, steps,
screenshots or video, duration where required, and Pass/Fail/Blocked. Hosted CI
does not replace this evidence.
