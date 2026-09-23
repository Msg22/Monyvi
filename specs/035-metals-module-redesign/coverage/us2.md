# US2 Coverage Fragment: Add Gold or Silver holding

Status: Add validation, preview, form, route, facade, and SQLite command are
implemented. On 2026-09-23, Slice 7 focused Jest run passed 11 suites / 53 tests
(US2 and US4 combined), mobile typecheck, focused lint, and i18n parity.
`add-holding.yaml` is authored but has not run. Device/manual QA and timed
acceptance remain pending, so T083 stays unchecked.

| Requirement | Automated proof | Manual proof | Status |
| --- | --- | --- | --- |
| FR-008 form order/direct Add/live preview | `metals-add.test.tsx`; `metal-holding-preview-service.test.ts` | US2-M01/M12 | Automated pass; manual pending |
| FR-009 required Gold/Silver facts, catalog purity, non-future date | `metal-holding-form-validation.test.ts`; `metals-add.test.tsx` | US2-M01/M04/M05/M06 | Automated pass; manual pending |
| FR-010 total paid purchase cost | validation and preview service suites | US2-M01 | Automated pass; manual pending |
| FR-011 optional physical form/notes, valuation independence | validation and Add UI suites | US2-M01/M11 | Automated pass; manual pending |
| FR-012 localized numeric input | `metal-holding-form-validation.test.ts` | US2-M02/M03 | Automated pass; device pending |
| FR-013 precision, finite/positive/range/currency/date validation | `metal-holding-form-validation.test.ts` | US2-M05 | Automated pass; manual pending |
| FR-014 unusual-value acknowledgment | validation, hook, and Add UI suites | US2-M07 | Automated pass; Maestro not run |
| FR-015 local-first/offline/restart | Add SQLite suite; checked-in Maestro journey | US2-M08/M09/M10 | SQLite pass; Maestro/device pending |
| FR-017 Gold/Silver-only | validation suite | US2-M06 | Automated pass; Maestro not run |
| FR-073/FR-075 truthful current-rate provenance | live-rates trust, preview service, facade SQLite, and Add UI suites | US2-M01/M08 | Automated pass; device pending |
| SC-002 timing | None | Timed US2-M01/M02 | Manual-only, QA pending |
| SC-003, SC-015, SC-024 local atomicity/restart/pending | Add SQLite suite and Maestro journey | US2-M08/M09/M10 | SQLite pass; Maestro/device pending |
| SC-005 unavailable rate truth | validation and Add UI suites | US2-M08 | Automated pass; manual pending |
| SC-010, SC-011 responsive/RTL/a11y | Add UI suite | US2-M02/M12 | UI test pass; native device pending |
| SC-021 exact precision and currency scale | validation and preview service suites | US2-M03/M05 | Automated pass; manual pending |
| SC-026 exact purity mapping | validation and preview service suites | US2-M06 | Automated pass; manual pending |

## Explicit exclusions

- No provider name or observation time is fabricated. The preview shows only
  source identity and timestamp carried from validated local market-rate rows.
- Safe-range and unusual-value thresholds remain policy-owned inputs.
- No native, timing, assistive-technology, or restart result is claimed before
  the physical-device gate runs.
