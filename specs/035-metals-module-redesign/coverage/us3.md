# US3 Coverage Matrix

| Manual scenario | Deterministic service coverage | Maestro / manual status |
| --- | --- | --- |
| US3-01 Active effective detail and attribution | detail/history service + `holding-experience.test.tsx` | Component Green; Maestro/device pending |
| US3-02 Terminal contribution truth | `metal-detail-history-read-model.test.ts`: Sold/Disposed have no active value | UI deferred to T068/T069/T072-T074 |
| US3-03 Reversal and tied-time chronology | `metal-detail-history-read-model.test.ts`: reducer-backed reversal ordering | UI deferred to T068/T069/T072-T074 |
| US3-04 Missing exact facts | `metal-detail-history-read-model.test.ts`: null calculations and correction flags | UI deferred to T068/T069/T072-T074 |
| US3-05 Filtered, effective History | service tests + `holding-experience.test.tsx` filters/navigation/render identity | Component Green; Maestro/device pending |
| US3-06 Bounded user scope | `metal-detail-history-read-model.test.ts`: authenticated current-user mismatch rejection, approved helper conditions, child-parent ownership, and bounded page take | UI deferred to T068/T069/T072-T074 |

The evidence file records the required Red result before production service code is
added. No Maestro flow is claimed until an approved translated route/action contract
and fixture harness exist. T068 component Green covers Active/Sold/Disposed/restored,
loading/unavailable/offline/error/retry, manifest fallback, descriptor actions, and
History filter/navigation accessibility. T069/T074 remain open: Metro/device run unavailable.
