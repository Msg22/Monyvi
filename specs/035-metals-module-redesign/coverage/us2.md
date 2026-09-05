# US2 Coverage Fragment: Add Gold or Silver holding

Status: deterministic validation, preview, form, route, locale, facade, and
SQLite command-persistence work is Green on Slice 7. Runtime facade activation
still depends on unfinished Slice 4 coordinator T043. Maestro and
physical-device checks remain pending, so US2 is not complete.

| Requirement | Automated proof | Manual proof | Status |
| --- | --- | --- | --- |
| FR-008 form order/direct Add/live preview | `metals-add.test.tsx`; `metal-holding-preview-service.test.ts` | US2-M01/M12 | Deterministic Green; device pending |
| FR-009 required Gold/Silver facts, catalog purity, non-future date | `metal-holding-form-validation.test.ts`; `metals-add.test.tsx` | US2-M01/M04/M05/M06 | Green |
| FR-010 total paid purchase cost | validation and preview service suites | US2-M01 | Green |
| FR-011 optional physical form/notes, valuation independence | validation and Add UI suites | US2-M01/M11 | Green |
| FR-012 localized numeric input | `metal-holding-form-validation.test.ts` | US2-M02/M03 | Green |
| FR-013 precision, finite/positive/range/currency/date validation | `metal-holding-form-validation.test.ts` | US2-M05 | Green |
| FR-014 unusual-value acknowledgment | validation, hook, and Add UI suites | US2-M07 | Green with injected policy |
| FR-015 local-first/offline/restart | Add SQLite suite; checked-in Maestro journey | US2-M08/M09/M10 | SQLite command persistence Green; runtime T043 and Maestro pending |
| FR-017 Gold/Silver-only | validation suite | US2-M06 | Green |
| FR-073/FR-075 truthful current-rate provenance | live-rates trust, preview service, locale, and Add UI suites | US2-M01/M08 | Deterministic Green; device pending |
| SC-002 timing | None | Timed US2-M01/M02 | Manual-only, QA pending |
| SC-003, SC-015, SC-024 local atomicity/restart/pending | Add SQLite suite and Maestro journey | US2-M08/M09/M10 | SQLite command persistence Green; runtime T043 and device execution pending |
| SC-005 unavailable rate truth | validation and Add UI suites | US2-M08 | Green |
| SC-010, SC-011 responsive/RTL/a11y | Add UI suite | US2-M02/M12 | Deterministic Green; physical matrix pending |
| SC-021 exact precision and currency scale | validation and preview service suites | US2-M03/M05 | Green |
| SC-026 exact purity mapping | validation and preview service suites | US2-M06 | Green |

## Current verification

- Add/Edit UI: 12/12 Green.
- Live-rate source propagation plus exact preview details: 9/9 Green.
- Metals EN/AR content and runtime resource contracts: 12/12 Green.
- Mobile TypeScript: Green on `be7ce054`.
- Full mobile lint with project rules: Green on `be7ce054`.
- Add SQLite command: 5/5 Green after merged foundation validation-context fix.
- Full focused Add/Edit aggregate: 12 suites, 63/63 Green on `be7ce054`.
- Runtime route-to-command activation remains dependent on coordinator T043;
  T083 stays unchecked.
- Checked-in Maestro journey has not run on a device in this lane.

## Explicit exclusions

- No provider name or observation time is fabricated. The preview shows only
  source identity and timestamp carried from validated local market-rate rows.
- Safe-range and unusual-value thresholds remain policy-owned inputs.
- No native, timing, assistive-technology, or restart result is claimed before
  the physical-device gate runs.
