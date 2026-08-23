# Quickstart: Bounded Recurring Payments QA

## Automated coverage

1. Form tests: default End date is null and shown as `Not set`; helper text appears in both date rows; End date picker cannot select a date before Due payment.
2. Validation tests: reject an end date before Due payment with localized field error; allow equal dates and null.
3. Route tests: create and edit map End date through to the recurring-payment command.
4. Service tests: create/update persist End date; clearing it persists null; only end-date completion can reactivate after extension/clear.
5. Atomic integration tests: final Pay Now creates one financial record and balance effect, advances schedule, and completes series together; induced failure leaves all values unchanged.

## Manual device QA

1. Create monthly payment with no End date. Confirm End date reads `Not set`, save, reopen, and confirm it remains ongoing.
2. Create monthly payment with Due payment and End date on same date. Pay it once; confirm it moves to Completed and no later due payment is shown.
3. Create monthly payment ending after multiple cycles. Pay a non-final cycle, then final cycle; confirm only final payment completes series.
4. Select End date, use inline Clear, then save. Confirm row returns to `Not set` and series becomes ongoing.
5. Attempt to set End date before Due payment. Confirm clear localized validation and blocked save.
6. Let final due date pass unpaid. Confirm payment remains active/overdue; use Pay Now and confirm one final payment completes series.
7. Edit an end-date-completed payment: extend then clear End date. Confirm reactivation occurs only when existing next due payment is eligible.
8. Repeat all visible copy checks in Arabic, including right-to-left layout and date-row helper text.
9. View an active overdue bill in My Bills. Confirm Pay Now opens the existing payment confirmation while pressing the rest of the row still opens edit; confirm normal, paused, and completed rows do not show Pay Now.

## Manual-only note

Automatic recurring processing is not currently implemented. Its end-date rule is specified for future coverage and is not claimed as executable QA in this feature.
