# US3 Red Evidence

Date: 2026-09-01

## T066

`manual-tests/us3-detail-history.md` and `coverage/us3.md` define Active,
Sold/Disposed, reversal, missing-fact, filtered History, user-isolation, and
bounded query scenarios. UI, action, route, translation, and Maestro scenarios
are explicitly deferred to their owning tasks.

## T067 intended failure

Command:

```powershell
npx tsc --noEmit --pretty false --project tsconfig.json
```

Result: failed as intended before implementation with:

```text
Cannot find module '@/services/metal-detail-read-model-service'
Cannot find module '@/services/metal-history-read-model-service'
```

The focused Jest process was attempted twice (`--runInBand`, then `--listTests`)
but timed out during Jest discovery after 120 seconds without selecting a test.
This is a local runner limitation, not Green evidence. The TypeScript resolver
failure supplies the deterministic Red proof; rerun the focused Jest command
after service creation.

## Scoped read-facade remediation Red

After the initial service builders existed, hooks still had no approved service
API that could read the owned `asset_metals` and holding-state inputs required
by detail, and History still fabricated blank Gold identity. Focused tests were
extended before production edits.

```powershell
npm test -w @monyvi/mobile -- --runInBand --watchman=false --no-cache __tests__/services/metal-detail-history-read-model.test.ts
```

Result: 2 failed and 5 passed. Existing reducer, attribution, reversal,
missing-fact, filter, isolation, and bounded-query assertions remained Green.
New assertions failed because `readMetalDetailReadModel` and
`readMetalHistoryReadModel` did not exist. T068, T069, and aggregate T070 remain
open because UI and Maestro Red coverage is not part of this service-only batch.

## T068 intended Red then Green

`holding-experience.test.tsx` first failed because
`MetalHoldingDetailScreen` did not exist. After the minimal shaped-prop UI,
manifest render, descriptor registry, routes, and cancellation-safe service facades:

```text
npm test -- --runInBand --watchman=false --runTestsByPath
  __tests__/components/metals/holding-experience.test.tsx
  __tests__/services/metal-detail-history-read-model.test.ts
```

Result: 2 suites, 13 tests Green. T069/T070/T074 remain open: the Maestro flow is
authored but cannot run while the external Metro/device bundle blocker remains.
