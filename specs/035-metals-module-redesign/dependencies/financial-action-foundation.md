# Financial-Action Foundation Dependency

Status: **T024 complete and frozen locally**

Date: 2026-08-31
Branch: `codex/035-financial-action-foundation`
Implementation freeze commit: `ecb673971f1071d131c1f5795a1ec3e4972eb3cc`
Stacked base at freeze: `be99eba76757a966ea80b0c070f71fce1e58c33a`

## Frozen Slice 3A surface

- Durable row IDs are opaque storage identities. Idempotency is owner-scoped by the
  unique pair `(user_id, action_id)` in PostgreSQL and generated WatermelonDB/SQLite
  schema.
- Same owner/action plus identical canonical payload text and hash is a replay. A
  text or hash mismatch is rejected.
- `payload_json` is the immutable restricted V1 envelope and `payload_hash` is the
  lowercase UTF-8 SHA-256 digest of its exact canonical bytes.
- `expectedAccountRevision` is reserved as
  `CanonicalUnsignedIntegerString | null`; Slice 3A runtime accepts only `null`.
  Account effects and non-null revisions remain gated by full #242/T033.
- Local repository reads and writes are current-user scoped. Creation reasserts the
  authenticated user before lookup, after lookup, and immediately after the awaited
  batch before returning a model.
- Roots start at `pending_local`, remain permanently retained with `deleted = false`,
  and cannot be hard-deleted even through an authenticated-user cascade.
- `financial_action_groups` remains permanently excluded from generic sync. Slice 3A
  does not claim domain completion, queue dedicated sync, mutate balances, or create
  account effects.
- The capability remains internal until package-integration task T034. The root
  `@monyvi/logic` barrel intentionally exports neither Financial Actions nor Metals.

Approved Arabic fixture digest:

```text
d9496846d80647644048c112aa501a2bf2985bc279445d82efdd96669b5718ab
```

## Verification freeze

| Check | Result |
| --- | --- |
| Local PostgreSQL pgTAP | 65/65 passed |
| Financial-action logic/full logic | 66 suites, 1,141 tests passed |
| Repository, fresh SQLite, generic-sync exclusion | 3 suites, 31 tests passed |
| Transform-schema generator | 5/5 passed |
| Fresh SQLite composite uniqueness | passed; duplicate owner/action rejected |
| Logic, DB, and mobile TypeScript | passed |
| Local-only `db:sync-local` | passed |
| Repeated generated schema | zero drift; hash unchanged |
| `git diff --check` | passed |

Repository-wide lint remains at the stacked branch's known 46-error baseline. The
changed production, generator, and new public-surface files add no lint findings;
the two existing foundation test files retain their pre-existing async-test lint
debt.

No linked remote database was reset, migrated, pushed, or used for type generation.
No CI-green claim is made: PR #245 currently has no reported checks and awaits the
separately coordinated rebase/update of its advanced stacked base.

## Frozen Git object hashes

| Surface | Git object hash |
| --- | --- |
| `packages/logic/src/financial-actions/` tree | `550d488bccc079d3d1e49a1369c79397e81da8bb` |
| Migration `067` | `b683ebe60f5cf275f537eeb938d565c1898497cf` |
| Generated Watermelon schema | `2106e67c300a752ca7fdf9ac97711ea8e682a2a3` |
| Watermelon migrations | `ea2247c1e2c584732caef4e958074251b3eac354` |
| Mobile foundation repository | `4b23ab91594127cf54b89f27d2d2ec6a2f74f8e8` |
| Schema generator | `a8b54d4f4605373cf1293fd3c7adc29d72ac3c1f` |

T024 unblocks T034 and unrelated Metals persistence work. Credited Sale, credited
Undo, and account compensation/replacement credit remain blocked by T033.
