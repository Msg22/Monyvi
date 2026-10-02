# US2 Coverage: Add Gold or Silver holding

Status at implementation head
`c6a371974662ef60cd44eccd9ad53e03f1ffcf1b`: Add validation, preview, form,
route, facade, and SQLite command are implemented. Hosted Code Quality & Tests,
Financial Action pgTAP, and Android Build Verification passed; Android E2E was
skipped. The recorded review-focused Add/Edit group is 62/62 tests: Add hook 8,
Edit hook 9, Edit route 18, facade integration 9, legacy Edit 2, validation 8,
unusual-value policy 5, and holding preview 3.

`add-holding.yaml` is authored but has not run. Device/manual QA and timed
acceptance remain pending, so T083 stays unchecked. No new local verification is
claimed by this documentation update.

| Requirement | Automated proof | Manual proof | Status |
| --- | --- | --- | --- |
| FR-008 form order/direct Add/live preview | `metals-add.test.tsx`; preview service tests | US2-M01/M12 | Automated pass recorded; manual pending |
| FR-009 required Gold/Silver facts, catalog purity, non-future date | validation and Add UI suites | US2-M01/M04/M05/M06 | Automated pass recorded; manual pending |
| FR-010 total paid purchase cost | validation and preview suites | US2-M01 | Automated pass recorded; manual pending |
| FR-011 optional physical form/notes and valuation independence | validation and Add UI suites | US2-M01/M11 | Automated pass recorded; device pending |
| FR-012 global editable-number grammar | validation and hook suites: Latin digits, dot decimal, grouped comma thousands; reject comma decimal, Arabic digit/decimal input, and embedded whitespace | US2-M02/M03 | Automated pass recorded; manual pending |
| FR-013 precision, finite/positive/range/currency/date validation | validation suite | US2-M05 | Automated pass recorded; manual pending |
| FR-014 unusual-value acknowledgment, including offline EGP threshold | unusual-value policy, hook, and Add UI suites | US2-M07 | Automated pass recorded; Maestro/manual pending |
| FR-015 local-first/offline/restart/duplicate prevention | Add SQLite suite and checked-in Maestro journey | US2-M08/M09/M10 | SQLite pass recorded; Maestro/device pending |
| FR-017 Gold/Silver-only and purity-label resolution | validation and Add/Edit UI suites | US2-M06 | Automated pass recorded; device pending |
| FR-073/FR-075 truthful selected-rate provenance and precision | preview, facade, hook, and Add UI suites | US2-M01/M08 | Automated pass recorded; device pending |
| Review fix: dirty/pending removal guard | Add route and hook suites | US2-M10/M12 | Automated pass recorded; device navigation pending |
| Review fix: non-EGP preview freshness excludes policy-only EGP rate | Add hook suite | US2-M08 | Automated pass recorded; manual fixture pending |
| SC-002 timing | None | Timed US2-M01/M02 | Manual-only, pending |
| SC-003/SC-015/SC-024 atomicity, restart, pending state | Add SQLite suite and Maestro journey | US2-M08/M09/M10 | SQLite pass recorded; Maestro/device pending |
| SC-005 unavailable-rate truth | validation and Add UI suites | US2-M08 | Automated pass recorded; manual pending |
| SC-010/SC-011 responsive/RTL/accessibility | Add UI suite | US2-M02/M12 | UI automation recorded; native device pending |
| SC-021 exact precision and currency scale | validation and preview suites | US2-M03/M05/M08 | Automated pass recorded; manual pending |
| SC-026 exact purity mapping | validation and preview suites | US2-M06 | Automated pass recorded; manual pending |

## Explicit exclusions

- No provider name or observation time is fabricated. Preview evidence comes
  only from the selected validated local snapshot.
- Editable input does not accept locale-specific decimal notation; localized
  presentation never changes stored or calculated values.
- No native, timing, assistive-technology, Maestro, or restart result is claimed
  before that gate is actually run.
