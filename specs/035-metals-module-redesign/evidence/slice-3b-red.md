# Slice 3B Account Financial Effects — Preparatory Red Evidence

Date: 2026-09-01
Branch: `codex/issue242-account-effects-slice3b`
Working directory: `E:/Work/My Projects/Monyvi-issue242-account-effects`
Base: PR #254 head `47d6fc3de09ec0c848f68e19fd94de09fb0c79fe`
RED prerequisite: `9014ef8` cherry-picked as `61a25ad`

## Authority boundary

T025-T029 were checked against live issue #242, the constitution, business
decisions, the Slice 3B contracts, and
`slice-4-action-schema-decision-matrix.md`. The matrix authorizes schema,
revision, effect, owner, immutability, and fail-closed preparation, but blocks an
accepted mutation RPC until at least one versioned action payload schema is
approved.

This batch therefore leaves T029 incomplete. Migration `069` does not register
transaction, transfer, or credited-Metals payloads and does not create an
accepted mutation RPC. T030-T032 application boundaries remain intentionally Red.

## T025 writer inventory and completeness guard

Command:

```text
npm test -w apps/mobile -- --runInBand --no-watchman __tests__/architecture/account-balance-writer-guard.test.ts __tests__/services/account-financial-action-protocol.integration.test.ts
```

Result: 7 tests ran; 3 passed and 4 intentionally failed.

- Green: all 16 active local mutation primitives, 10 indirect runtime paths,
  and 6 remote/fixture/repair/sync bypasses are present in the inventory.
- Green: every current local `account.balance` assignment maps to one of the 16
  inventoried writers; no unknown mutation was found.
- Green: the frozen foundation remains guard-free before the #242 cutover.
- Intended T032 Red: `account-balance-writer-registry.ts` does not exist.
- Intended T030 Red: `account-balance-command-service.ts` does not exist.
- Intended T031 Red: `financial-action-sync-service.ts` does not exist.
- Intended T031 Red: `financial-action-reconciliation-service.ts` does not exist.

The first two Green assertions complete the T025 inventory audit. The remaining
application failures are preserved prerequisites, not SQL defects.

## T026 static migration contract

Initial RED command:

```text
npm test -w apps/mobile -- --runInBand --no-watchman __tests__/migrations/account-financial-effects-cutover.test.ts
```

Initial result: 8/8 failed. Seven failed because migration `069` did not exist;
the eighth named the unapproved accepted CAS/RPC contract.

Preparatory result after migration implementation: 7/9 passed. The seven Green
assertions prove:

- legacy accounts start at exact bigint revision `0` without fabricated roots or effects;
- owner/action/account-bound immutable effect storage uses exact bigint values;
- canonical sorted account-guard validation and deferred guard/effect parity exist;
- revision and effect range constraints fail closed;
- authenticated generic writes cannot change `accounts.balance` or
  `accounts.financial_revision`, while metadata-only updates remain allowed;
- effects are owner-only read-only rows under RLS; and
- no unapproved action payload validator or accepted mutation RPC is registered.

Two intentional Reds remain:

- accepted CAS/RPC activation requires an approved versioned action payload contract; and
- T032 writer routing plus legacy drain/migrate/quarantine are not implemented.

## T027 PostgreSQL contract

Test artifact: `supabase/tests/account_financial_effects_test.sql`.

Fresh local replay applied migrations `001` through `069`, including the final
`069_account_financial_effects.sql`, from an empty local database volume.

Command:

```text
supabase test db supabase/tests/account_financial_effects_test.sql
```

Result: 45 assertions ran; 38 passed and 7 intentionally failed. Green coverage
includes revision-zero behavior, effect shape and exact bigint types, owner
foreign keys, indexes, RLS/privileges, protected account writes, metadata-only
updates, immutable evidence, empty-guard/no-effect completeness, effect-without-
guard rejection, canonical ordering, leading-zero rejection, exact signed-bigint
maximum parsing, non-invertible minimum rejection, exactly-once reversal identity,
and account currency/domain binding.

Assertions 39-45 remain intentionally Red and separately identify:

```text
accepted/idempotent replay; payload-hash mismatch; deterministic lock order plus
two-account transfer guards; account-only stale evidence; invalid/exhausted
revisions; atomic rollback/failure propagation; and dedicated sync/exact-once
compensation
```

Those scenarios cannot honestly become Green without inventing the blocked
request payload and mutation endpoint. They remain the explicit T029/T030-T032
handoff.

## Regression safety

Command:

```text
supabase test db supabase/tests/financial_action_canonicalization_test.sql supabase/tests/metals_domain_test.sql
```

Result: 121/121 predecessor assertions passed (66 foundation and 55 Metals).
The preparatory migration preserves the frozen foundation validator and existing
Metals fail-closed behavior.

## Gate

T025, T026, T027, and this T028 evidence are complete for the authorized
preparatory boundary. T029 is deliberately not complete. The next approval gate
must provide a versioned action payload contract before implementing accepted
CAS, replay/idempotency, deterministic resource locks, stale evidence, atomic
balance/revision/effect/outcome mutation, or durable rejection outcomes.
