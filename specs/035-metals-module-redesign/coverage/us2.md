# US2 Coverage Fragment: Add Gold or Silver holding

Status: T076–T078 are Green against T081/T082 production boundaries. T079
Maestro and physical-device proof remain unexecuted under the active device-QA
lock, so T080/T083 remain open and this is not a complete US2 acceptance claim.

| Requirement                                                        | Automated proof                                                                         | Manual proof        | Status                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------- |
| FR-008 form order/direct Add/live preview                          | T076 normalized-preview input; T078 form/route order, direct Add, and preview           | US2-M01/M12         | Unit/UI Green; Maestro unexecuted                          |
| FR-009 required Gold/Silver facts, catalog purity, non-future date | T076 required, Gold/Silver, `24K · 999`, and date cases                                 | US2-M01/M04/M05/M06 | Green                                                     |
| FR-010 total paid purchase cost                                    | T076 canonical purchase-price fact                                                      | US2-M01             | Green                                                     |
| FR-011 optional physical form/notes, valuation independence        | T076 optional form/notes preview input; T078 supplied render and unavailable-rate UI    | US2-M01/M11         | Unit/UI Green; device pending                             |
| FR-012 localized numeric input                                     | T076 English, Arabic-Indic, Arabic separators, decimal-comma cases                      | US2-M02/M03         | Unit Green; device pending                                |
| FR-013 precision, finite/positive/range/currency/date validation   | T076 field-specific rejection plus selected-currency precision Hook case                | US2-M05             | Green                                                     |
| FR-014 unusual-value acknowledgment                                | T076 injected branch; mobile policy boundary tests; Hook inclusive acknowledgment       | US2-M07             | Green for versioned V1 soft-warning policy                |
| FR-015 local-first/offline/restart                                 | T077 SQLite atomicity/restart/rollback; T079 profile-driven journey authored             | US2-M08/M09/M10     | Integration Green; Maestro/device pending                 |
| FR-017 Gold/Silver-only                                            | T076 unsupported metal and purity mismatch cases                                        | US2-M06             | Green                                                     |
| SC-002 timing                                                      | None                                                                                    | Timed US2-M01/M02   | Manual-only, QA pending                                   |
| SC-003, SC-015, SC-024 local atomicity/restart/pending             | T077 SQLite proof; T078 pending lock; Hook stable-ID retry; T079 restart journey authored | US2-M08/M09/M10   | Unit/integration/UI Green; Maestro/device pending         |
| SC-005 unavailable rate truth                                      | T076 unavailable-preview input; T078 unavailable UI; T079 conditional profile assertion | US2-M08             | Unit/UI Green; Maestro unexecuted                         |
| SC-010, SC-011 responsive/RTL/a11y                                 | T078 compact/ordinary, 200%-text, RTL/theme, labels, safe-area, Skeleton                | US2-M02/M12         | Controlled UI Green; device proof pending                 |
| SC-021 exact precision and currency scale                          | T076 normalization/precision plus selected-currency Hook case                           | US2-M03/M05         | Green                                                     |
| SC-026 exact purity mapping                                        | T076 `gold-999` code/version/factor/label-key case                                      | US2-M06             | Green                                                     |

## Explicit exclusions

- The versioned V1 unusual-value policy is a soft typo guard: Gold >= 1,000g,
  Silver >= 10,000g, or purchase >= EGP 10,000,000 equivalent. Equality warns.
  Latest usable cached FX may evaluate the monetary branch; stale FX retains
  disclosure. Missing truthful conversion never invents a value or blocks Add.
- Rate unavailability is a preview state, not a validation failure.
- Maestro, physical accessibility/reflow, keyboard, safe-area visual proof, and
  timed completion remain open. No device-level acceptance is claimed.
