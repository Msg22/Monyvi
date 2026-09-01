# US1 Coverage Fragment: Connected portfolio

Status: Red started. UI coverage blocked pending Slice 4-owned approved EN/AR translation keys and translation-schema update. This file is not a completion claim.

| Requirement | Automated proof | Manual proof | Status |
| --- | --- | --- | --- |
| FR-001 Home preserves existing composition plus Concept C | `portfolio-surfaces.test.tsx` | US1-M01/M11 | Blocked by i18n ownership |
| FR-002 Home destinations and separate rates entry | `home-and-portfolio.yaml` | US1-M03 | Blocked by i18n ownership |
| FR-003–FR-004 truthful active net worth / no double counting | `net-worth-read-model-service.metals.test.ts` | US1-M02/M07/M08/M09 | Red pending implementation |
| FR-005 My Metals All/Gold/Silver, allocation, History | `metal-portfolio-read-model-service.test.ts` | US1-M04/M05/M06/M08/M09 | Red pending implementation |
| FR-006–FR-007 themes, responsive, accessibility, trust states | `portfolio-surfaces.test.tsx` | US1-M09/M10/M11/M12 | Blocked by i18n ownership |
| SC-001 moderated comprehension | None | SC-001 rationale in manual plan | Manual-only; research approval required |
| SC-002 timing | None | QA-owned timing measurement | Manual-only; QA-owned |
| SC-003–SC-008 functional/story conditions | T051–T054 | US1-M01–M12 | In progress |

## Explicit exclusions

- No Live Rates redesign or route-layout change; US9 owns rate-surface implementation.
- No holding detail, Add/Edit, terminal action, migration, synchronization, fixture-registry, translation, or shared-barrel changes.
- No claim of full US1 Green until T053/T054 can run with approved localized content.
