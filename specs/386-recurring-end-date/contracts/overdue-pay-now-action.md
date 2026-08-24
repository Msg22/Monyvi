# Overdue Pay Now Action UI Contract

## Availability

- Show Pay Now only for active, overdue recurring-payment rows in My Bills.
- Do not show it for future, paused, or completed rows.

## Interaction

- Pressing the row's primary content opens the existing edit flow.
- Pressing Pay Now opens the existing payment-confirmation modal for that exact recurring payment.
- The modal remains the sole owner of recording the payment, including final-series completion.

## Responsive layout

- At ordinary phone width, Pay Now is displayed alongside the primary row content.
- At compact width or enlarged text, Pay Now stacks beneath the primary row content at full available width.
- The layout uses the shared responsive helper rather than a component-specific breakpoint.
