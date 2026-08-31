# Financial-Action Foundation Dependency

Status: **T018–T024 complete and frozen locally**

Date: 2026-08-31
Branch: `codex/035-financial-action-foundation`
Implementation freeze commit: `84afb2f53c61aeda6f1d7b55bf4c34b56467b68e`
Rebased main authority: `e02ca34cbc0cb56bdab84ed22d14056bdada9ce5`
Pre-rebase safety ref: `codex/backup-035-financial-action-foundation-pre-main-20260831` at
`4a349642c55a561ca23b3b45f9dda06dd7cb72e5`

## Frozen Slice 3A surface

- Durable row IDs are opaque storage identities. Idempotency is owner-scoped by
  `(user_id, action_id)`.
- Identical canonical text and hash is a replay; a text or hash mismatch is rejected.
- `accountGuards` / `account_guards_json` reserve a deterministic per-account
  compare-and-swap list. Slice 3A accepts only `[]`; populated guards and account
  effects remain gated by #242/T033.
- Local reads/writes are current-user scoped with auth reassertion across awaits.
- Root-only creation starts `pending_local`. The explicit composite local-commit
  API batches a new or matching pending root with caller-prepared linked domain
  operations, persisting `local_complete` only when that whole batch succeeds.
- Completed same-hash replay skips linked preparation; a matching pending root may
  resume. Empty linked plans and plans targeting the root table are rejected.
- Roots remain retained with `deleted = false` and cannot be hard-deleted.
- Auth is reasserted after asynchronous linked preparation, immediately before
  batch commit, and after every awaited create/update batch before success returns.
- `financial_action_groups` remains excluded from generic sync.
- Root `@monyvi/logic` exports remain deferred to T034.

Approved Arabic fixture digest:

```text
020ebe94ba4a335d86502ef218f39b2b1789c311c28540f3250a7f5c85cc96c3
```

## Verification freeze

| Check | Result |
| --- | --- |
| Local PostgreSQL reset/migration | passed through migration 067 |
| Local PostgreSQL pgTAP | 66/66 passed |
| Focused Financial Actions logic | 4 suites, 105/105 passed |
| Full `packages/logic` Jest | 69 suites, 1,222/1,222 passed |
| Repository, fresh SQLite, generic-sync exclusion | 3 suites, 40/40 passed |
| Full mobile Jest | 293/294 suites, 2,525/2,526; order-dependent harness exception tracked by #247; affected SQLite suite passes 5/5 alone |
| Transform-schema generator | 5/5 passed |
| Logic, DB, and mobile TypeScript | passed |
| Local-only `db:sync-local` | passed twice |
| Repeated generation | zero drift; diff hash `e7748f03cbcce546fc54e543ee4cb214dafe176a` |
| Repository-wide lint | 0 errors; 272 pre-existing warnings; changed files clean |
| `git diff --check` | passed |

No remote database was touched. Remote CI must rerun after publication/retarget.

## Frozen Git object hashes

| Surface | Git object hash |
| --- | --- |
| `packages/logic/src/financial-actions/` | `2f8735847a2cf58cdf35bab20b47cf3d5bd0d07c` |
| Migration `067` | `6df3bf1353a21fae5d5955f162ec4d1ec070257e` |
| Generated schema | `efa3a6613e036928efa054b2653a630ed650a671` |
| Watermelon migrations | `ffb209072c8c2b696797c332b64fb8e70833e131` |
| Mobile repository | `0f5dfe947f60908ef67e887738fb9bf32d520a74` |
| Schema generator | `e7e52d35aa7c12ed835413b8b2c986aa7ea54b87` |

T024 unblocks T034 and unrelated Metals persistence. Credited Sale/Undo, populated
account guards, and compensation/replacement credit remain blocked by T033.
