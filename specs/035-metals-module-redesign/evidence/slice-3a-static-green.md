# Slice 3A Generic Financial-Action Foundation — Final Green Evidence

Date: 2026-08-31
Branch: `codex/035-financial-action-foundation`
Implementation freeze: `ecb673971f1071d131c1f5795a1ec3e4972eb3cc`
Stacked base at freeze: `be99eba76757a966ea80b0c070f71fce1e58c33a`

## Completed scope

- Restricted V1 canonical envelope validation, byte-stable serialization,
  injected UTF-8 SHA-256 hashing, frozen bounds, deterministic registry, durable
  states/outcomes, and replay collision handling.
- Opaque storage row IDs with owner-scoped `(user_id, action_id)` identity.
- Current-user-scoped WatermelonDB repository with auth reassertion across awaited
  lookup and batch boundaries, retry/restart behavior, and no account/balance work.
- Permanent root retention, DB-level hard-delete rejection, owner-only RLS, private
  server helpers, immutable root/evidence guards, and 65 executable pgTAP assertions.
- Generated WatermelonDB v26 schema/model/migration registration, including
  generator-owned composite SQLite uniqueness that survives regeneration.
- Permanent generic-sync exclusion. Slice 3A does not mark domain work complete or
  expose a dedicated synchronizer.
- `expectedAccountRevision` is a canonical unsigned-integer string reservation, but
  Slice 3A accepts `null` only until #242/T033 account effects land.
- The package root export is deliberately deferred to T034.

## Strict Red/Green evidence

- Generator Red failed because regeneration had no durable table-specific composite
  index output. Green exports `generateSchema`, emits the owner/action unique index,
  and passes the generator-output regression.
- Auth-race Red resolved with a prior-owner model after an account switch during the
  awaited batch. Green reasserts the expected user immediately after `database.batch`
  and rejects before returning any model.
- Package-surface Red found the premature root barrel export. Green removes it and
  keeps foundation callers on the internal capability until T034.
- Earlier Red phases covered malformed envelope values, canonical parity, outcome
  membership, timestamp years, state/evidence transitions, replay mismatch, RLS,
  immutable roots, deletion, user switching, restart, and sync exclusion.

## Final local verification

| Check | Result |
| --- | --- |
| `supabase/tests/financial_action_canonicalization_test.sql` | 65/65 passed against local PostgreSQL |
| Full `packages/logic` Jest | 66 suites, 1,141 tests passed |
| Exact mobile foundation/SQLite/sync suites | 3 suites, 31 tests passed |
| Transform-schema Node tests | 5/5 passed |
| Fresh SQLite duplicate owner/action insertion | rejected |
| Logic, DB, and mobile TypeScript | passed |
| Local-only schema/type regeneration | passed |
| Second generated-schema run | hash stayed `2106e67c300a752ca7fdf9ac97711ea8e682a2a3` |
| `git diff --check` | passed |

Repository-wide lint reports the known stacked-branch baseline of 46 errors. No new
lint finding is introduced by the changed production, generator, or public-surface
files. A mistakenly broad mobile selector also exercised 294 suites; its failures
were unrelated current-date SMS-draft fixtures plus native SQLite cross-suite test
isolation. The exact three financial-action suites then passed together 31/31.

No remote database was touched. PR #245 had no reported CI checks at the freeze, so
this evidence claims local verification only. Rebase remains deferred to the
integration owner because the stacked base advanced after Slice 3A began.

The frozen interface/schema hashes and dependency boundary are recorded in
`dependencies/financial-action-foundation.md`.
