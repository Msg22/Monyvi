# US5 Sell-Without-Account-Credit Red Evidence

Status: Red confirmed 2026-09-05 on exact base
`faa07725acc781c9be60e49ddcaef8b4869a7031`.

T093–T097 define the whole-active-holding sale contract: exact gross, optional
same-currency fee, net proceeds and realized P/L; sale-date/rate validation;
immutable local-first History evidence; no account, income, budget, or cashflow
side effect; atomic rollback; idempotent retry; direct submit without a second
confirmation; pending lock; accessible responsive layout; and offline restart.

## Executed

```text
npm test -w @monyvi/mobile -- --runInBand --runTestsByPath __tests__/services/sell-metal-holding-command-service.integration.test.ts __tests__/app/metals-sell.test.tsx __tests__/hooks/useSellMetalHolding.test.ts
```

Result: 3 suites failed, 25 tests failed, 0 harness parse/config failures.

- Exact preview: eight tests fail only because
  `services/sell-metal-holding-preview-service` is absent.
- SQLite command: six tests initialize the real WatermelonDB schema version 27,
  then fail only because `services/sell-metal-holding-command-service` is
  absent.
- Presentational UI: seven tests fail only because
  `components/metals/SellMetalHoldingScreen` is absent.
- Hook: four RNTL `renderHook` tests fail only because
  `hooks/useSellMetalHolding` is absent.

## Activation boundary

T093–T100 do not assign shared adapter, action-registry, locale, barrel, fixture
registry, or holding-detail integration ownership. The current shared metal
adapter still rejects with `metal_action_schema_not_approved`; these Red tests
use an injected approved `metals.sell/v2` envelope only to exercise the isolated
command contract and do not activate or bypass the production adapter.

The Maestro flow is an authored Red contract only. Its deterministic Sell
fixture profile and production route integration remain explicit dependencies,
so no device execution is claimed.

## Stable-base replay

The Red checkpoint was rebased conflict-free onto stable Slice 7 checkpoint
`a190d8f`. The same command then reproduced the intended 3-suite, 25-test Red
result with failures limited to the four absent Sell production modules.
