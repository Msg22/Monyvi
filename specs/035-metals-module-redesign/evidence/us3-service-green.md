# US3 Service Green Evidence

Date: 2026-09-01

Scope is deliberately limited to T066, T067, and the two read-model service
files from T071. Hooks, UI, routes, action descriptors, translations, fixture
registry, and Maestro remain outside this commit.

## Passing focused contract

```powershell
npm test -w @monyvi/mobile -- --runInBand --watchman=false __tests__/services/metal-detail-history-read-model.test.ts
```

Result after the scoped read-facade remediation: 1 suite and 9 assertions
passed. `--watchman=false` is required for this secondary worktree; default
Watchman discovery timed out before running any test.

The passing contract covers reducer-backed effective state, exact active
attribution, equal-time reversal ordering, missing exact facts, terminal
exclusion from active ownership, effective filtered History, user isolation, and
bounded queries.

The service-owned read APIs resolve the authenticated current-user scope before
any query. Detail reads its owned Asset parent, parent-owned `asset_metals`
child, holding state, lifecycle events, immutable action evidence, and rate
references, then returns one plain nullable read model. History returns stable
holding IDs plus owned name, Gold/Silver identity, exact purity tuple,
normalized physical form, and a stable domain render key; unsupported forms use
`null` so presentation selects the documented neutral fallback. Lifecycle
payload JSON remains opaque and is never parsed.

Related exact-domain regressions pass with `--watchman=false`: 3 suites and 103
assertions across lifecycle reduction, rate-reference validation, and
attribution context. T071 remains unchecked because its cancellation-safe React
hook facades are owned by a later batch; no hook, UI, route, locale, schema, or
action behavior changed here.
