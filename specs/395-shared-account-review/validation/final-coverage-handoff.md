# #395 final coverage handoff — documentation reconciliation

**Date:** 2026-10-17. **Status:** documentary handoff, not feature acceptance.
**Sole parent:** `64f0ef48640ecbe51979030151fa78141778bcf9`, the mechanical
snapshot of current Main planning/business documents, itself parented by
`0ce3ea24dee023ec5eb72b7e507b519fc725dfd8`.

## Authority and exact scope

Only `plan.md`, `data-model.md`, `contracts/review-commands.md` and this new
validation note are changed. The approved edit appendix at
`82956da878f778622428a7ee6739f1729681d9a3` and
`0ce3ea24dee023ec5eb72b7e507b519fc725dfd8` has the same review-command blob
`61637557bce050c0b24082bbca8dc3e4e1fc30c6`. Its semantics are restored onto
Main, not used to replace later Main wholesale. The pure candidate
`eefc68e502c49475195b61ba0eb5f8d8207ddbb6` and later `0ce3ea24`
service/hook/editor intake are distinguished from the original missing-command
proposal and from final verification. This task is not a new source review.

`tasks.md` remains blob `fcf20ab43bd7c8f2b06ec339d46a707862f88946` from the
parent: all original 80 IDs and 32 accepted entries remain unchanged. T030/T054
annotations are in the owned plan/contract only. Root alone updates acceptance
and `workflow-status.md` after verification. Spec/B1/images/sidecars, business
decisions, financial/private contracts, locales, code, migrations, workflows and
skills are not edited. Trusted governance remains
`c02a773613f9b6ebc5ca01aae02dd41863fd0e90` plus the separately approved
Constitution 1.8.0 policy, not mutable worker output.

Main's frozenIntentDigest, original-selected versus post-dedup planning,
first-active Review default by frozen actual create UUID, independent
multi-currency Voice Cash, absent-only ATM destination fallback, existing legacy
identity rules and device-private storage/retention remain intact. No new
financial/public/private field, Add evidence GC, provider call, durable Voice
state or product behavior follows from the local edit command.

## Current execution report — supplied by Root, not rerun here

| Boundary           | Root-reported evidence                                          | Remaining interpretation / gate                                                                                                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local SQL batch    | 737/737 PASS, including 125 canonical-default outcome cases     | Local batch evidence only; not hosted deployment, complete mobile/sync safety or new acceptance checkmarks. This author did not reapprove its own SQL/harness.                                                                                                   |
| Installed SDK seam | 10/10 PASS plus actual postinstall and idempotency              | SDK installation evidence does not clear application-side protected push/pull/ACK or deferred recovery. No patcher/test was executed by this author.                                                                                                             |
| Shared logic       | 2165/2168 PASS                                                  | Two malformed L2 parameterization cases are being corrected by owner40. The unchanged performance-threshold case awaits a rerun without concurrent load. Neither is silently waived, reclassified as passed, or fixed by changing product rules/thresholds here. |
| Edge generation    | Routine regeneration required after final source formatting     | Root must regenerate the canonical artifacts and establish final parity; earlier parity is not evidence for unregenerated final source.                                                                                                                          |
| Deno harness       | Missing explicit function configuration; Root correcting runner | Harness/configuration admission must be established before interpreting remaining Deno results as product behavior. No Deno run here.                                                                                                                            |
| Sync/Add           | Remaining repairs and final independent checks unresolved       | Retain dirty-member coverage, accepted-pull echo, terminal/private/replay, deferred original identity and legitimate later Edit obligations. No feature Green.                                                                                                   |

No immutable final integrated execution pin or batch log is asserted by this
note. Root must attach the actual final source/configuration and result
artifacts to its acceptance ledger; these supplied aggregate results are not
transplanted onto the documentation parent as if that exact checkout was
executed.

### Later execution/authoring reconciliation at current parent

Root separately reports local SQL **737/737 PASS** and installed SDK seam
**10/10 PASS**, plus corrected previously failing logic cases now passing. These
are Root's local batch reports, not execution at the current authored YAML
checkout. Mobile final types/lint, full combined logic/performance/Edge+Deno,
Add/sync/Review final gates and both new Maestro scripts remain **PENDING/NOT
RUN**. No feature-wide Green, new 80-task checkmark, hosted SQL or device
evidence is implied.

## Deterministic suite routing for M01–M20

