# Slice 3A Generic Financial-Action Foundation — Static Green Evidence

Date: 2026-08-31
Branch: `codex/035-financial-action-foundation`
Working directory: `E:/Work/My Projects/Monyvi-metals-financial-actions`

## Implemented

- Restricted V1 canonical envelope validation, byte-stable serialization,
  injected UTF-8 SHA-256 hashing, durable states/outcomes, and replay handling.
- Current-user-scoped local root repository with one WatermelonDB writer per
  mutation, retry state, permanent root retention, and no account or balance writes.
- Permanent `financial_action_groups` generic-sync exclusion.
- Migration `067`, private SQL canonicalizer, server digest recomputation,
  immutable root/terminal outcome guard, owner-scoped RLS, indexes, and 30 pgTAP
  assertions.
- Offline-generated WatermelonDB migration v26, schema, persisted-field-only
  model, model registration, and export.
- Narrow schema-generator capability for four explicit SQL-null financial-action
  fields; ordinary nullable model generation remains unchanged.

## Red/Green and static verification

| Check | Result |
| --- | --- |
| Canonical contract, registry, and state-machine Jest | 77/77 passed |
| Repository, real SQLite adapter, and generic-sync Jest | 25/25 passed |
| Transform-schema Node tests | 4/4 passed |
| SQL-to-Watermelon generator regressions | 7/7 passed |
| `packages/logic` TypeScript | passed |
| `packages/db` TypeScript | passed |
| `apps/mobile` TypeScript | passed |
| Offline schema regeneration | passed; generated files formatted and linted; repeat hashes identical |
| Watermelon migration regeneration | passed; v26 detected and skipped |
| `git diff --check` | passed |

The generator capability followed strict TDD: two new tests first failed because
`generateBaseModel` was unavailable; after the narrow capability was implemented,
all four tests passed and full regeneration preserved the explicit-null fields.

## Remaining T024 SQL gate

Local PostgreSQL execution is pending. Docker Desktop's Linux engine pipe is absent,
and linked remote project `yulbcndyssdjicbpmlrk` is not identified as a safe
development target. No migration, reset, push, or remote type-generation command
ran. Migration `067` and the 30 pgTAP assertions must run locally before SQL parity
or interface/schema hash freeze is claimed.

## Review remediation

The reviewed trust-boundary findings were reproduced before their fixes. The mobile
repository now accepts only a typed envelope plus injected hash provider, validates
and hashes before opening the writer, derives every immutable root field, and
rechecks the authenticated user inside the writer. Authenticated remote access is
SELECT-only; root mutations are reserved for the dedicated server boundary. A
private trigger binds root columns to the canonical envelope, and expected account
revision is exact decimal text/null in PostgreSQL, WatermelonDB, generated types,
and the repository. The authorized root-barrel export exposes only the stable
financial-action API; T034 remains open for its remaining Metals integration and
post-T024 evidence.

A final least-privilege Red check also failed while the migration revoked only
INSERT/UPDATE/DELETE, because other table privileges could remain under default
grants. Green now uses `REVOKE ALL` followed by owner-scoped RLS plus `GRANT SELECT`;
the complete focused mobile/static suite passes 25/25.

Registry, state-machine, replay-collision, and opaque-row-identity remediation is
also green. Replay now requires exact canonical text and hash equality; the default
registry accepts only Metals Sell V1 and rejects account credit until dependency
`#242` is available. State transitions and durable evidence pairings use the frozen
matrix in TypeScript and migration `067`. Real WatermelonDB SQLite coverage proves
writer rollback, database re-instantiation, replay/retry, foreign-owner retention,
and independent local row identity.

The final repository review was reproduced Red before remediation: standalone roots
incorrectly started at `sync_pending`, and real SQLite replay/retry still exercised
the production singleton after reopening the database. Green now starts every
standalone root at `pending_local` and exposes an injectable repository factory while
preserving the production facade. Real SQLite tests bind a new repository instance to
the cloned/reopened database and perform both replay and retry through that instance.
Slice 3A does not expose a domain-completion or dedicated-sync queue command.

Database-review remediation adds explicit required-string type checks before SQL
value/regex checks, sequential payload-container validation before array expansion,
and stable `22023` domain errors for malformed values. Terminal server outcome,
canonical outcome JSON, and rejection evidence are frozen together; only a
`sync_failed -> sync_pending` retry may clear a rejection without server outcome.
Repository create/update/retry paths reassert the expected current user after their
final awaited lookup and before preparing or batching a write. Focused auth-race and
SQL-static tests are green; the expanded pgTAP plan contains exactly 30 assertions.

## Security-boundary verification amendment

The security follow-up was completed Red-first. Shared TypeScript and SQL validation
now enforce 50 numeric digits, 18 decimal places, positive gross proceeds,
non-negative fee/net minor units, 4,096 UTF-8 bytes of notes, 16 rate references,
and 65,536 UTF-8 bytes for the canonical action. Oversize raw action text fails
before parsing with `financial_action_payload_too_large`.

Read paths reassert the authenticated user after the awaited owned-row lookup and
withhold the row after a session switch. Dependency failures normalize to
`financial_action_auth_scope_changed`. A `reconciliation_incomplete -> accepted`
recovery may clear only its rejection code, and only while accepted/idempotent
outcome evidence remains byte-identical.

Final verification: focused financial-action logic 95/95; full logic 65 suites and
1,132/1,132; repository/real-SQLite/static 3 suites and 27/27; transform-schema 4/4;
SQL-to-Watermelon 7/7; logic, DB, and mobile TypeScript passed; and
`git diff --check` passed. Offline regeneration reproduced hashes
`8e6f71b0e26a3711d4ebea907d3df43b17ecde2b`,
`d6cba7d9a54d23f09bb9597636e5a6b81b3a4272`, and
`821c63c768d25c9b9c9fded4b92f72ce81b6e353` exactly before/after.

The pgTAP file now declares `plan(44)` and contains exactly 44 assertions. Runtime
execution remains the only open T024 gate because Docker Desktop's Linux engine is
unavailable; no linked remote database was touched.

## QA automation amendment

The QA coverage gaps were closed without changing production behavior. New
characterization tests prove both authoritative-rejection recovery paths,
byte-identical rejected-compensation reconciliation, and rejection of a foreign
envelope user before hashing or opening a Watermelon writer.

The pgTAP plan now contains exactly 63 assertions. It adds executable owner-only
SELECT behavior, foreign-row invisibility, authenticated write denial, private
helper execution denial, a privileged valid-root fixture, all nine immutable root/
retention update attempts, and a final no-mutation assertion. Focused
financial-action logic passes 98/98; repository/real-SQLite/SQL-static coverage
passes 29/29; transform-schema passes 4/4; SQL-to-Watermelon passes 7/7; logic, DB,
and mobile TypeScript pass; regeneration remains clean; and `git diff --check`
passes. Runtime execution of the 63 pgTAP assertions remains T024's only open gate.
