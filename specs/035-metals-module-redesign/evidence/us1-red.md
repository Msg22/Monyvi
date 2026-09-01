# US1 Red Evidence

Base: `47d6fc3de09ec0c848f68e19fd94de09fb0c79fe` Date: 2026-09-01 Scope:
T050–T052 only. T053/T054/T057 remain blocked at the documented Slice 4
translation-ownership boundary; no UI or Maestro artifact was created.

## T050

- Created `manual-tests/us1-connected-portfolio.md` with deterministic and
  manual-only scenarios, SC-001 moderation conditions,
  device/reflow/accessibility evidence requirements, and FR/SC mapping.
- Created `coverage/us1.md`; it explicitly records its partial/blocked status
  and does not claim US1 completion.

## T051/T052 intended Red command

```text
cd apps/mobile
npm test -- --runInBand --watchman=false __tests__/services/net-worth-read-model-service.metals.test.ts __tests__/services/metal-portfolio-read-model-service.test.ts
```

Result: 2 failed suites, 4 failed tests.

- T051: all four branch cases failed because `buildWealthBreakdownReadModel` is
  not exported. They cover exact Accounts/Metals/Gold/Silver shares, exclusion
  of Sold/Disposed/ineffective/invisible data, missing-rate nullability with
  retained ownership facts, and detached snapshot immutability.
- T052: suite failed because `metal-portfolio-read-model-service` does not
  exist. Its declared cases cover current-user scope, All/Gold/Silver selection,
  active totals/allocation/current performance, effective visible History/sold
  result, missing-rate unavailability, and filter-empty state.

These failures are intentional missing Slice 5 behavior, not a test-environment
failure. The net-worth test mocks WatermelonDB and user-data access to isolate
the absent read-model export.

## T056 focused Green

After the recorded Red run, T056 added scoped local portfolio queries and
Decimal-backed wealth/portfolio read models. The same focused command passed:
2 suites and 11 tests.

- Wealth values, totals, and one-decimal shares are canonical decimal strings;
  arithmetic uses the shared 50-significant-digit, half-even Decimal primitive.
- Active values include only current-user effective, visible Active holdings.
  Sold, Disposed, invisible, and ineffective records never contribute to wealth
  or allocation; sale proceeds remain an Accounts input only.
- Missing or invalid rate-dependent values remain null while holdings and counts
  stay visible. Stale/unknown/missing trust state is carried through unchanged.
- Portfolio assets, states, and recent History use user-scoped queries; recent
  History is effective, visible, reverse chronological, and limited to three
  records.

## Remaining gate status

Full T055 is not complete: it requires T051–T054, and T053/T054 cannot
faithfully use approved localized UI content until the Slice 4 owner supplies
approved EN/AR US1 keys and updates the translation schema. T057/T058 remain
paused; this evidence does not claim full US1 Green.
