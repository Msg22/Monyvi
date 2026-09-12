# Slice 4 Metals Persistence — Runtime Completion Evidence

Date: 2026-09-05

Base: `be7ce054b772d6618e5113df45c4b90ada55084c` (`origin/main`)

## Completion boundary

This checkpoint completes the local-first, no-account Metals persistence lane:

- one atomic WatermelonDB writer for Add, Correct, Sell without credit, Dispose,
  Delete, and Undo without credit;
- canonical payload validation and hashing with the same `validationInput`;
- owner-scoped replay, payload-hash mismatch rejection, holding CAS, rollback,
  immutable owner evidence, lifecycle events, and rate references;
- dedicated PostgreSQL `apply_metal_action_v1` validation/CAS/replay path with
  no account effect and no competing outbox;
- durable name/notes LWW clocks, null-baseline behavior, stable retry identity,
  terminal-holding support, and a dedicated metadata RPC;
- generic sync protection for Metals-only metadata/action fragments while
  preserving non-Metals asset behavior; and
- stale/rejected/incomplete outcome classification with verified evidence and
  one lock/exact-once recovery boundary.

T042 remains unchecked only because `npm run db:migrate` cannot perform its
remote dry-run/push phase from this unlinked worktree. Its local equivalent was
completed: migrations 001–068 replayed from a clean database, local types and
Watermelon schema were regenerated, exact decimal/bigint text overrides and
required local unique indexes were audited, and pgTAP/database lint passed.

## TDD evidence

The new SQLite and sync tests were observed Red before implementation. The final
validator audit also produced three PostgreSQL Red failures before the fix:

- Add accepted a non-canonical material decimal;
- Add accepted an incomplete acquisition rate-reference set; and
- Correct accepted a metadata no-op.

The minimum registered-validator change now rejects all three before writes and
keeps the TypeScript/PostgreSQL Dispose code catalog identical.

## Automated verification

All Supabase commands below used `--local`; no remote database was changed.

| Gate                              | Result                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Clean migration replay            | Pass: `npx supabase db reset --local`, migrations 001–068 plus seed                                                           |
| Metals pgTAP                      | Pass: 104/104                                                                                                                 |
| Supabase database lint            | Pass: `extensions`, `private`, and `public`, error level                                                                      |
| Slice 4 mobile matrix             | Pass: 11/11 suites, 77/77 tests                                                                                               |
| Real SQLite action writer         | Pass: Add/Correct/Sell-no-credit/Dispose/Delete/Undo, replay, CAS, rollback, owner scope, restart                             |
| Reconciliation/sync/rate/metadata | Pass: metadata-only push acknowledgement, pull/push failure, protected fragments, LWW/retry/restart, rejection classification |
| Logic registry                    | Pass: 14/14 tests, including exact Arabic canonical hash and six Dispose codes                                                |
| Mobile TypeScript                 | Pass                                                                                                                          |
| Logic TypeScript                  | Pass                                                                                                                          |
| DB TypeScript                     | Pass                                                                                                                          |
| Focused ESLint                    | Pass with project custom rules and zero errors                                                                                |
| Prettier                          | Pass for all changed TypeScript files                                                                                         |
| Local generation                  | Pass: `npm run db:sync-local`; exact numeric/text and local-index overrides re-audited after generation                       |
| Diff whitespace                   | Pass before checkpoint                                                                                                        |

The 11-suite matrix contains migration/model, SQLite foundation,
reconciliation/sync/rate/metadata, sync config/ownership/push/pull/dedicated
rejection, EN/AR content, fixture registry, and render-manifest coverage.

## Security and integrity evidence

- Financial decimals and revisions remain `numeric`/`bigint` remotely and
  canonical strings at JavaScript/Watermelon boundaries.
- All user-owned Metals tables are owner-scoped, RLS-enabled, indexed for
  ownership/relationships, soft-delete compatible, and authenticated clients
  receive SELECT-only table access.
- Dedicated RPCs are authenticated, owner-scoped, idempotent, hash-verifying,
  holding-locked, CAS-protected, and reject account effects.
- Private security-definer helpers fix `search_path` and revoke execution from
  PUBLIC, anon, and authenticated roles.
- Every accepted no-credit action writes one root, one owner evidence row, one
  lifecycle event, and only its immutable role-specific rate references.
- Metadata clocks are nullable without fabricated backfill; omitted fields stay
  unchanged and equal-clock/different-value retry conflicts fail closed.

## Coverage matrix and limits

| Scenario                                     | Automated evidence                                      | Manual/external limit                                                                              |
| -------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Six no-credit local actions                  | Real SQLite integration matrix                          | UI journeys belong to later slices                                                                 |
| Same-ID replay / different-hash rejection    | SQLite and pgTAP                                        | None                                                                                               |
| One holding CAS winner / stale loser         | SQLite and pgTAP                                        | Multi-device transport is exercised through the RPC contract, not two physical devices             |
| Atomic rollback and cross-user rejection     | SQLite and pgTAP                                        | None                                                                                               |
| Fresh-database durability/restart            | Watermelon clone/reopen tests and clean Supabase replay | None                                                                                               |
| Metadata partial LWW, retry, terminal states | SQLite plus PostgreSQL RPC tests                        | None                                                                                               |
| Generic sync cannot bypass Metals clocks     | Pull/push ownership tests                               | None                                                                                               |
| No issue-242 account effect                  | Registry, adapter, SQLite, and RPC assertions           | Account-credit integration remains owned by issue #242                                             |
| Remote migration application                 | Not claimed                                             | Worktree is not linked to a Supabase project, so `npm run db:migrate` stops before remote mutation |

## Dependency proof

Slice 4 depends only on completed T017 (exact Metals logic) and T024 (generic
financial-action foundation). No implementation here depends on issue #242,
migration 069, Add/Edit/Sell UI work, or later portfolio/story routes.

This evidence supports T036, T037, T043, T044, T045, and T049 as complete. T042
remains open solely for the linked-project `npm run db:migrate` execution.
