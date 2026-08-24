# Tasks: Bounded Recurring Payments

**Input**: Design documents from `/specs/386-recurring-end-date/`  
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [UI contract](./contracts/recurring-payment-schedule.md), [quickstart.md](./quickstart.md)

**Tests**: Required. Follow TDD: add focused tests, run them red, implement minimum change, then rerun focused tests before broader validation.

**Organization**: Tasks grouped by independently testable user story.

## Phase 1: Setup

**Purpose**: Record approved product rules before implementation.

- [X] T001 Document inclusive End date, unpaid-overdue-final, overdue Pay Now, completion, and reactivation rules in `docs/business/business-decisions.md`
- [X] T002 [P] Add English strings for Due payment, End date, Not set, inline helper text, Clear, and end-date validation in `apps/mobile/locales/en/transactions.json`
- [X] T003 [P] Add equivalent Arabic strings in `apps/mobile/locales/ar/transactions.json`
- [X] T004 [P] Update recurring-payment translation contract in `apps/mobile/i18n/translation-schema.ts`

---

## Phase 2: Foundational

**Purpose**: Define safe null/date validation and command input before any UI story.

- [X] T005 Add red null/equal/before-date validation coverage in `apps/mobile/__tests__/validation/recurring-payment-validation.test.ts`
- [X] T006 Add red create/update End date persistence coverage in `apps/mobile/__tests__/services/recurring-payment-service.test.ts`
- [X] T007 Extend `apps/mobile/validation/recurring-payment-validation.ts` to validate `endDate: Date | null` against Due payment without empty-string sentinels
- [X] T008 Extend recurring-payment command input and create/update local persistence in `apps/mobile/services/recurring-payment-service.ts`
- [X] T009 Run focused foundational validation and service tests from `apps/mobile/__tests__/validation/recurring-payment-validation.test.ts` and `apps/mobile/__tests__/services/recurring-payment-service.test.ts`

**Checkpoint**: End date is typed, localized, validated, and persisted locally; no migration is introduced.

---

## Phase 3: User Story 1 - Set a final due date (Priority: P1) MVP

**Goal**: User creates ongoing or fixed-term recurring payment with valid optional End date.

**Independent Test**: Create with End date unset, equal to Due payment, later than Due payment, and before Due payment; verify correct saved result or blocked save.

- [X] T010 [P] [US1] Add creation-route End date mapping tests in `apps/mobile/__tests__/app/recurring-payment-header-actions.test.tsx`
- [X] T011 [P] [US1] Add create-form End date initial-state, picker minimum, and helper-text tests in `apps/mobile/__tests__/components/recurring-payments/RecurringPaymentForm.test.tsx`
- [X] T012 [US1] Add `endDate: Date | null` form state, dedicated picker state, and grouped End date row in `apps/mobile/components/recurring-payments/RecurringPaymentForm.tsx`
- [X] T013 [US1] Map form End date through creation in `apps/mobile/app/(private)/create-recurring-payment.tsx`
- [X] T014 [US1] Run P1 focused form, route, validation, and service tests in `apps/mobile/__tests__/components/recurring-payments/RecurringPaymentForm.test.tsx`, `apps/mobile/__tests__/app/recurring-payment-header-actions.test.tsx`, `apps/mobile/__tests__/validation/recurring-payment-validation.test.ts`, and `apps/mobile/__tests__/services/recurring-payment-service.test.ts`

**Checkpoint**: New recurring payments can be ongoing or bounded; invalid boundary cannot save.

---

## Phase 4: User Story 2 - Understand and edit payment dates (Priority: P2)

**Goal**: User understands Due payment and End date, edits/clears End date, and preserves approved Payment Schedule design.

**Independent Test**: Open existing bounded and ongoing payment; verify labels, inline helper copy, Not set state, Clear action, save, reopen, and confirm data state.

- [X] T015 [P] [US2] Add edit-route End date load/save/clear tests in `apps/mobile/__tests__/app/recurring-payment-header-actions.test.tsx`
- [X] T016 [P] [US2] Add grouped-row design, Due payment rename, inline helper, and Clear tests in `apps/mobile/__tests__/components/recurring-payments/RecurringPaymentForm.test.tsx`
- [X] T017 [US2] Update Payment Schedule date rows, inline helper copy, selected-End-date Clear behavior, and dark-mode styling in `apps/mobile/components/recurring-payments/RecurringPaymentForm.tsx`
- [X] T018 [US2] Map existing End date into and out of edit form values in `apps/mobile/app/(private)/edit-recurring-payment.tsx`
- [X] T019 [US2] Run P2 focused route and form tests in `apps/mobile/__tests__/app/recurring-payment-header-actions.test.tsx` and `apps/mobile/__tests__/components/recurring-payments/RecurringPaymentForm.test.tsx`

**Checkpoint**: Existing series can show, set, replace, or clear End date without a new form surface.

---

## Phase 5: User Story 3 - Finish a bounded series (Priority: P3)

