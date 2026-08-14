# Feature Specification: Bounded Recurring Payments

**Feature Branch**: `386-recurring-end-date`  
**Created**: 2026-08-14  
**Status**: Draft  
**Input**: User description: "Allow users to set an optional end date for recurring payments, show date guidance in Payment Schedule, and complete a series after its final eligible payment."

## Clarifications

### Session 2026-08-14

- Q: When the final due date passes unpaid, what happens? → A: The payment remains active and overdue; it completes only after the final payment succeeds.
- Q: How can a user remove a selected End date? → A: The selected End date row shows an inline Clear action that removes the date immediately.
- Q: Can a user pay an overdue final occurrence after End date? → A: Yes. Record the final payment, then complete the series.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Set a final due date (Priority: P1)

As a user creating a fixed-term recurring payment, I can set an optional final due date so the payment series does not continue indefinitely.

**Why this priority**: Fixed-term bills and instalments must end predictably; an unbounded series can create incorrect future financial expectations.

**Independent Test**: Create a recurring payment with a due payment date and a later end date, save it, then reopen it and confirm the chosen end date remains available.

**Acceptance Scenarios**:

1. **Given** a user is creating a recurring payment, **When** they leave End date unset, **Then** the payment is saved as ongoing.
2. **Given** a user is creating a recurring payment, **When** they choose an end date on or after Due payment, **Then** the payment is saved with that final eligible due date.
3. **Given** a user is creating a recurring payment, **When** they choose an end date before Due payment, **Then** they receive a localized validation message and cannot save until it is corrected.

---

### User Story 2 - Understand and edit payment dates (Priority: P2)

As a user managing an existing recurring payment, I can understand each date's purpose and update or clear its optional end date without changing the established Payment Schedule design.

**Why this priority**: Users need to distinguish the first due payment from the final due payment, while keeping the familiar schedule form easy to scan.

**Independent Test**: Open an existing recurring payment, verify the Due payment and End date guidance in the Payment Schedule, set or clear End date, save, and reopen the payment.

**Acceptance Scenarios**:

1. **Given** a user views Payment Schedule, **When** they view Due payment and End date, **Then** each field shows a concise explanatory hint beneath its primary row content.
2. **Given** an existing payment has no end date, **When** the user opens it, **Then** End date displays an unset state and remains selectable.
3. **Given** an existing payment has an end date, **When** the user clears it and saves, **Then** the payment becomes ongoing.
4. **Given** an existing payment has an end date, **When** the user views its End date row, **Then** an inline Clear action is available without leaving Payment Schedule.

---

### User Story 3 - Finish a bounded series (Priority: P3)

As a user paying the final occurrence of a bounded recurring payment, I see the series complete instead of remaining active with a future date beyond its end date.

**Why this priority**: Completion prevents a finished obligation from appearing as an upcoming payment.

**Independent Test**: Pay a recurring payment whose final eligible occurrence is due, then verify the payment is completed and has no further eligible occurrence.

**Acceptance Scenarios**:

1. **Given** a recurring payment is due on its end date, **When** it is paid, **Then** that occurrence is accepted.
2. **Given** the final eligible occurrence is paid, **When** the payment is recorded, **Then** the linked financial record, balance effect, schedule advance, and completed state remain consistent as one outcome.
3. **Given** a payment was completed because its end date passed, **When** the user extends or clears the end date such that its next due payment is valid again, **Then** the payment becomes active again.
4. **Given** the final eligible occurrence is overdue after End date, **When** the user chooses Pay Now, **Then** one final payment is recorded and the series is completed.

### Edge Cases

- An end date equal to Due payment permits exactly one occurrence.
- An end date earlier than Due payment is rejected before save.
- Clearing End date from an active payment removes its final boundary and preserves the existing next due payment.
- An unpaid final eligible occurrence remains active and overdue after End date; it is not silently completed.
- A user can pay an overdue final eligible occurrence after End date; that successful payment completes the series.
- A failed final payment must not leave the payment completed, advanced, or financially recorded only in part.
- A user may not reactivate a completed payment unless its End date is extended or cleared and its next due payment is valid again.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST provide End date as an optional field when users create or edit a recurring payment.
- **FR-002**: The Payment Schedule MUST retain its existing grouped-row visual pattern; Due payment and End date MUST each include concise supporting guidance beneath their row content.
- **FR-003**: The former Start date label MUST be presented as Due payment and explain that it is the first date the payment is due.
- **FR-004**: End date MUST initially be unset for a new recurring payment and MUST be visibly presented as optional when unset.
- **FR-005**: The system MUST allow an End date only on or after Due payment and MUST show a localized, user-friendly validation message otherwise.
- **FR-006**: The system MUST preserve an End date selected during creation or editing, and MUST remove the boundary when the user clears it.
- **FR-006a**: When End date is set, the End date row MUST provide an inline Clear action; using it MUST return the field to its visible unset state.
- **FR-007**: An occurrence due exactly on End date MUST be eligible for payment.
- **FR-008**: After the final eligible occurrence is successfully paid, the recurring payment MUST be completed so it is not presented as an active future payment.
- **FR-008a**: A final eligible occurrence that remains unpaid after End date MUST remain active and overdue until it is successfully paid.
- **FR-008b**: The user MUST be able to record an overdue final eligible occurrence after End date; its successful payment MUST complete the series.
- **FR-009**: Completion of a final payment MUST not leave the payment's financial record, balance effect, schedule, and status in conflicting states if the payment fails.
- **FR-010**: If a payment was completed only because of its End date, extending or clearing End date MUST reactivate it when its next due payment is valid again.
- **FR-012**: All new user-visible labels, unset-state text, hints, and validation messages MUST be available in English and Arabic.

### Key Entities _(include if feature involves data)_

- **Recurring payment**: A scheduled future money movement with a due payment date, optional end date, action, status, and linked financial occurrences.
- **End date**: The final eligible due-payment date for a recurring payment; when absent, the payment is ongoing.
- **Final eligible occurrence**: A payment occurrence whose due date is on or before End date, including the occurrence on End date itself.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A user can create an ongoing or fixed-term recurring payment, including selecting or leaving End date unset, in one form visit without leaving Payment Schedule.
- **SC-002**: 100% of attempts to save an end date before Due payment are blocked with a clear localized correction message.
- **SC-003**: 100% of successful final eligible payments result in a completed series with no future eligible payment shown.
- **SC-004**: Users can identify the purpose of Due payment and End date from the visible in-field supporting guidance without opening another screen.
- **SC-005**: English and Arabic users receive equivalent labels, guidance, unset state, and validation outcomes.

## Assumptions

- Owner-approved mockup is visual source of truth: both date fields remain inside existing grouped Payment Schedule control, with concise helper text directly beneath each field. In selected state, `(Optional)` sits beside End date label and inline Clear remains beneath selected value.
- End date is inclusive: a payment due exactly on that date is valid.
- End date is initially unset, representing an ongoing recurring payment.
- Completion caused by End date is reversible only when an edit makes the existing next due payment valid again.
- The existing future scheduler remains out of implementation scope until that processor exists.

## Deferred Follow-up

When an automatic recurring-payment processor is separately introduced, its owning specification must require the same inclusive End date boundary as manual Pay Now: do not create an occurrence after End date, and never treat passing End date as proof that an unpaid final occurrence is complete.
