# Slice 3A Generic Financial-Action Foundation — Final Green Evidence

Date: 2026-08-31
Branch: `codex/035-financial-action-foundation`
Implementation freeze: `2ca7eaaad293c075d71b14304f0aeaf30d2d6d49`
Rebased main authority: `e02ca34cbc0cb56bdab84ed22d14056bdada9ce5`

## Completed scope

- Restricted canonical envelope, UTF-8 SHA-256 hashing, registry, durable states,
  replay handling, and owner-scoped `(user_id, action_id)` identity.
- Current-user-scoped WatermelonDB repository with auth reassertion.
- Permanent roots, owner-only RLS, immutable evidence, and 66 pgTAP assertions.
- Generated WatermelonDB v26 schema/model/migration and composite uniqueness.
- Generic-sync exclusion and no account/balance effects.
- Empty deterministic `accountGuards` reservation; populated guards wait for T033.
- Root package export remains deferred to T034.

## Rebase and reconciliation

Seven Financial Actions commits were transplanted from exact old merge-base
`d1f865948a28141653c7c829714805d57b499fa4` onto current main. Conflicts in
`data-model.md` and `tasks.md` were resolved using current-main authority while
preserving T018–T024 completion. Strict Red rejected the current-main guard-array
envelope against the scalar implementation. Green aligns TypeScript, SQL,
WatermelonDB generation, pgTAP, repository tests, and the canonical Arabic vector.

## Final local verification

| Check | Result |
| --- | --- |
| Local reset through migration `067` | passed |
| pgTAP | 66/66 passed locally |
| Focused logic | 4 suites, 105/105 passed |
| Full logic | 69 suites, 1,222/1,222 passed |
| Mobile repository/SQLite/sync | 3 suites, 31/31 passed |
| Generator | 5/5 passed |
| Logic, DB, mobile TypeScript | passed |
| `db:sync-local` | passed twice |
| Repeated generation | zero drift; `e7748f03cbcce546fc54e543ee4cb214dafe176a` |
| Repository lint | 0 errors; 278 warnings |
| `git diff --check` | passed |

No remote database was touched. Remote CI must rerun after publication and PR
retarget. Frozen hashes are in
`dependencies/financial-action-foundation.md`.
