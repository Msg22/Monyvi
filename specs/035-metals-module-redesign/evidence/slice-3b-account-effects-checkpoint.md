# Slice 3B Account-Effects Checkpoint

Date: 2026-09-06

Branch: `codex/issue242-account-effects-slice3b`

Checkpoint base: `20c7e5cfc6de1735bfa66e291494c34f02f9b6b9`

## Scope Completed

- Kept complete SMS review recovery snapshots device-local. The synchronized
  `sms.review-durable` descriptor contains only draft ID, queue ID, fingerprint,
  and snapshot hash.
- Added fail-closed snapshot identity and hash validation before atomic local
  draft restoration with rejected-action compensation.
- Registered the approved `accounts` domain at both the action-root and account-
  effect storage boundaries.
- Persisted cross-currency transfer `converted_amount` using the destination
  account currency scale.
- Rejected foreign linked categories and foreign transaction-linked records
  inside the security-definer RPC.
- Rejected maximum expected revisions before either accepted or stale-effect
  revision arithmetic can overflow.
- Replaced seven unconditional `BLOCKED_RED` pgTAP assertions with executable
  RPC acceptance coverage.

## Verification

The PostgreSQL checks used disposable database `issue242_ckpt2_20260906`, copied
from the local schema-068 database. Migration 069 was applied only to that copy.
The shared manual-QA runtime remained on schema 068.

| Check                                                  | Result                 |
| ------------------------------------------------------ | ---------------------- |
| Migration 069 compile on schema 068 copy               | Passed                 |
| `supabase/tests/account_financial_effects_test.sql`    | 38/38 passed           |
| `supabase/tests/account_financial_action_rpc_test.sql` | 36/36 passed           |
| Focused mobile Jest                                    | 4 suites, 32/32 passed |
| Focused logic Jest                                     | 1 suite, 2/2 passed    |
| Mobile TypeScript                                      | Passed                 |
| Focused ESLint                                         | Passed                 |
| Focused Prettier                                       | Passed                 |
| `git diff --check`                                     | Passed                 |

RPC acceptance covers atomic transaction/effect/account commit, owner-scoped
account and linked-category validation, identical replay, action-ID/hash
mismatch, stale CAS, sorted two-account results, destination-currency precision,
revision exhaustion, and full rollback after a domain-write failure.

## Current-Main And Generation Risk

- Refreshed `origin/main`: `6c7553f8dc178f792be5e905dd554837343d47ab`.
- Merge base: `bf2e3a071c2814772e9a9669479afeeb85d48767`.
- Branch divergence before this checkpoint commit: 28 commits ahead and 58
  commits behind `origin/main`.
- `origin/main` ends at migration 068, so reserved migration 069 still has the
  correct next prefix.
- No generated DB artifact was edited. T033 regeneration remains deferred until
  this branch is integrated after current migration 068.
- A read-only merge-tree check reports conflicts across Metals persistence,
  generated DB files, shared financial-action files, sync files, fixtures, and
  tests. Resolving those files exceeds this checkpoint's assigned ownership.

## Publication State

Not publishable from this stale branch. The checkpoint is locally coherent and
verified, but it must be replayed or rebased onto current `origin/main` by the
integration owner before publication. No remote database, branch, pull request,
or GitHub issue was changed.
