# US5 Sell-Without-Account-Credit Isolated Green Evidence

Status: isolated Green on 2026-09-05, based on stable Slice 7 checkpoint
`a190d8f`.

## Covered boundary

- Exact live gross, optional same-currency fee, net proceeds, and realized P/L
  preview, including invalid precision and sale-date boundaries.
- Active whole-holding-only local commit, immutable Sale evidence, sold
  lifecycle event, predecessor replacement, rollback, replay, mismatch
  rejection, and persistence across database re-instantiation.
- No account balance, income, budget, transaction, or cashflow side effect.
- Hook validation, pending double-submit guard, error preservation, stable retry
  identity, and unmount safety.
- Injected-copy presentational UI for direct submit, disabled account credit,
  stale-rate acknowledgment, responsive reflow, RTL direction, accessible state,
  and bottom safe-area inset.
- Isolated Sell action descriptor for the approved holding-scoped pathname.

## Deliberately open

- T099 route activation: no Expo route is created while the shared adapter
  remains fail-closed and shared approved copy is outside this lane.
- T096 runtime E2E: `sell-holding.yaml` is authored, but no registered Sell
  fixture or live route exists yet.
- T100 device proof: visual fidelity, theme, RTL, 200% text, and
  assistive-device checks remain pending.
- T101–T103 account-credit behavior remains blocked and is not implemented.

## Architecture boundary

The command receives an approved `metals.sell/v2` envelope creator through
dependency injection for isolated verification. It does not import, modify, or
bypass the shared fail-closed adapter. No shared registry, locale, fixture,
barrel, detail screen, schema, migration, sync, Add/Edit, or account-credit file
is changed.

## Verification

- Focused Jest command: 3 suites passed, 29 tests passed.
- Sell-owned ESLint command: passed with zero errors and zero warnings.
- Sell-owned Prettier check: all matched files use Prettier code style.
- `git diff --check`: passed.
- Mobile typecheck: no Sell-owned errors remain, but the workspace command is
  blocked by out-of-lane shared errors. The stable base is missing `source` in
  existing live-rate trust fixtures/hooks and still reports Add/Edit facade
  `validationInput` mismatches against the shared adapter input type.
- Maestro and device checks were not run for the explicit route, fixture,
  shared-copy, and device-gate reasons above.

The Green implementation is checkpointed locally on
`codex/035-metals-sell-no-credit`; the exact hash is reported in the lane
handoff rather than embedded into its own commit contents.
