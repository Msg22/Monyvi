# US3 Service Green Evidence

Date: 2026-09-01

Scope is deliberately limited to T066, T067, and the two read-model service files
from T071. Hooks, UI, routes, action descriptors, translations, fixture registry, and
Maestro remain outside this commit.

## Passing focused contract

```powershell
npx jest __tests__/services/metal-detail-history-read-model.test.ts --runInBand --no-cache --watchman=false
```

Result: 1 suite and 5 assertions passed. `--watchman=false` is required for this
secondary worktree; default Watchman discovery timed out before running any test.

The passing contract covers reducer-backed effective state, exact active attribution,
equal-time reversal ordering, missing exact facts, terminal exclusion from active
ownership, effective filtered History, user isolation, and bounded queries.
