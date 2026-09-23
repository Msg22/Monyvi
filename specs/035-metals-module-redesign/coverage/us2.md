# US2 Coverage Fragment: Add Gold or Silver holding

Status: T075 defined. Deterministic validation, preview, form, route, locale, facade, and
SQLite command-persistence work in progress on mobile lane.

| Requirement | Automated proof | Manual proof | Status |
| --- | --- | --- | --- |
| FR-008 form order/direct Add/live preview | `metals-add.test.tsx`; `metal-holding-preview-service.test.ts` | US2-M01/M12 | Pending implementation |
| FR-009 required Gold/Silver facts, catalog purity, non-future date | `metal-holding-form-validation.test.ts`; `metals-add.test.tsx` | US2-M01/M04/M05/M06 | Pending implementation |
| FR-010 total paid purchase cost | validation and preview service suites | US2-M01 | Pending implementation |
| FR-011 optional physical form/notes, valuation independence | validation and Add UI suites | US2-M01/M11 | Pending implementation |
| FR-012 localized numeric input | `metal-holding-form-validation.test.ts` | US2-M02/M03 | Pending implementation |
| FR-013 precision, finite/positive/range/currency/date validation | `metal-holding-form-validation.test.ts` | US2-M05 | Pending implementation |
| FR-014 unusual-value acknowledgment | validation, hook, and Add UI suites | US2-M07 | Pending implementation |
| FR-015 local-first/offline/restart | Add SQLite suite; checked-in Maestro journey | US2-M08/M09/M10 | Pending implementation |
| FR-017 Gold/Silver-only | validation suite | US2-M06 | Pending implementation |
| FR-073/FR-075 truthful current-rate provenance | live-rates trust, preview service, locale, and Add UI suites | US2-M01/M08 | Pending implementation |
| SC-002 timing | None | Timed US2-M01/M02 | Manual-only, QA pending |
| SC-003, SC-015, SC-024 local atomicity/restart/pending | Add SQLite suite and Maestro journey | US2-M08/M09/M10 | Pending implementation |
| SC-005 unavailable rate truth | validation and Add UI suites | US2-M08 | Pending implementation |
| SC-010, SC-011 responsive/RTL/a11y | Add UI suite | US2-M02/M12 | Pending implementation |
| SC-021 exact precision and currency scale | validation and preview service suites | US2-M03/M05 | Pending implementation |
| SC-026 exact purity mapping | validation and preview service suites | US2-M06 | Pending implementation |

## Explicit exclusions

- No provider name or observation time is fabricated. The preview shows only
  source identity and timestamp carried from validated local market-rate rows.
- Safe-range and unusual-value thresholds remain policy-owned inputs.
- No native, timing, assistive-technology, or restart result is claimed before
  the physical-device gate runs.
