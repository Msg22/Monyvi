# Slice 4 Metals Persistence — Green Evidence (publication pending)

Date: 2026-08-31

Base: `8cc090346004b590ed5d2e53d2ec3e6c829a517f` (`origin/main`)

Status: implementation and the current local verification set are Green. T049
remains open until the announced financial-foundation follow-up is rebased and
the contract gaps under **Open freeze blockers** are resolved. This document
must not be used as a publication or merge claim yet.

## Prerequisite termination

Slice 4 has exactly two prerequisite leaves:

- T017 is checked complete in `tasks.md` and its final Green/type-check evidence
  is in `evidence/slice-2-green.md`.
- T024 is checked complete and frozen in
  `dependencies/financial-action-foundation.md`.

T025–T033 and migration 069 are not transitive prerequisites. No Slice 4 source,
migration, test, or fixture implements account balance/revision/effect behavior
from issue #242.

## Strict TDD evidence

The initial six-suite Red gate is recorded in `slice-4-red.md`: 6 failed suites
and 11 intended failures before any Slice 4 production file existed.

Two refactor findings were also proven Red before correction:

- non-canonical account evidence ordering was incorrectly accepted as
  `account_only_stale_ready`; malformed account revisions escaped
  classification; both now fail closed as `reconciliation_incomplete`;
- lifecycle event links initially used UUID-only foreign keys; focused migration
  assertions failed until effective, predecessor, and reversal links were
  constrained by owner plus holding;
- the new private canonical-revision function initially retained PostgreSQL's
  default public execute privilege; a focused assertion failed until PUBLIC,
  anon, and authenticated execute were explicitly revoked.

## Current Green gate

All commands ran from `E:\Work\My Projects\Monyvi-metals-persistence`. Supabase
commands used `--local`; no remote project was linked, pushed, reset, or
mutated.

