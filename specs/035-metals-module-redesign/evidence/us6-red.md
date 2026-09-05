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
device behavior is claimed. The flow remains an authored user-visible contract
for category validation, conditional Other treatment, affected-only summaries,
direct local completion, Disposed history, no sale metrics, and offline restart.

## Shared integration boundary

Tests inject the approved registry canonicalizer. The production financial
action adapter remains fail-closed with `metal_action_schema_not_approved` until
shared T043 is integrated. Translation resources and the runner fixture profile
also remain owned by their dedicated integration owners; this slice neither
bypasses nor modifies them.
