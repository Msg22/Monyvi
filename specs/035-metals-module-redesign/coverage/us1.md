# US1 Coverage Fragment: Connected portfolio

Status: T053 component coverage and full mobile typecheck Green. Maestro/device
evidence remains open; this file is not a completion claim.

| Requirement | Automated proof | Manual proof | Status |
| --- | --- | --- | --- |
| FR-001 Home preserves existing composition plus Concept C | `portfolio-surfaces.test.tsx` (9 assertions total suite) | US1-M01/M11 | Component Green; device/reflow manual |
| FR-002 Home destinations and separate rates entry | `home-and-portfolio.yaml` | US1-M03 | Maestro authored; unrun |
| FR-003–FR-004 truthful active net worth / no double counting | `net-worth-read-model-service.metals.test.ts` | US1-M02/M07/M08/M09 | T051 Green; UI proof blocked |
| FR-005 My Metals All/Gold/Silver, allocation, History | `metal-portfolio-read-model-service.test.ts`; `portfolio-surfaces.test.tsx` | US1-M04/M05/M06/M08/M09 | Service + component proof Green; device manual |
| FR-006–FR-007 themes, responsive, accessibility, trust states | `portfolio-surfaces.test.tsx` | US1-M09/M10/M11/M12 | Visible/a11y branches Green; theme/reflow device manual |
| SC-001 moderated comprehension | None | SC-001 rationale in manual plan | Manual-only; research approval required |
| SC-002 timing | None | QA-owned timing measurement | Manual-only; QA-owned |
| SC-003–SC-008 functional/story conditions | T051–T054 | US1-M01–M12 | In progress; Maestro/device pending |

## Explicit exclusions

- No Live Rates redesign or route-layout change; US9 owns rate-surface implementation.
- No holding detail, Add/Edit, terminal action, migration, synchronization,
  fixture-registry, translation-schema, or shared-barrel changes. This UI batch
  owns only the approved US1 EN/AR `metals.json` copy it renders.
- No claim of full US1 Green until T054 Maestro/device evidence is green.
