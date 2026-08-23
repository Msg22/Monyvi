# UI Contract: Premium Budget Detail

## Header and identity

- Shared PageHeader: 44dp Back button, title `Budget Detail`, green pencil plus
  labelled Edit action.
- Identity: leading category/global/deleted fallback icon, budget name,
  lifecycle text, period, inclusive date range, and eligible outlined
  Pause/Resume action.
- Normal width uses one row; constrained width wraps metadata and action without
  shrinking controls below 44dp.

## Overview

- Spent label, amount, limit context, percentage and `of budget` text.
- Horizontal progress exposes accessible min `0`, max `100`, and current actual
  percentage while visual width clamps at 100%.
- Current-position marker plus 0%/100% anchors.
- Divided stats: Remaining, Daily average spent with `/day`, Days left.
- Paused and expired budgets keep historical values and progress.

## Weekly spending trend

- Sentence-case heading and actual/pace legend.
- Fixed y-axis; horizontally scrollable equal-width weekly columns.
- Solid actual and dashed pace shapes, amount label, localized week label and
  inclusive date range.
- Active budgets expose accessible below/on/above insight. Paused/expired budgets
  omit that insight.
- One chart summary and accessible per-week actual/pace descriptions; decorative
  shapes are hidden.

## Category breakdown

- Category budgets always show the section; global budgets omit it.
- Empty category budgets show a compact explanation.
- Rows show icon, name, matching transaction count, amount, percentage, and
  separators.
- Rows are not interactive and show no chevron.

## Recent transactions

- Section always appears; empty state is compact and specific.
- Up to six rows show icon, label, localized date, amount, and RTL-aware
  decorative chevron.
- Entire row is one 44dp-or-larger button whose accessibility label includes
  edit intent, identity, date, and amount.
- Tap opens existing Edit Transaction. No View all action.

## Danger zone

- Red outlined surface at bottom of scroll content.
- Explains that deleting removes the budget but keeps transactions.
- Full-width outlined Delete budget action with trash icon.
- Destructive confirmation is required; bottom content clears the system inset
  exactly once.
- While any confirmation command is pending, confirm/cancel, backdrop, and
  system Back dismissal are disabled and the modal exposes a busy state.

## States

- Loading skeleton mirrors identity, overview, chart, applicable breakdown,
  recent rows, and Danger zone; it exposes no actions.
- Initial failure has friendly Retry; later failure preserves content and shows
  recoverable feedback.
- Missing/deleted/inaccessible has a friendly not-found state.
- All visible copy is localized in English and Arabic and communicates status
  without color alone.
