# US4: Edit a holding or correct active facts

Owner: Slice 7 Add/Edit  
Requirements: FR-018–FR-021, FR-086, FR-088–FR-090  
Success criteria: SC-003, SC-005, SC-010, SC-011, SC-015, SC-016, SC-021,
SC-024, SC-026  
Automated counterparts: `metals-edit.test.tsx`,
`useEditMetalHolding.test.tsx`,
`edit-metal-holding-command-service.integration.test.ts`,
`metal-holding-facades.integration.test.ts`,
`metal-holding-legacy-edit.integration.test.ts`, and
`e2e/maestro/metals/edit-holding.yaml`.

## Evidence boundary

Recorded implementation head: `c6a371974662ef60cd44eccd9ad53e03f1ffcf1b`.

- Hosted Code Quality & Tests, Financial Action pgTAP, and Android Build
  Verification passed on that head. Android E2E was skipped.
- Recorded focused counts include Edit route 18/18, Edit command 11/11, Edit
  preview 4/4, facade integration 9/9, and legacy Edit 2/2.
- `edit-holding.yaml` is authored but has not run. Physical-device/manual QA
  and explicit whole-fact CAS, rollback, restart, and multi-device proof remain
  open.
- This document does not claim a new local run.

## Preconditions

- Use disposable active Gold and Silver holdings with exact catalog, weight,
  purchase-price, purchase-date, and acquisition-rate facts.
- Prepare Sold, Disposed, hidden-deleted, preserved-legacy-null, and
  `reconciliation_incomplete` fixtures.
- Prepare fresh, stale, unknown, missing, and offline rate fixtures.
- Use English and Arabic app language fixtures. Editable financial input uses
  Latin digits and `.` in both languages.

## Scenario matrix

| ID | Steps | Expected observable result | Evidence status |
| --- | --- | --- | --- |
| US4-M01 | Edit an active holding's name and Arabic notes only, then save | Same form saves directly with no reason, financial action, or History correction | Automated pass recorded; Maestro/device pending |
| US4-M02 | Correct weight, purity, physical form, total purchase price, currency, and date separately, then in one combined edit | Metal stays locked; previous/current facts and user-facing purity labels appear; reason is required; one immutable correction and affected consequence summary are produced | Automated pass recorded; Maestro/device pending |
| US4-M03 | Change only Physical form on a holding whose stored decimals contain trailing zeros | Previous/current form appears; valuation is unchanged; stored weight/price strings are preserved and no false stale-rate requirement is introduced | Automated pass recorded; manual pending |
| US4-M04 | Change material facts, then restore all material fields while retaining Name/Notes edits | Material cues, reason, and consequence summary disappear; ordinary metadata Save remains available | Automated pass recorded; Maestro/device pending |
| US4-M05 | Open Sold, Disposed, hidden-deleted, and foreign/deleted deep-link fixtures | Sold/Disposed allow only metadata; hidden/foreign/deleted holdings show a safe load/retry error and cannot be materially corrected | Automated pass recorded; seeded device cases pending |
| US4-M06 | Open a `reconciliation_incomplete` holding, then test missing reason, invalid facts, unusual facts, stale/offline rates, and injected writer failure | Recovery state is visible before editing; material correction is locked while incomplete; other errors are focusable; no partial record is written and retry is explicit | Automated pass recorded; device pending |
| US4-M07 | Replay the same correction, restart between preparation and retry, and race two devices from the same revision | Same action is idempotent; one whole-fact correction wins; loser remains recovery-visible; no field merge occurs | Partial automated evidence; explicit CAS/rollback/restart/multi-device proof pending |
| US4-M08 | Exercise EN/AR, light/dark, compact/ordinary/tablet/landscape, 200% text, keyboard, screen reader, safe areas, header/Cancel/hardware/gesture exit | Shared order remains; active compact 320px RTL 200% row stacks; focus, labels, dirty exit, and Save stay reachable | UI automation recorded; Maestro/device pending |

## Review-fix spot checks

1. Open an active holding at 320px width, Arabic RTL, and 200% text. Confirm the
   Weight/Purity row stacks and stays operable; repeat on a Sold holding and
   confirm material controls are absent.
2. Change purity and confirm Before/Now plus What will change use labels such as
   `24K · 999`, never `gold-999`.
3. Change only Physical form on facts stored as `10.000` and `47800.00`.
   Save and reopen; confirm those unchanged financial facts were not rewritten
   or treated as a financial correction.
4. Open a `reconciliation_incomplete` fixture. Confirm the recovery state is
   shown before input and material correction cannot be submitted.
5. Open the hidden-deleted fixture through a direct link. Confirm no correction
   can be saved and retry does not expose the hidden holding.
6. Make the form dirty and try header Back, Cancel, Android hardware Back, and
   iOS gesture. Confirm each shows the same decision and Discard exits.
7. Trigger a load failure, use Retry, and confirm the blank editable form is
   never shown as though loading succeeded.
8. In the authored Maestro correction path, confirm the changed weight is
   asserted in the What will change summary; no nonexistent
   `metal-holding-weight-current` element is required.

## Manual-only record

Record build/head, fixture, device and OS, locale/direction, theme, font scale,
viewport/orientation, navigation mode, network/rate state, steps, screenshots
or video, and Pass/Fail/Blocked. Native assistive technology, device layout,
Maestro, whole-fact CAS, rollback/restart, and multi-device observations remain
open until actually executed.
