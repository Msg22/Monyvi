# US3 Coverage Matrix

| Manual scenario | Deterministic service coverage | Maestro / manual status |
| --- | --- | --- |
| US3-01 Active effective detail and attribution | `metal-detail-history-read-model.test.ts`: current-user-scoped Asset/metal/state/evidence read, exact identity, active value, and attribution | UI deferred to T068/T069/T072-T074 |
| US3-02 Terminal contribution truth | `metal-detail-history-read-model.test.ts`: Sold/Disposed have no active value | UI deferred to T068/T069/T072-T074 |
| US3-03 Reversal and tied-time chronology | `metal-detail-history-read-model.test.ts`: reducer-backed reversal ordering | UI deferred to T068/T069/T072-T074 |
| US3-04 Missing exact facts | `metal-detail-history-read-model.test.ts`: null calculations and correction flags | UI deferred to T068/T069/T072-T074 |
| US3-05 Filtered, effective History | `metal-detail-history-read-model.test.ts`: All/Sold/Disposed and foreign/rejected exclusion plus owned name, metal, purity, physical-form, stable holding ID, and neutral unsupported-form render identity | UI deferred to T068/T069/T072-T074 |
| US3-06 Bounded user scope | `metal-detail-history-read-model.test.ts`: authenticated current-user mismatch rejection, approved helper conditions, child-parent ownership, and bounded page take | UI deferred to T068/T069/T072-T074 |

The evidence file records the required Red result before production service code is
added. No Maestro flow is claimed until an approved translated route/action contract
and fixture harness exist.
