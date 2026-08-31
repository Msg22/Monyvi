# Metals Implementation Evidence

## Scope

Append-only future evidence ledger. Slice 1 creates this template only: no
production code/test work ran.

### User Delivery Directive — 2026-08-31

The team lead may create local commits, push branches, open separate slice PRs,
address review/CI findings, and merge only after required review gates pass, CI is
green, and no review comment remains unresolved. This does not authorize a premature
or cross-slice merge, remote database/Supabase mutation, or unrecorded verification.
Optional `before_implement` MUST NOT run unless separately requested.

## Red / Green / Refactor Record

```markdown
### [Slice/task or story] — [date]

Base: [verified commit/hash or explicitly uncommitted approved base]
Owner: [named owner]
Scope: [owned files only]
Requirements: [FR IDs, SC IDs, checklist proof IDs]

#### Red gate
| Test or command | Expected missing behavior | Actual failure | Result |
| --- | --- | --- | --- |
| `[exact command]` | [specific failure] | [output/evidence] | Red / stop |

#### Green gate
| Test or command | Expected behavior | Actual result | Evidence |
| --- | --- | --- | --- |
| `[exact command]` | [observable acceptance] | pass/fail | [path/run/log] |

#### Refactor and verification
| Check | Result | Evidence |
| --- | --- | --- |
| Focused suites | pass/fail | [exact command/output] |
| Type/lint/migration as applicable | pass/fail | [exact command/output] |
| `git diff --check` | pass/fail | [output] |
| Rebase/overlap review | pass/fail | [base/shared-file check] |

Manual-only cases: [scenario, runner limit, human owner, evidence]
Stop conditions triggered: [none or exact condition/action]
```

Green starts only after every listed test fails for intended missing behavior.
Infrastructure, fixture, type, or unrelated failure is a stop, not Red evidence.

## Command Log Rules

- Record exact command, working directory, date, base, result, and linked
  output for Red/Green, migration, SQLite, SQL, typecheck, lint, Maestro, hash,
  and diff checks.
- Never record an unrun command as passed. Keep blocked runner cause plus
  manual-only owner/rationale.
- Re-run and append affected evidence after rebase, source-hash drift, schema or
  fixture regeneration; do not overwrite historical evidence.

## Stop Conditions

Stop and return to owner/product for source-authority conflict; unapproved
business/schema/sync/account/design decision; non-intended Red failure; Green
regression; non-determinism; dirty/overlapping shared owner files; changed base;
migration collision; generated drift; asset mismatch; incomplete writer inventory;
unproven local/RPC atomicity; unsafe user scope; watermark safety failure; or
inaccessible consequential flow.

## Optional Hook Prohibition

`.specify/extensions.yml` marks `before_implement` as `optional: true`. It is
not required and MUST NOT run unless later explicit authorization requests its
commit action. Hook availability is never commit authorization.

### Slice 3A static implementation — 2026-08-31

T020–T023 are implemented and statically green. Executable results: canonical
logic/registry/state machine 77/77, mobile repository/real SQLite/sync 25/25,
transform generator 4/4,
SQL-to-Watermelon generator 7/7, all three relevant TypeScript projects, offline
regeneration, and `git diff --check` passed. See
`evidence/slice-3a-static-green.md`.

T024 remains open. Docker's local Linux engine is unavailable and the linked remote
target is ambiguous, so migration `067` and its 30 pgTAP parity assertions were not
executed. The remote was not touched. The pending local SQL and hash-freeze steps are
recorded in `dependencies/financial-action-foundation.md`.

Review remediation then tightened the foundation without widening product scope:
authenticated remote clients are SELECT-only, canonical envelope/root binding is
trigger-enforced, local creation validates and hashes a typed envelope before its
writer, and expected account revision is exact decimal text/null end to end. The
focused mobile suites increased to 25/25 passing. Replay now requires both exact
canonical text and hash equality, local row IDs are independent from action IDs,
root deletion is forbidden, and registry/state-machine parity is authored in
TypeScript and SQL. The single authorized
`packages/logic/src/index.ts` export exposes this stable API only; T034 remains open.

Final repository review then corrected the standalone lifecycle boundary and test
injection seam. Strict Red was 9/16 passing with seven intended failures: three for
the incorrect `sync_pending` initial state and four for the missing repository
factory. Green is 16/16 for focused mock/real-SQLite coverage and 25/25 for the full
repository/SQLite/sync set. New roots remain `pending_local`; Slice 3A neither fakes
domain completion nor queues dedicated sync. Reopened-database replay and retry now
run through a repository instance injected with that database, while production
callers retain the default facade.

Database review added typed SQL-boundary parity, sequential malformed-container
handling, terminal rejection-evidence immutability, and a final auth reassertion after
every awaited repository lookup. TypeScript parity coverage and the full logic suite
pass 77/77; repository/SQLite/static coverage passes 25/25. Migration `067` now has
an exactly counted 30-assertion pgTAP plan, still pending local runtime execution.

Security-boundary amendment: TypeScript and SQL now share the frozen action limits
(50 digits, scale 18, positive gross, non-negative fee/net, 4,096 UTF-8 note bytes,
16 rate references, and a 65,536-byte canonical action). Read lookup races reassert
auth before returning, and reconciliation may clear only its rejection code while
accepted/idempotent outcome evidence stays byte-identical. Focused financial-action
logic passes 95/95, full logic passes 1,132/1,132, mobile repository/real-SQLite/
static suites pass 27/27, generator suites pass 4/4 and 7/7, all relevant TypeScript
checks pass, regeneration hashes are unchanged, and `git diff --check` passes. The
pgTAP plan/assertion count is now exactly 44; T024 remains open only for local SQL
runtime execution because Docker is unavailable, and the linked remote was untouched.

QA automation amendment: state/recovery and pre-hash ownership characterization is
green at 98/98 focused logic tests and 29/29 repository/real-SQLite/SQL-static tests.
The executable pgTAP plan is now exactly 63 assertions, including owner/foreign RLS,
authenticated write and private-helper denial, all immutable root fields, retention,
and post-failure no-mutation behavior. Generator tests remain 4/4 and 7/7, all three
TypeScript checks pass, regeneration is clean, and `git diff --check` passes. T024
still awaits only local execution of these 63 assertions; no remote was touched.