| Check                                          | Result                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npx supabase db reset --local`                | Pass. Recreated the disposable local database, replayed migrations 001–068 in order, and seeded successfully. |
| `npx supabase db lint --local --level error`   | Pass for `extensions`, `private`, and `public`.                                                               |
| Slice 4 plus foundation/sync affected Jest set | Pass: 13/13 suites, 83/83 tests, 0 snapshots.                                                                 |
| `npm run typecheck -w @monyvi/mobile`          | Pass.                                                                                                         |
| `npm run typecheck -w @monyvi/db`              | Pass.                                                                                                         |
| `npm run lint -w @monyvi/mobile`               | Pass.                                                                                                         |
| `git diff --check`                             | Pass.                                                                                                         |

The 13-suite affected set contains all T035–T040 suites plus the existing
generic foundation integration/SQLite, sync config, ownership guard, pull
dispatcher, push service, and generic dedicated-table exclusion suites.

## Persistence and security checks

- Migration order remains 067 financial foundation, then 068 Metals domain. No
  069 file exists.
- Financial and revision values use PostgreSQL `numeric`/`bigint` and canonical
  text locally; no floating-point value is introduced as a new exact source of
  truth.
- Every user-owned Metals table has `user_id`, `created_at`, `updated_at`, and
  `deleted`; the shared pull-only observation table uses the documented
  server-table exception.
- User-owned tables have RLS enabled, `(SELECT auth.uid())` SELECT policies,
  indexed owner/foreign-key paths, and SELECT-only authenticated grants.
- Lifecycle links cannot cross owner or holding. Action and holding links use
  composite ownership constraints.
- The private `SECURITY DEFINER` revision parser fixes `search_path`, revokes
  default execute from PUBLIC/anon/authenticated, and grants only `service_role`
  execution.
- Generic sync strips action-owned projection fragments, excludes dedicated
  action tables, treats observations as pull-only, and propagates pull/push
  failure without advancing watermarks or marking dirty rows synced.

## Coverage and manual test matrix

| Scenario                                                                                                            | Automated evidence                                                                    | Manual / runner status                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guarded Gold/Silver exact backfill; unknown provenance stays nullable; no invented acquisition action               | `metals-domain-backfill-model.test.ts`; full local migration replay                   | Inspect representative migrated rows after final stacked rebase.                                                                                           |
| Owner-scoped Add/correct/Sell-without-credit/Dispose/Delete/Undo; canonical revision CAS; rollback; replay; restart | `metal-financial-action-foundation.integration.test.ts` with real SQLite clone/reopen | No UI exists in this slice.                                                                                                                                |
| Stale, rejected, incomplete, foreign/hash-mismatch, account-only stale, action lock, exact-once restart             | `metals-reconciliation-sync-rate.integration.test.ts`                                 | Full remote outcome exercise is blocked until the dedicated RPC/sync contract below is resolved.                                                           |
| Pull/push failure does not advance metadata or mark dirty rows synced                                               | reconciliation suite plus existing pull/push/foundation exclusion suites              | Network interruption can be exercised after the real dedicated path exists.                                                                                |
| EN/AR parity, approved Gold/Silver copy, interpolation, stable codes, no retired profit/loss wording                | `metals-content-contract.test.ts`                                                     | Story slices own rendered locale/RTL verification.                                                                                                         |
| Fresh/stale/unknown/missing, local/restart/conflict, eligibility, locale/theme/text scale profiles                  | `metals-e2e-fixture-registry.test.ts`; executable local seed/inspect/reset cycle      | Deterministic holding state and global observation rows are now seeded, inspected by exact fixture IDs, and reset without deleting unrelated observations. |
| Gold/Silver bar/coin/jewelry render selection, accessible text identity, neutral fallback, approved file provenance | `metal-render-manifest.test.ts` SHA-256 and completeness assertions                   | Visual approval is inherited from the supplied design handoff; no image was generated or redesigned.                                                       |

## Open freeze blockers

1. Migration 067's immutable production/SQL registry currently recognizes only
   the exact `metals.sell/v1` fixture schema. The local Slice 4 adapter cannot
   freeze Add/correct/dispose/delete/undo parity by substituting permissive
   production validators.
2. Dedicated Metals tables are excluded from generic sync as required, but no
   actual dedicated remote RPC/push route is present in the task-owned files.
   Helper strategy tests prove failure semantics, not end-to-end cloud delivery.
3. The command contract says the action hash binds expected holding revision,
   while T042 says the expected revision is persisted only in Metals
   event/evidence. The current generic envelope does not hash that revision; the
   authoritative payload placement must be confirmed before changing the
   immutable V1 preimage.
4. The announced financial-foundation follow-up will supply the canonical
   revision parser, linked-operation ownership validator, and generic
   dirty-state fail-closed guard. Slice 4 must rebase onto it and remove/adapt
   overlapping local seams before compatibility can be frozen.

## Stacked-preparation addendum

The safe, parent-independent lane added a real fixture-engine and SQL
verification cycle without changing parent-owned generic foundation or sync
files:

| Check                          | Result                                                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixture engine Red             | 1 intended Jest failure: no `metal_holding_states` or `market_rate_observations` upserts.                                                                  |
| Fixture date Red               | 1 intended Jest failure plus one real local seed failure: PostgreSQL rejected the millisecond purchase date.                                               |
| Fixture unit Green             | 1/1 suite, 4/4 tests.                                                                                                                                      |
| Executable local fixture cycle | `seed`, `inspect`, and `reset` passed for `metals-fresh-local-en-light`; post-reset inspection returned zero rows for all four deterministic table groups. |
| SQL Red                        | `metals_domain_test.sql` stopped at the absent holding-CAS binding helper.                                                                                 |
| SQL Green                      | Foundation plus Metals pgTAP: 2/2 files, 87/87 tests.                                                                                                      |
| Current six Slice 4 suites     | 6/6 suites, 29/29 tests.                                                                                                                                   |
| Mobile typecheck               | Pass.                                                                                                                                                      |
| `git diff --check`             | Pass.                                                                                                                                                      |

The private SQL helper now enforces only the approved schema-independent
boundary: the six version tuples, holding/domain-reference equality, empty
account guards, and a canonical expected revision carried inside the hashed
payload. It grants no client mutation path and does not register or infer
action-specific fields. The unresolved field decisions are recorded in
`slice-4-action-schema-decision-matrix.md`; T042–T049 remain open.

## Workflow incident

During the earlier requested base move, a PowerShell command chained operations
after a rebase failure. Git retained the stash and recovery completed without
data loss, as recorded in `slice-4-red.md`. All later state-changing Git
operations are required to run one command at a time. No publication, merge,
remote Supabase mutation, dependency install, or cleanup of another worktree
occurred.
