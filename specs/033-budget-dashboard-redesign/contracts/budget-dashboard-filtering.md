# Contract: Budget Dashboard Filtering

## Defaults

```ts
const DEFAULT_BUDGET_DASHBOARD_FILTERS = {
  scope: "ALL",
  period: "ALL",
  status: "ACTIVE",
} as const;
```

## Options

- Scope: `ALL`, `CATEGORY`, `GLOBAL`
- Period: `ALL`, `WEEKLY`, `MONTHLY`, `CUSTOM`
- Status: `ALL`, `ACTIVE`, `PAUSED`, `EXPIRED`

All controls expose translated label and current value without opening a modal.
Scope uses selected tabs. Period and Status use existing accessible selector
pattern with safe-area-aware option surfaces.

## Composition

All three filters use AND semantics. Selection change atomically replaces result
list when its generation completes. Rapid changes invalidate older generations.
Reset restores defaults.

## Session lifetime

- First hook use in fresh JS runtime reads defaults.
- Accepted selection writes all three values to in-memory session boundary.
- Navigating to detail/create and returning as same user restores session
  values.
- Fresh launch/module runtime or authenticated-user change resets defaults.
- No filter value is written to WatermelonDB, Supabase, secure storage, or user
  preferences.
- User-scope change invalidates current results, resets filters, and shows no
  prior user's rows.

## Accessibility

- Scope tabs expose tab/button role and selected state.
- Period/Status controls announce label, current value, expanded state, and
  selected option.
- Reset is clearly labelled and available in filtered-empty state.
- Logical order is Scope, Period, Status, Results in LTR and RTL.

## Test matrix

- Defaults and reset.
- Every scope, period, and status option.
- Representative UI paths and exhaustive pure 3 x 4 x 4 predicate combinations.
- In-session navigation restore and fresh-runtime reset.
- Rapid selection changes and stale completion.
- No-match state and reset.
- EN/AR labels, RTL order, screen-reader state, and safe-area selector surface.
