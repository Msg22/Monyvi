# US3 Detail and History Manual Test Plan

## Scope

This plan covers the holding-detail and History read-model boundary plus the
issue #283 terminal Sold/Disposed presentation. Action forms remain owned by
their command slices; this plan covers descriptor-driven Undo visibility but
does not authorize or test the Undo command itself.

For service scenarios, call only the current-user-scoped detail/History read
APIs. Hooks and screens must not query WatermelonDB tables, join child rows,
infer a missing metal/form, or parse lifecycle payload JSON. An unsupported
physical form must retain the holding and select the neutral render identity.

## Scenarios

| ID     | Scenario                                                                                                                      | Expected result                                                                                                                                                              | Requirements                                 | Automation                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| US3-01 | Open an effective Active Gold or Silver holding                                                                               | Identity, exact facts, current value and available since-purchase attribution reflect only accepted lifecycle evidence                                                       | FR-016, FR-047, FR-081, FR-084               | `metal-detail-history-read-model.test.ts`                                                                    |
| US3-02 | Open a Sold or Disposed holding                                                                                               | Terminal status and permanent timeline remain visible; it has no active-ownership/current-value contribution                                                                 | FR-029, FR-041, FR-047                       | `metal-detail-history-read-model.test.ts`                                                                    |
| US3-03 | Undo a terminal action, including an equal-time event                                                                         | The same holding is restored Active; reversal precedes the reversed event at equal time; original terminal evidence remains in its detail timeline                           | FR-040, FR-043, FR-098                       | `metal-detail-history-read-model.test.ts`                                                                    |
| US3-04 | Inspect a migrated holding missing exact weight, purity tuple, or purchase cost                                               | Holding remains visible; only dependent calculations are unavailable; correction requirement identifies every missing fact                                                   | FR-019, FR-057, FR-081                       | `metal-detail-history-read-model.test.ts`                                                                    |
| US3-05 | Browse global History with All, Sold, and Disposed filters                                                                    | Only current effective visible terminal holdings appear; rejected, incomplete, deleted-mistake, foreign, and reversed-terminal candidates do not                             | FR-037, FR-040, FR-063, FR-098               | `metal-detail-history-read-model.test.ts`                                                                    |
| US3-06 | Page a large timeline/history set                                                                                             | User-scoped read queries are bounded; loading the next page never changes ordering or includes a foreign row                                                                 | FR-061, FR-063, FR-098                       | `metal-detail-history-read-model.test.ts`                                                                    |
| US3-07 | Open a Sold holding with complete immutable sale evidence                                                                     | Exact net and gross proceeds, optional fee/notes, friendly profit or loss, acquisition/Sold story, and terminal History appear; active valuation and Physical facts do not   | #283, FR-029, FR-041, FR-047                 | `holding-detail-fidelity.test.tsx`; `holding-detail-history.yaml`                                            |
| US3-08 | Open a Sold holding whose realized result cannot be attributed                                                                | Exact gross/fee/net proceeds remain visible, while profit/loss uses friendly unavailable copy and never invents or substitutes a current-rate result                         | #283, FR-041, FR-057                         | `holding-detail-fidelity.test.tsx`; `metal-terminal-read-model-service.test.ts`                              |
| US3-09 | Open a Disposed holding for every supported disposal reason and treatment                                                     | Reason, date, optional note, no-sale meaning, no account change, acquisition/disposal story, and History appear; proceeds and profit/loss do not                             | #283, FR-029, FR-041                         | `metal-disposed-evidence-service.test.ts`; `holding-detail-fidelity.test.tsx`; `holding-detail-history.yaml` |
| US3-10 | Browse History containing trustworthy Sold and Disposed terminal evidence                                                     | Sold rows show exact net proceeds; Disposed rows show approved reason and `No sale proceeds`; date/status/identity remain visible and each row opens the matching detail     | #283, FR-037, FR-041                         | `MetalHistoryScreen.test.tsx`; `holding-detail-history.yaml`                                                 |
| US3-11 | Browse a terminal item whose immutable evidence is missing, malformed, foreign, rejected, reversed, duplicate, or ineffective | Untrusted facts fail closed: no amount/reason is invented; excluded items remain absent and visible items use friendly unavailable copy                                      | #283, FR-057, FR-063, FR-098                 | terminal evidence/read-model unit and integration suites; component fallback tests                           |
| US3-12 | Repeat Sold, Disposed, and History checks in Arabic/RTL, dark mode, compact/ordinary phone, tablet/landscape, and 200% text   | Approved hierarchy and every fact remain readable, correctly ordered, reachable, mirrored where directional, and free from overlap or horizontal scrolling                   | #283 responsive/RTL/accessibility acceptance | component breakpoint/i18n tests; manual device matrix                                                        |
| US3-13 | Use TalkBack/VoiceOver to traverse History filters/rows and terminal fact rows                                                | Filters expose tab selection and counts; rows expose status, identity, date, and terminal result; detail sections and actions have meaningful roles/labels and 44 px targets | #283 accessibility acceptance                | component accessibility assertions; manual screen-reader validation                                          |
| US3-14 | Load, retry, use offline data, and reach the bottom action region with gesture and 3-button navigation                        | Skeleton-only loading, friendly retry/offline state, stored terminal evidence, and bottom actions/content remain unobscured by system navigation                             | #283 state/safe-area acceptance              | component safe-area/state tests; manual device validation                                                    |

## Device matrix and evidence

Capture screens 15, 16, and 17 side-by-side with their approved PNG references
at an ordinary-phone portrait viewport. Repeat at compact phone, tablet
portrait, tablet landscape, Arabic RTL, dark mode, and 200% text. Record
platform, viewport, text scale, locale, theme, screenshot path, and any
intentional adaptive reflow.

The deterministic Maestro flow `metals/holding-detail-history.yaml` covers the
English/light ordinary-phone History → Sold detail → Disposed detail journey and
captures the three rendered states. The following remain manual-only because the
local runner cannot reliably control them in one flow: iOS VoiceOver, Android
TalkBack, physical-device font scaling, system 3-button navigation, tablet
window resizing/orientation, and visual overlay review for Arabic/dark adaptive
variants.
