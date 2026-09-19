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

| ID     | Scenario                                                                                                                    | Expected result                                                                                                                                                                                                                                             | Requirements                                 | Automation                                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| US3-01 | Open an effective Active Gold or Silver holding                                                                             | Identity, exact facts, current value and available since-purchase attribution reflect only accepted lifecycle evidence                                                                                                                                      | FR-016, FR-047, FR-081, FR-084               | `metal-detail-history-read-model.test.ts`                                                                    |
| US3-02 | Open a Sold or Disposed holding                                                                                             | Terminal status and permanent timeline remain visible; it has no active-ownership/current-value contribution                                                                                                                                                | FR-029, FR-041, FR-047                       | `metal-detail-history-read-model.test.ts`                                                                    |
| US3-03 | Inspect a seeded holding with existing reversal evidence, including an equal-time event                                     | The same holding is Active; reversal precedes the reversed event at equal time; original terminal evidence remains in its detail timeline; no Undo command is executed                                                                                      | FR-040, FR-043, FR-098                       | `metal-detail-history-read-model.test.ts`                                                                    |
| US3-04 | Inspect a migrated holding missing exact weight, purity tuple, or purchase cost                                             | Holding remains visible; only dependent calculations are unavailable; correction requirement identifies every missing fact                                                                                                                                  | FR-019, FR-057, FR-081                       | `metal-detail-history-read-model.test.ts`                                                                    |
| US3-05 | Browse global History with All, Sold, and Disposed filters                                                                  | Only current effective visible terminal holdings appear; rejected, incomplete, deleted-mistake, foreign, and reversed-terminal candidates do not                                                                                                            | FR-037, FR-040, FR-063, FR-098               | `metal-detail-history-read-model.test.ts`                                                                    |
| US3-06 | Page a large timeline/history set                                                                                           | User-scoped read queries are bounded; loading the next page never changes ordering or includes a foreign row                                                                                                                                                | FR-061, FR-063, FR-098                       | `metal-detail-history-read-model.test.ts`                                                                    |
| US3-07 | Open a Sold holding with complete immutable sale evidence                                                                   | Exact net and gross proceeds, optional fee/notes, friendly profit or loss, acquisition/Sold story, and terminal History appear; active valuation and Physical facts do not                                                                                  | #283, FR-029, FR-041, FR-047                 | `holding-detail-fidelity.test.tsx`; `holding-detail-history.yaml`                                            |
| US3-08 | Open a Sold holding whose realized result cannot be attributed                                                              | Exact gross/fee/net proceeds remain visible, while profit/loss uses friendly unavailable copy and never invents or substitutes a current-rate result                                                                                                        | #283, FR-041, FR-057                         | `holding-detail-fidelity.test.tsx`; `metal-terminal-read-model-service.test.ts`                              |
| US3-09 | Open a Disposed holding for every supported disposal reason and treatment                                                   | Reason, date, optional note, no-sale meaning, no account change, acquisition/disposal story, and History appear; proceeds and profit/loss do not                                                                                                            | #283, FR-029, FR-041                         | `metal-disposed-evidence-service.test.ts`; `holding-detail-fidelity.test.tsx`; `holding-detail-history.yaml` |
| US3-10 | Browse History containing trustworthy Sold and Disposed terminal evidence                                                   | Sold rows show exact net proceeds; Disposed rows show approved reason and `No sale proceeds`; date/status/identity remain visible and each row opens the matching detail                                                                                    | #283, FR-037, FR-041                         | `MetalHistoryScreen.test.tsx`; `holding-detail-history.yaml`                                                 |
| US3-11 | Inspect seeded terminal items and run evidence-validation tests for malformed or missing immutable action evidence          | Invalid terminal evidence is excluded from normal History; direct detail retains independent acquisition facts with unavailable terminal copy. Missing optional attribution alone preserves valid History rows and proceeds. Do not corrupt real user data. | #283, FR-057, FR-063, FR-098                 | terminal evidence/read-model unit and integration suites; component fallback tests                           |
| US3-12 | Repeat Sold, Disposed, and History checks in Arabic/RTL, dark mode, compact/ordinary phone, tablet/landscape, and 200% text | Approved hierarchy and every fact remain readable, correctly ordered, reachable, mirrored where directional, and free from overlap or horizontal scrolling                                                                                                  | #283 responsive/RTL/accessibility acceptance | component breakpoint/i18n tests; manual device matrix                                                        |
| US3-13 | Use TalkBack/VoiceOver to traverse History filters/rows and terminal fact rows                                              | Filters expose tab selection and counts; rows expose status, identity, date, and terminal result; detail sections and actions have meaningful roles/labels and 44 px targets                                                                                | #283 accessibility acceptance                | component accessibility assertions; manual screen-reader validation                                          |
| US3-14 | Load, retry, use offline data, and reach the bottom action region with gesture and 3-button navigation                      | Skeleton-only loading, friendly retry/offline state, stored terminal evidence, and bottom actions/content remain unobscured by system navigation                                                                                                            | #283 state/safe-area acceptance              | component safe-area/state tests; manual device validation                                                    |

## Device matrix and evidence

### Review follow-up: consumed display FX trust

- With a Sold holding whose purchase currency differs from preferred currency,
  inspect the result while its calculation disclosure is collapsed. Each
  actually consumed non-USD display currency must show its current trust status
  and provider update date/time when known. Stale/unknown valid FX remains
  calculable; do not confuse this display conversion with historical sale rates.
- Expand/collapse the calculation disclosure: result and FX trust stay visible.
  Same-currency display must not show unrelated metal/FX warnings.
  Missing/invalid required FX keeps proceeds visible and marks only converted
  result unavailable.
- Use existing deterministic manual-QA Sold fixture in English with EGP
  preferred: confirm `EGP 5,500.00 profit from this sale`; expand and confirm
  the breakdown-unavailable explanation. Empty terminal snapshots do not erase
  this exact same-currency combined result.
- Automated: sold evidence duplicate-key regression; terminal display trust
  scenarios; holding-detail fidelity; timezone boundary under UTC/Cairo/UTC+14.
  Maestro assertions updated; device execution remains outstanding.

### PR #315 review regression checks

Use existing seeded Sold/Disposed holdings; do not execute Sell, Dispose, or
Undo.

- Open a Sold holding, expand **How this value was calculated**, then collapse
  it. Combined profit/loss remains visible. With complete historical evidence,
  all five components appear; otherwise the friendly breakdown-unavailable
  message appears. Never replace missing historical evidence with current rates.
- Change preferred display currency in Settings and reopen the same Sold
  holding. Profit/loss and available components use one current FX snapshot.
  Recorded gross/fee/net proceeds stay in sale currency. If required current FX
  is missing, only converted profit/loss is unavailable; acquisition and sale
  facts remain.
- For a seeded backdated Sale/Dispose, compare the History row and holding
  story: both display the recorded sale/disposal calendar date, including Arabic
  and screen-reader labels, not the later action-recording timestamp.
- Reconciled canonical disposal, malformed/duplicate event JSON, missing
  terminal action evidence, and invalid display FX are deterministic
  service/integration tests, not commands to corrupt a tester's real data. Their
  coverage lives in `metal-disposed-evidence-service.test.ts`,
  `metal-terminal-read-model-integration.test.ts`, and
  `metal-terminal-display-service.test.ts`.
- Missing terminal evidence must preserve known acquisition date and amount on
  detail, but must not create a normal History row. Component and integration
  fixtures cover this unavailable-evidence state without destructive QA setup.

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
