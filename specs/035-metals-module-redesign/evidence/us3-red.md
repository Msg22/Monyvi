# US3 Red Evidence

Date: 2026-09-01

## T066

`manual-tests/us3-detail-history.md` and `coverage/us3.md` define Active,
Sold/Disposed, reversal, missing-fact, filtered History, user-isolation, and bounded
query scenarios. UI, action, route, translation, and Maestro scenarios are explicitly
deferred to their owning tasks.

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

The focused Jest process was attempted twice (`--runInBand`, then `--listTests`) but
timed out during Jest discovery after 120 seconds without selecting a test. This is a
local runner limitation, not Green evidence. The TypeScript resolver failure supplies
the deterministic Red proof; rerun the focused Jest command after service creation.
