# US3 Detail and History Manual Test Plan

## Scope

This plan covers the Slice 6 holding-detail and History read-model boundary only.
Action forms, route composition, translated copy, visual render assets, and Maestro
coverage are owned by later slices.

## Scenarios

| ID | Scenario | Expected result | Requirements | Automation |
| --- | --- | --- | --- | --- |
| US3-01 | Open an effective Active Gold or Silver holding | Identity, exact facts, current value and available since-purchase attribution reflect only accepted lifecycle evidence | FR-016, FR-047, FR-081, FR-084 | `metal-detail-history-read-model.test.ts` |
| US3-02 | Open a Sold or Disposed holding | Terminal status and permanent timeline remain visible; it has no active-ownership/current-value contribution | FR-029, FR-041, FR-047 | `metal-detail-history-read-model.test.ts` |
| US3-03 | Undo a terminal action, including an equal-time event | The same holding is restored Active; reversal precedes the reversed event at equal time; original terminal evidence remains in its detail timeline | FR-040, FR-043, FR-098 | `metal-detail-history-read-model.test.ts` |
| US3-04 | Inspect a migrated holding missing exact weight, purity tuple, or purchase cost | Holding remains visible; only dependent calculations are unavailable; correction requirement identifies every missing fact | FR-019, FR-057, FR-081 | `metal-detail-history-read-model.test.ts` |
| US3-05 | Browse global History with All, Sold, and Disposed filters | Only current effective visible terminal holdings appear; rejected, incomplete, deleted-mistake, foreign, and reversed-terminal candidates do not | FR-037, FR-040, FR-063, FR-098 | `metal-detail-history-read-model.test.ts` |
| US3-06 | Page a large timeline/history set | User-scoped read queries are bounded; loading the next page never changes ordering or includes a foreign row | FR-061, FR-063, FR-098 | `metal-detail-history-read-model.test.ts` |

## Manual-only follow-up

T068/T069/T072-T074 remain intentionally deferred: the translated screen states,
action descriptors, route integration, render manifest, and controlled Maestro
fixtures are owned by subsequent slices. Validate RTL, light/dark, responsive,
200% text, screen reader, Skeleton, offline, error, and pagination interaction after
those dependencies land.
