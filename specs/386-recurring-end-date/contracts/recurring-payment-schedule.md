# Recurring Payment Schedule UI Contract

## Payment Schedule fields

The create and edit forms present one existing grouped Payment Schedule control with these rows in order:

1. Linked account
2. Category
3. Frequency
4. Due payment
5. End date

## Date-row behavior

| Field | Required | Unset presentation | Selection constraint | Supporting copy |
| --- | --- | --- | --- | --- |
| Due payment | Yes | Not applicable | Existing create/edit date policy | Explains this is the first date payment is due. |
| End date | No | `Not set` | Cannot precede Due payment | `(Optional)` appears beside label and helper explains final date for fixed-term bills; selected value includes inline Clear. |

## Visual requirements

- End date uses the same row structure, icon treatment, border, divider, label/value hierarchy, dark-mode behavior, and chevron affordance as existing Payment Schedule rows.
- Supporting copy appears directly beneath its date row's main content, inside the grouped control.
- `(Optional)` is a subtle secondary label beside End date, not a separate row, card, or control.
- When End date has a value, inline Clear appears in that row and returns it to `Not set`; Clear does not save by itself.
- No toggle, extra card, banner, badge, tooltip-only explanation, or new navigation path is introduced.

## Completed-payment reactivation

- A completed My Bills card includes a compact Reactivate action. Pressing it opens a confirmation sheet that shows the next eligible payment date and confirms that no payment will be recorded.
- A completed edit form has a checkbox labeled `Reactivate after saving`. It appears beneath Payment Schedule and changes status only when the user saves; it does not open a confirmation sheet.
- If the calculated next payment is later than End date, the Reactivate action and edit-form checkbox explain that End date must be extended or cleared first.
- The End date helper explicitly states when a valid bounded schedule has no later eligible recurrence.

## Localized copy contract

- Labels, unset state, helper text, and validation messages must be supplied in English and Arabic.
- User-visible wording is friendly and explains the outcome without implementation terms.
