# Quickstart: Bounded Recurring Payments QA

## Automated coverage

1. Form tests: default End date is null and shown as `Not set`; helper text appears in both date rows; End date picker cannot select a date before Due payment.
2. Validation tests: reject an end date before Due payment with localized field error; allow equal dates and null.
3. Route tests: create and edit map End date through to the recurring-payment command.
4. Service tests: create/update persist End date; editing a completed payment does not reactivate it; explicit save-time reactivation activates only an eligible next due payment.
5. Atomic integration tests: final Pay Now creates one financial record and balance effect, advances schedule, and completes series together; induced failure leaves all values unchanged.

## Manual device QA

1. Create monthly payment with no End date. Confirm End date reads `Not set`, save, reopen, and confirm it remains ongoing.
2. Create monthly payment with Due payment and End date on same date. Pay it once; confirm it moves to Completed and no later due payment is shown.
3. Create monthly payment ending after multiple cycles. Pay a non-final cycle, then final cycle; confirm only final payment completes series.
4. Select End date, use inline Clear, then save. Confirm row returns to `Not set` and series becomes ongoing.
5. Attempt to set End date before Due payment. Confirm clear localized validation and blocked save.
6. Let final due date pass unpaid. Confirm payment remains active/overdue; use Pay Now and confirm one final payment completes series.
7. Attempt Due payment after End date. Confirm save is blocked. Then create a one-occurrence weekly schedule with Due payment before End date and confirm the helper says no further payment will be due.
8. Edit an end-date-completed payment: extend or clear End date without selecting Reactivate after saving. Confirm it remains completed. Select Reactivate after saving when the calculated next payment is eligible; confirm it becomes active without a confirmation sheet.
9. On a completed payment whose next payment is after End date, confirm Reactivate after saving is visibly disabled with guidance to extend or clear End date. Confirm completed My Bills cards have no Reactivate action.
10. Repeat all visible copy checks in Arabic, including right-to-left layout and date-row helper text.
11. View an active overdue bill in My Bills. Confirm Pay Now opens the existing payment confirmation while pressing the rest of the row still opens edit; confirm normal, paused, and completed rows do not show Pay Now.

## Manual-only note

Automatic recurring processing is not currently implemented. Its end-date rule is specified for future coverage and is not claimed as executable QA in this feature.
