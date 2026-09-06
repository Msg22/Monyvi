# US6 Dispose Red evidence

Date: 2026-09-05

Base: `a190d8f`

Branch: `codex/035-metals-dispose`

## Deterministic Jest Red

Command:

```text
npm test -w @monyvi/mobile -- --runInBand apps/mobile/__tests__/services/dispose-metal-holding-command-service.test.ts apps/mobile/__tests__/app/metals-dispose.test.tsx
```

Result: expected failure, `2` suites failed and `29` tests failed. Every test
reached the intended missing-production boundary:

- `Cannot find module '../../services/dispose-metal-holding-command-service'`
- `Cannot find module '../../components/metals/DisposeMetalHoldingScreen'`
- `Cannot find module '../../hooks/useDisposeMetalHolding'`

The first service invocation exposed an unrelated eager Supabase environment
guard in the shared repository import. The test now isolates that production
client dependency, was rerun, and reached only the intended missing owned
module.

## Maestro Red / environment evidence

Command:

```text
npm run e2e:flow:local -w @monyvi/mobile -- e2e/maestro/metals/dispose-holding.yaml
```

Result: runner preflight failed before app launch because
`device 'emulator-5554' not found`. This is not a product-code Red signal, so no
device behavior is claimed. Later review also confirmed that this branch has no
shared Dispose route or runner-controlled current-user/offline fixture. The
speculative flow was therefore removed; its category, summary, local completion,
history, and restart scenarios remain in the manual coverage matrix until an
honest integration harness exists.

## Shared integration boundary

The shared default registry now includes `metals.dispose/v1`, but its payload
validator requires a predecessor event. The approved migration contract permits
an Active revision-zero holding with no predecessor, so deterministic tests use
a test-only registry variant for that case. Updating the shared registry,
translation resources, route, and runner fixture remains owned by their
integration owners; this slice neither bypasses nor modifies them.

## Review-correction Red — 2026-09-06

The consolidated review tests were written before changing production code. The
first focused run reached the existing implementation and failed as intended:
`2` suites failed, `17` tests failed, `24` passed (`41` total).

The failures proved the exact review gaps: legacy category IDs, missing
revision-zero handling, acceptance of hidden/recovery projections, unchecked
generated evidence IDs, successful results for unsuccessful replay roots,
reconstructed retry commands, escaped ID-construction errors, and unbounded
confirmation content. A narrow runtime-contract test also failed `1/1` because
the legacy `lost_or_stolen` ID was accepted.

These are product-code Red signals. The earlier Maestro preflight failure is
environment evidence only and remains excluded from Green claims.
