# Data Model: Bounded Recurring Payments

## Recurring Payment

Existing user-owned scheduled payment record.

| Field | Meaning | Rules for this feature |
| --- | --- | --- |
| Due payment date | First date a series is due | Required. Existing persisted field remains the schedule anchor. |
| End date | Final eligible due date | Optional and null by default. Must be on or after Due payment. |
| Next due date | Next outstanding occurrence | An occurrence is eligible when it is on or before End date, or when End date is null. |
| Status | Current lifecycle state | Becomes completed after final eligible payment; changes back to active only through explicit reactivation. |
| Action | Payment handling preference | Future automatic handling must use the same boundary rule; not implemented here. |

## State Transitions

| Current state | Event | Condition | Result |
| --- | --- | --- | --- |
| Active, ongoing | Set End date | End date valid | Active, bounded |
| Active, bounded | Clear End date | User saves cleared value | Active, ongoing |
| Active, bounded | Pay an eligible non-final occurrence | Next due date remains on or before End date | Active, bounded |
| Active, bounded | Pay final eligible occurrence | Next calculated due date is after End date | Completed, bounded |
| Active, bounded | End date passes with final occurrence unpaid | Final occurrence has not been paid | Active, overdue |
| Active, overdue final | Pay Now | Final occurrence succeeds | Completed, bounded |
| Completed, bounded | Edit any field | Any | Completed; schedule may change but status does not |
| Completed, bounded | Save with Reactivate after saving | Next due is eligible | Active; bounded if End date remains, ongoing if cleared |

## Invariants

- End date is null or on/after Due payment.
- Due date equal to End date is eligible.
- A calculated recurrence later than End date is never stored or presented as an eligible next due payment.
- A completed series caused by End date has no future eligible occurrence.
- Editing a completed series never changes status; reactivation is explicit.
- A passed End date never itself proves payment or completion.
- A selected End date can return to null through Clear before the form is saved.
- Financial record, balance effect, next due date, and completed state must not persist partially.
- User ownership and local-first persistence remain unchanged.
