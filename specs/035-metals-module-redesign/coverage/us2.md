# US2 Coverage Fragment: Add Gold or Silver holding

Status: T075 manual/traceability plan complete. T076 validation contract is
intentionally Red because `apps/mobile/validation/metal-holding-form-validation.ts`
does not exist. T077–T080 and Green work remain open; this is not a US2
completion claim.

| Requirement | Automated proof | Manual proof | Status |
| --- | --- | --- | --- |
| FR-008 form order/direct Add/live preview | T076 normalized-preview input contract; planned T078/T079 | US2-M01/M12 | Red contract only; UI/Maestro pending |
| FR-009 required Gold/Silver facts, catalog purity, non-future date | T076 required, Gold/Silver, `24K · 999`, and date cases | US2-M01/M04/M05/M06 | Red contract only |
| FR-010 total paid purchase cost | T076 canonical purchase-price fact | US2-M01 | Red contract only |
| FR-011 optional physical form/notes, valuation independence | T076 optional form/notes preview contract; planned T078 | US2-M01/M11 | Red contract only |
| FR-012 localized numeric input | T076 English, Arabic-Indic, Arabic separators, decimal-comma cases | US2-M02/M03 | Red contract only |
| FR-013 precision, finite/positive/range/currency/date validation | T076 field-specific rejection cases | US2-M05 | Red contract only |
| FR-014 unusual-value acknowledgment | T076 injected-policy acknowledgment branch | US2-M07 | Red contract only; product thresholds remain policy-owned |
| FR-015 local-first/offline/restart | Planned T077/T079 | US2-M08/M09/M10 | Pending |
| FR-017 Gold/Silver-only | T076 unsupported metal and purity mismatch cases | US2-M06 | Red contract only |
| SC-002 timing | None | Timed US2-M01/M02 | Manual-only, QA pending |
| SC-003, SC-015, SC-024 local atomicity/restart/pending | Planned T077–T079 | US2-M08/M09/M10 | Pending |
| SC-005 unavailable rate truth | T076 unavailable-preview contract; planned T077–T079 | US2-M08 | Red contract only |
| SC-010, SC-011 responsive/RTL/a11y | Planned T078 | US2-M02/M12 | Pending |
| SC-021 exact precision and currency scale | T076 normalization and precision cases | US2-M03/M05 | Red contract only |
| SC-026 exact purity mapping | T076 `gold-999` code/version/factor/label-key case | US2-M06 | Red contract only |

## Explicit exclusions

- T076 does not create a holding, writer, service, hook, component, route, locale,
  schema, or Maestro flow.
- Safe-range and unusual-value thresholds are not approved product constants. The
  validation boundary receives those policies so this Red suite does not invent
  currency-blind limits.
- Rate unavailability is a preview state, not a validation failure. Local
  persistence, restart, deduplication, ownership, synchronization, UI focus, and
  device evidence remain T077–T079 work.