**Goal**: Successful final payment completes a bounded series; unpaid final occurrence remains visible and overdue.

**Independent Test**: Pay a final on-time or overdue eligible occurrence and verify one financial result plus completed series; induce failure and verify no partial state.

- [X] T020 [P] [US3] Add final-on-boundary, unpaid-overdue, overdue-Pay-Now, and end-date-completion reactivation tests (extend, Clear, and still-invalid next due date) in `apps/mobile/__tests__/services/recurring-payment-service.test.ts`
- [X] T021 [P] [US3] Add atomic final-payment rollback and completion integration tests in `apps/mobile/__tests__/services/recurring-payment-atomicity.integration.test.ts`
- [X] T022 [US3] Extend atomic schedule update to complete only after successful final eligible payment in `apps/mobile/services/recurring-payment-service.ts`
- [X] T023 [US3] Extend End date edit behavior to reactivate only end-date-completed eligible series in `apps/mobile/services/recurring-payment-service.ts`
- [X] T024 [US3] Ensure active/overdue display behavior remains correct for unpaid final occurrences in `apps/mobile/components/recurring-payments/RecurringPaymentsDashboard.tsx`
- [X] T025 [US3] Add focused dashboard state coverage for unpaid overdue and completed final series in `apps/mobile/__tests__/app/recurring-payments-style.test.tsx`
- [X] T026 [US3] Run P3 focused service, atomic integration, and dashboard tests in `apps/mobile/__tests__/services/recurring-payment-service.test.ts`, `apps/mobile/__tests__/services/recurring-payment-atomicity.integration.test.ts`, and `apps/mobile/__tests__/app/recurring-payments-style.test.tsx`

**Checkpoint**: Final payment is atomic and completes series; unpaid final bill is never silently hidden.

---

## Phase 6: Polish and cross-cutting validation

**Purpose**: Validate approved design, local-first behavior, localization, and regression safety.

- [X] T027 [P] Verify English and Arabic recurring-payment copy, including RTL helper-text layout, in `apps/mobile/locales/en/transactions.json` and `apps/mobile/locales/ar/transactions.json`
- [X] T028 [P] Update bounded recurring-payment Maestro flow in `apps/mobile/e2e/maestro/recurring-payments/recurring-payments-crud-actions.yaml`
- [X] T029 Run mobile typecheck, lint, and affected recurring-payment Jest suites from `apps/mobile/package.json`
- [ ] T030 Run manual device QA from `specs/386-recurring-end-date/quickstart.md`; confirm automatic processing is not present and do not claim scheduler coverage
- [X] T031 Reconcile implementation with owner-approved selected-End-date-with-Clear state recorded in `specs/386-recurring-end-date/mockups/README.md` and `specs/386-recurring-end-date/contracts/recurring-payment-schedule.md`

## Phase 7: Explicit completed-series reactivation

**Purpose**: Make reactivation a deliberate user action and prevent impossible due dates from being presented.

- [X] T032 Update feature and business-rule documentation for explicit reactivation, invalid Due payment after End date, and valid one-occurrence schedules.
- [X] T033 Add red service, form, dashboard, route, and pure date-calculation tests for explicit reactivation and post-boundary previews.
- [X] T034 Keep completed series completed on ordinary edits; add eligibility-checked dashboard and save-time reactivation commands.
- [X] T035 Add the approved My Bills Reactivate confirmation and edit-form Reactivate after saving checkbox.
- [X] T036 Show immediate Due payment/End date guidance and explain valid schedules with no further eligible recurrence.
- [X] T037 Run focused Jest suites, TypeScript checks, and changed-file lint.
- [ ] T038 Run the expanded manual device QA in `quickstart.md`; do not push until the owner confirms the visual behaviour.

## Dependencies & Execution Order

- Phase 1 must finish before code changes so business and translation decisions are available.
- Phase 2 blocks all user stories.
- US1 creates shared End date capability.
- US2 depends on US1 form state and persistence.
- US3 depends on US1 persistence; it can begin after Phase 2 only if it avoids concurrent edits to `apps/mobile/services/recurring-payment-service.ts`.
- Phase 6 follows all implemented stories.

## Parallel Opportunities

- T002, T003, and T004 can run together.
- T010 and T011 can run together; T015 and T016 can run together; T020 and T021 can run together.
- T027 and T028 can run together after user-story completion.
- Do not parallelize tasks touching `apps/mobile/components/recurring-payments/RecurringPaymentForm.tsx`, `apps/mobile/services/recurring-payment-service.ts`, or `apps/mobile/__tests__/app/recurring-payment-header-actions.test.tsx`.

## Implementation Strategy

### MVP

1. Complete Phases 1 and 2.
2. Complete US1.
3. Validate ongoing, bounded, equal-date, and invalid-boundary creation before expanding edit and completion behavior.

### Incremental Delivery

1. US1: creation and persistence.
2. US2: approved form guidance, edit, and Clear.
3. US3: final-payment completion and overdue handling.
4. Cross-cutting validation and device QA.
