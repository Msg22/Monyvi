# Contract: SMS Review Draft UI

## Entry State

When the current user has an active queue:
- Primary: `Continue reviewing N transactions`.
- Secondary: `Check for new messages`.
- Back/close preserves the queue.

Without an active queue, retain the established scan entry behavior.

## Review State

- Render the durable current-user queue, not transient parser context.
- Reuse established All / Needs review / Auto-selected filters.
- Persist explicit selection and deselection immediately.
- Untouched selection derives from current review metadata.
- `Review later` exits the complete scan/review flow in one tap and preserves all
  suggestions.
- `Discard all` remains quiet and visually secondary.

## Edit Sheet

- Compact bounded bottom sheet; header and filters remain visible behind it.
- Preserve provider logo/name/date identity block above fields.
- Preserve approved colorful icons.
- Fields: Amount, Merchant, Category, Account, Currency.
- Amount and Merchant edit inline, one focused field at a time.
- Keyboard appearance keeps the focused row and Save action reachable through
  internal keyboard-aware scrolling.
- Category, Account, and editable Currency open established selector sheets.
- Direction/type is read-only; no Expense/Income tabs.
- No discard action inside the edit sheet.
- Save persists complete edited payload before dismissing the sheet.

## Individual Discard

- Compact circular X at the card's top-right.
- One-tap action, visually secondary, distinct from the selection checkbox.
- Accessible label names the affected suggestion; touch target meets platform
  guidance.
- Durable command succeeds before completed removal feedback.
- Success: fade/collapse once; adjacent cards settle once without bounce/jitter.
- Failure: card remains/restores and friendly retry feedback appears.

## Undo Banner

- Only the latest individual discard is undoable.
- Banner names the latest discarded suggestion.
- Actions: `Undo` and trailing close X.
- Remains visible without timer-based dismissal until acted on, replaced, or
  the review process ends.
- Renders in normal layout flow above transaction rows; it must not obscure the
  list or sticky footer.
- A second discard finalizes/replaces the previous Undo item.
- Close or process death finalizes the discard.
- Undo restores the same item at its prior position with expand/fade motion and no
  overshoot.
- Reduced-motion preference uses immediate state changes.

## Discard All

Confirmation copy:
- Uses `suggestions`, never internal `drafts`.
- States the exact remaining count.
- States permanent removal and that it cannot be undone.
- States those SMS messages will not be suggested again on this device.

Cancel changes nothing. Confirm removes all remaining items, creates dismissed
fingerprints, exits appropriately, and offers no Undo.

## Save

- Unselected suggestions and soft warnings do not block valid selected items.
- Selected hard-invalid item blocks the whole batch and identifies item/field.
- Successful save navigates to Transactions even if unselected suggestions remain.
- Success feedback contains only the saved transaction count.
- No intermediate empty-review flash.

## Privacy Details

Rename the full page to `Privacy details` and separate:
1. AI processing disclosures.
2. Temporary device-local SMS review storage.

The SMS section explains:
- Original SMS is stored on this device only for unfinished review.
- It is removed after save/discard and unresolved items expire after 30 days.
- It is not synchronized or included in final transaction data.
- Existing suggestions remain reviewable after AI consent is revoked.
- No unverified encryption claim.

## Theme, Safe Area, Accessibility

- Preserve Monyvi light/dark design tokens; mockup colors are not authoritative.
- Use NativeWind and existing design-system components.
- Bottom sheet/footer/banner respect Android bottom insets.
- Text remains readable with large font settings and RTL translations.
- Every icon-only action has a label, role, state, and adequate touch target.