Scenario meanings remain those in `manual-test-plan.md`; none is narrowed. The
table is a source-backed routing index to existing suite files, not a new
assertion-by-assertion audit or claim that every scenario/variant passed. Suite
filenames and available trees were inspected at the documentation parent; later
owner fixes need final integrated execution. Old TESTS FIRST comments inside
existing tests are historical, not proof of current missing source.

Exact repository-relative prefixes used below:

- **L/** = `packages/logic/src/account-review/__tests__/`
- **S/** = `apps/mobile/__tests__/services/`
- **C/** = `apps/mobile/__tests__/components/`
- **H/** = `apps/mobile/__tests__/hooks/`
- **V2** =
  `packages/logic/src/sms-review-drafts/__tests__/account-review-v2-codec.test.ts`

**E0**: no currently authorized Maestro route; suite and owner/manual evidence
only. **E1**: `apps/mobile/e2e/maestro/account-review/conditional-states.yaml`
(existing Voice conditional/filter/editor journey). **E2**:
`apps/mobile/e2e/maestro/account-review/default-account.yaml` (new genuine Voice
default-only/Why/editor-cancel journey). **E3**:
`apps/mobile/e2e/maestro/account-review/shared-suggestions.yaml` (new Voice
QNB/CIB confirm, one-row check and actual remove/undo). **E4**:
`apps/mobile/e2e/maestro/account-review/choose-account-currency.yaml` (existing
Voice account chooser/cancel). **A1**:
`apps/mobile/e2e/maestro/accounts/account-default-intent.yaml` (existing Add
intent). Every E/A entry means **AUTHORED, NOT RUN**; no SMS scene is allowed
through the Voice fixture route. All deterministic suite names below remain
inspectable evidence targets, not claims of PASS.

| ID  | Existing deterministic suite targets                                                                                                                                                                                                                                                      | Authored E2E / unresolved owner evidence                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01 | L/resolution.test.ts; C/account-review-default-info.test.tsx; C/account-review-transaction-item.test.tsx                                                                                                                                                                                  | E2 default-only Cash disclosure/Why and controlled editor Cancel; E1 default partial. Authored NOT RUN; real Voice parse/financial Save owner-only.            |
| M02 | L/resolution.test.ts; L/normalization-safety.test.ts; L/review-logic-boundaries.test.ts                                                                                                                                                                                                   | E0: source/type/currency SMS eligibility remains controlled service/logic; no SMS Maestro or implied Cash SMS default.                                         |
| M03 | L/schemas.test.ts; L/normalization-safety.test.ts; S/account-review-parser-adapters.test.ts                                                                                                                                                                                               | E0: exact omitted/conflicting currency schema/service tests; real provider/device interpretation NOT RUN.                                                      |
| M04 | L/shared-groups.test.ts; C/shared-account-suggestions.test.tsx; S/account-review-command-service.sqlite.integration.test.ts                                                                                                                                                               | E3: QNB3 confirm while CIB1 stays pending, selected count stays 2; Voice-authored NOT RUN, no Save/new account claim.                                          |
| M05 | L/shared-groups.test.ts; C/shared-account-suggestions.test.tsx; S/account-review-command-service.sqlite.integration.test.ts                                                                                                                                                               | E3: first eligible QNB row explicit checkbox and selected count 2→3; Voice-authored NOT RUN; selected financial Save still SQLite/owner.                       |
| M06 | L/shared-groups.test.ts; L/account-choices-guards.test.ts; C/shared-account-suggestions.test.tsx                                                                                                                                                                                          | E0: actual identity edit/card/type/currency re-confirmation remains service/component/owner; no broad E2E identity claim.                                      |
| M07 | L/account-choices.test.ts; L/account-choices-guards.test.ts; C/account-review-choices.test.tsx                                                                                                                                                                                            | E4: real row/group chooser/cancel via Voice test-only route, authored NOT RUN; stale candidate/a11y owner.                                                     |
| M08 | L/shared-groups.test.ts; S/account-review-undo-lifecycle.sqlite.integration.test.ts; H/useAccountReview.identity-lifecycle.test.tsx                                                                                                                                                       | E3: actual Voice QNB Remove→Undo while transient lease active; authored NOT RUN. SMS later-edit/restart needs real SQLite and owner.                           |
| M09 | L/account-choices.test.ts; C/account-review-choices.test.tsx                                                                                                                                                                                                                              | E0: CurrencyPicker explicit acceptance/cancel and numeric amount remain component/unit and owner keyboard; E4 is account chooser, not an SMS currency journey. |
| M10 | L/read-model.test.ts; C/account-review-panel.test.tsx; H/useAccountReview.read-model.test.tsx                                                                                                                                                                                             | E1+E2+E3: Voice combined, default-only, clean, selected-empty, groups/counts only; authored NOT RUN. SMS issues-only and physical variants owner.              |
| M11 | L/read-model.test.ts; L/filter-transitions.test.ts; S/account-review-filter.sqlite.integration.test.ts                                                                                                                                                                                    | E1+E3: selected-filter and explicit single checkbox/count authored NOT RUN; active-filter selected financial Save remains SQLite/owner.                        |
| M12 | S/account-default-intent.test.ts; S/account-default-intent-atomic.sqlite.integration.test.ts; C/account-default-intent-form.test.tsx                                                                                                                                                      | A1: existing Add account-default-intent.yaml, authored NOT RUN; first/later/cancel/failure and physical sole-default checks SQLite/owner.                      |
| M13 | S/account-review-save-service.test.ts; S/account-review-save-service.sqlite.integration.test.ts; S/account-review-save-intent.sqlite.integration.test.ts                                                                                                                                  | E0: neither new flow taps Save. Only actual selected Save SQLite/owned writer and owner observable financial results.                                          |
| M14 | S/account-review-save-boundaries.sqlite.integration.test.ts; S/account-review-save-intent.sqlite.integration.test.ts; S/account-review-save-service.sqlite.integration.test.ts                                                                                                            | E0: genuine adapter-fault/repeat/idempotency SQLite/SQL, NOT Maestro; do not create synthetic save-recovery.yaml.                                              |
| M15 | V2; S/account-review-legacy-bootstrap.sqlite.integration.test.ts; S/account-review-durable-recovery.sqlite.integration.test.ts; S/account-review-all-dedup-recovery.sqlite.integration.test.ts                                                                                            | E0: SMS V2 owner namespace/restart proven by service/SQLite scope, NOT SMS Maestro; Voice exit remains session-only, owner physical restart NOT RUN.           |
| M16 | S/account-review-source-adapter-service.test.ts; S/account-review-parser-adapters.test.ts; S/account-review-parser-voice.test.ts; S/account-review-read-model-service.test.ts                                                                                                             | E0: no provider/mic/SMS request in Voice scene. Call-count ownership suite evidence and configured provider owner sample separate.                             |
| M17 | C/account-review-panel.test.tsx; C/account-review-nativewind-safety.test.ts; C/account-review-choices.test.tsx; H/useAccountReviewEditorCategories.test.tsx                                                                                                                               | E1/E2/E3/E4/A1 do not prove physical theme/RTL/font/inset/keyboard/screen reader. All owner visual/TalkBack/VoiceOver checks NOT RUN.                          |
| M18 | C/account-default-intent-form.test.tsx; H/useAccountForm.test.ts; H/useEditAccountForm.test.ts; S/account-default-intent-atomic.sqlite.integration.test.ts                                                                                                                                | A1 + Add/Edit form/service regression; bank/wallet/cash, provider/card/sender/balance physical owner checks NOT RUN.                                           |
| M19 | S/account-review-save-service.sqlite.integration.test.ts; S/account-review-save-boundaries.sqlite.integration.test.ts; S/account-review-default-dependencies.sqlite.integration.test.ts; S/account-default-intent-sync-recovery.sqlite.integration.test.ts; S/account-review-sync.test.ts | E0: no synthetic financial Save/rollback. Actual SQLite/pgTAP/SDK per Root, integrated sync/ACK/recovery and owner offline/restart pending.                    |
| M20 | L/schemas.test.ts; L/normalization-safety.test.ts; L/review-logic-boundaries.test.ts; V2; S/account-review-legacy-transitions.sqlite.integration.test.ts; S/account-review-parser-adapters.test.ts                                                                                        | E0: canonical v1/v2, late chunks/provider migration and schema parity in listed suites; no real provider or SMS durable E2E claim.                             |

### Transaction-edit supplement within existing M14–M18/M20 and T030/T054

Existing deterministic targets are:

- L/transaction-edit-preservation.test.ts;
- S/account-review-transaction-edit.sqlite.integration.test.ts;
- S/account-review-transaction-edit-category-service.test.ts;
- H/useAccountReviewEditorCategories.test.tsx;
- H/useAccountReview.cancellation.sqlite.integration.test.tsx.

These preserve strict source-specific fields, current category authority,
amount/decimal/currency consistency, immutable evidence/date/transcript,
row/session/business CAS, no-op and rejected edits, original selection/reasons,
actual V2 persistence and queued-writer cancellation. The controlled-editor
candidate at `0ce3ea24` also needs its focused presentation/lifecycle tests in
Root's final batch. A pure PASS does not establish the SMS writer, Voice
lifecycle, pending dismissal or real-device keyboard behavior. No task ID or
scenario is added by this supplement.

## Authored E2E: exact CURRENT source boundary at c51a80bd

The current parent tree includes the implemented test-only VOICE scene entry in
`apps/mobile/app/(private)/voice-review.tsx`. It accepts the allowlisted
`reviewFixtureSceneId` only through the nonproduction/current-owner gated
`loadAccountReviewFixtureSession`, validates a canonical VOICE session, and
keeps existing typed commands and real save-writer callback. The route consumes
scene IDs only, never serialized financial object deep links.
`apps/mobile/__tests__/e2e/account-review-maestro-entry.test.ts` contains static
entry assertions; those are NOT a device or YAML syntax run.

Authored account-review Maestro paths (all **NOT RUN**):
`conditional-states.yaml` (existing E1), `choose-account-currency.yaml`
(existing E4), `default-account.yaml` (new E2) and `shared-suggestions.yaml`
(new E3). New E2 exercises the verified R3-07 quiet default disclosure/Why
sheet/Cancel/readiness surfaces; new E3 exercises QNB3 group confirmation
independent of CIB1, a real selected checkbox, selection/count disclosure and
the same-session Remove→Undo command/lease before later edits invalidate it.
Neither taps `review-save-button`. All entries require
`E2E_FIXTURE_PROFILE=account-review`, `E2E_SUPABASE_MODE=local`,
`EXPO_PUBLIC_MONYVI_TEST_MODE=e2e`, nonproduction app, authenticated exact
current-owner five role accounts/active Other category and an English locale for
authored English copy assertions.

The separate existing
`apps/mobile/e2e/maestro/accounts/account-default-intent.yaml` is the true A1
Add-intent journey; do not duplicate it as
`account-review/add-default-account.yaml`. Neither a fake
`account-review/save-recovery.yaml` nor an SMS route with a Voice scene is
authored. Actual M14 adapter faults/replay and M15 SMS V2 owner restart remain
in real service/SQLite checks, with physical offline/app restart owner-only. No
hosted seed/reset, real microphone/provider, live financial Save or resulting
ledger effect is inferred from fixture visibility.

## Remaining questions and reconciliation limits

1. **Safe fixture entry:** the current Main VOICE route and T015 service now
   implement a production-disabled, authenticated/current-owner scene-ID entry,
   statically inspectable at this parent. Maestro compilation, on-device
   mounting and the approved role fixture are NOT RUN, and this does not
   authorize a live SMS scene or a financial Save fixture bypass.
2. **Final evidence pin:** which integrated source and explicit Deno function
   configuration produced the final cohesive results after outstanding sync/Add
   repairs, the two L2 parameterizations, isolated performance rerun and Edge
   regeneration? Root must bind those artifacts before acceptance.
3. **Historical SQL names outside this lease:** `contracts/financial-save.md`
   still uses `090_review_batch_save.sql` /
   `091_account_create_default_intent.sql` in its reservation paragraph; T069 in
   unchanged `tasks.md` also retains the old 091 basename. The actual names are
   `090_shared_account_review_save.sql` and `091_account_create_default.sql`.
   Owned plan/model references now use those actual names. Remaining name-only
   edits need the respective owner; no duplicate migration, contract change or
   task rewrite is made here.

No unanswered product rule is resolved by changing behavior. Main's later
financial/default/private/legacy rules take precedence over older worker prose;
any newly discovered semantic contradiction must be brought back to Root, not
hidden by replacing business-decisions or loosening assertions.

## Release boundary

Source candidates and scoped reviews remain distinct from final acceptance.
Owner-only rendered comparisons, actual RTL/focus/announcements, TalkBack and
VoiceOver speech, OS keyboard/insets, interrupted device lifecycle and real
configured-provider interpretation remain unexecuted unless Root separately
records the corresponding evidence. Generated parity and ordinary regression
coverage are necessary but do not substitute for those owner observations.

This documentation author ran no commands, tests, formatters, generation,
SQL/SQLite, providers, native/device/emulator or hosted operations. Publication
is limited to changed-only unreferenced GitData documentation objects; no refs,
push or PR changes. No feature Green, deployment readiness or acceptance
checkmarks are claimed. Documentation ownership releases after delivery.
