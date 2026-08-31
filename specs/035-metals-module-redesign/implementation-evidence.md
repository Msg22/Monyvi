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

### Slice 3A T024 final runtime freeze — 2026-08-31

This final entry supersedes the earlier incremental Slice 3A gate counts and pending
Docker notes. The local Supabase runtime was available, migration `067` was applied
locally, and the final expanded pgTAP plan passed 65/65. The linked remote database
was not touched.

Strict Red/Green remediation also made the local owner/action unique index
generator-owned, withheld a created model when auth changes during the awaited
batch, and removed the premature Financial Actions root-barrel export until T034.
Fresh SQLite duplicate insertion is rejected. Exact mobile foundation/SQLite/sync
suites pass 31/31; full logic passes 66 suites and 1,141 tests; transform-schema
passes 5/5; logic, DB, and mobile TypeScript checks pass; and repeated local schema
generation preserves hash `2106e67c300a752ca7fdf9ac97711ea8e682a2a3`.

Implementation freeze commit is `ecb673971f1071d131c1f5795a1ec3e4972eb3cc`
against stacked base `be99eba76757a966ea80b0c070f71fce1e58c33a`.
Repository-wide lint remains at the known 46-error stacked-branch baseline; no CI
green claim is made because PR #245 reported no checks at freeze. T024 is complete.

### Slice 3A main-rebase and account-guard reconciliation — 2026-08-31

This supersedes prior stacked-base hashes, counts, scalar
expected-account-revision wording, and lint baseline. Seven Financial Actions
commits were transplanted from merge-base
`d1f865948a28141653c7c829714805d57b499fa4` onto main
`e02ca34cbc0cb56bdab84ed22d14056bdada9ce5`; safety ref
`codex/backup-035-financial-action-foundation-pre-main-20260831` preserves
`4a349642c55a561ca23b3b45f9dda06dd7cb72e5`.

Current main requires deterministic `accountGuards`. Strict Red rejected that
envelope against the scalar implementation. Green aligns TypeScript, repository,
WatermelonDB generation, SQL, pgTAP, and canonical fixture. Slice 3A accepts only
`[]`; populated guards/account effects remain gated by #242/T033. T018–T024 stay
complete and root exports remain deferred to T034.

Local evidence: reset through migration 067; pgTAP 66/66; focused logic 104/104;
full logic 69 suites and 1,221/1,221; mobile repository/SQLite/sync 31/31;
generator 5/5; all TypeScript checks; lint 0 errors/278 warnings; and
`git diff --check` passed. A second `db:sync-local` preserved diff hash
`e7748f03cbcce546fc54e543ee4cb214dafe176a`. Implementation freeze is
`c3a6fc7d804d5efb5a829f1141214d85059e124f`. No remote database was touched.

### Slice 3A validator-output numeric rejection — 2026-08-31

Review thread `PRRT_kwDOT16ATM6dn3T5` identified that a custom registry validator
could return a runtime number after the initial envelope inspection. The canonical
serializer has no numeric branch, so the value could otherwise be misserialized
before hashing.

Strict Red was one intended failure with 70 existing contract tests passing:
canonicalization did not raise `financial_action_unsupported_value`. Green
re-inspects the validated payload, recursively rejects any number with that stable
error, and proves the hash provider is never called. The canonical contract passes
71/71; focused Financial Actions passes 105/105; full logic passes 69 suites and
1,222/1,222; logic TypeScript passes; repository-wide lint has 0 errors and 278
warnings; and unaffected local pgTAP remains 66/66. The approved Arabic vector and
digest are unchanged. New implementation freeze is
`2ca7eaaad293c075d71b14304f0aeaf30d2d6d49`; logic tree hash is
`2f8735847a2cf58cdf35bab20b47cf3d5bd0d07c`.

### Slice 3A atomic local composition and auth-race remediation — 2026-08-31

Review threads `PRRT_kwDOT16ATM6drmjS` and `PRRT_kwDOT16ATM6drmjY` identified two
valid P1 gaps: update completion could return after the authenticated user changed
during its awaited batch, and root-only creation could leave `pending_local`
without the linked domain evidence that later Metals commands must write.

Strict Red produced four intended failures with 17 existing repository tests
passing. Green reasserts auth after update batches and adds the explicit
`commitFinancialActionGroupLocally` surface. Inside one Watermelon writer it checks
owned replay first, skips linked preparation for completed same-hash replay, permits
a matching pending root to resume, rejects empty/root-targeting plans, and commits
the root transition plus caller-prepared linked operations in one database batch.
Cached models are restored when preparation or the batch fails; a post-commit auth
change prevents returning the row but does not claim to undo committed SQLite.

Final scoped evidence: repository tests 26/26; repository/SQLite/generic-sync
40/40; full logic 69 suites and 1,222/1,222; logic, DB, and mobile TypeScript;
generator 5/5; local pgTAP 66/66; local `db:sync-local` with zero generated drift;
repository lint 0 errors and 272 pre-existing warnings with changed files clean;
and `git diff --check`. Full mobile reached 293/294 suites and 2,525/2,526 tests;
the sole failure is a reproducible pre-existing order-dependent Watermelon SQLite
test-harness leak tracked by issue #247, while the affected suite passes 5/5 alone
and all PR-scoped suites are green. No remote database was touched. Implementation
freeze is `84afb2f53c61aeda6f1d7b55bf4c34b56467b68e`; mobile repository blob is
`0f5dfe947f60908ef67e887738fb9bf32d520a74`.

### T034 package integration — 2026-08-31

Base: `f63468b8c3621aa001a7186845da808562328b3b`
Owner: package-integration owner
Scope: the `@monyvi/logic` root barrel, its dedicated public-surface test, T034
status, and this evidence entry only

The focused Red command was
`npm test -w @monyvi/logic -- --runInBand src/financial-actions/__tests__/public-surface.test.ts --watchman=false`.
It failed for the intended missing behavior: the exact Metals root export count was
zero instead of one. An earlier test-only attempt imported the complete root at
runtime and encountered the existing Expo Crypto Jest transform boundary; it was
removed before production changed and is not counted as Red evidence.

Green adds exactly one `./financial-actions` export and one `./metals` export. The
same focused command passes 1/1. Full `@monyvi/logic` Jest passes 69/69 suites and
1,222/1,222 tests; `npm run typecheck -w @monyvi/logic` passes; repository lint
passes with 0 errors and 272 pre-existing warnings; and `git diff --check` passes.

Manual plan: inspect the root barrel and confirm each owned domain barrel appears
once. No UI, database, synchronization, financial calculation, or account-effect
behavior changes in T034; downstream consumer journeys remain owned by later tasks.
No stop condition remains active.

### PR #250 post-merge foundation safety follow-up — 2026-08-31

Base: `8cc090346004b590ed5d2e53d2ec3e6c829a517f`
Owner: financial-action foundation follow-up
Scope: linked-operation ownership validation, generic-push dirty dedicated-table
failure, the canonical unsigned-revision runtime constructor, focused contracts and
tests, and this evidence entry. No completed task checkbox changed.

Focused Red used three isolated commands. The canonical action-contract suite failed
17/87 assertions because `parseCanonicalUnsignedIntegerString` did not exist. The
foundation repository suite failed 3/29 assertions because ownership validation was
not invoked and foreign direct-owner/owned-parent plans reached the batch boundary; a
fourth focused assertion freezes omission of the mandatory validator as invalid.
The push/contract suites failed 4/16 assertions because dirty dedicated-table changes
were skipped instead of rejecting generic synchronization.

Green requires every linked plan to assert ownership for the exact cached and prepared
model sets before one atomic batch, followed by an auth reassertion. It rejects an
omitted validator, restores cached Watermelon raw state after validation failure,
does not prepare or validate linked work on replay, and keeps domain-specific direct or
owned-parent validation outside the generic repository. Generic push now throws
`sync_dedicated_table_changes_pending` before auth lookup or remote writes whenever a
dedicated table has created, updated, or deleted changes; empty dedicated change sets
remain excluded and non-blocking. The exported revision constructor accepts only `0`
or no-leading-zero unsigned decimal text bounded to PostgreSQL signed-bigint max and
rejects JavaScript numbers and every noncanonical or overflowing input.

Focused Green: revision contract 87/87, foundation repository 30/30, and generic-sync
16/16. Broad Green: full logic 69/69 suites and 1,238/1,238 tests; mobile foundation,
SQLite, generic sync, sync wrapper/config/ownership/transform coverage 8/8 suites and
98/98 tests; logic and mobile typechecks pass; repository lint reports 0 errors with
272 pre-existing warnings; and `git diff --check` passes. No migration, schema artifact,
dedicated synchronizer, remote database mutation, or account-guard enablement is
included.

Manual plan: inspect the linked plan contract and verify every future caller must
provide a real direct-owner or owned-parent assertion; inspect generic push ordering
and verify the dedicated dirty check precedes auth and all Supabase calls; verify the
revision parser boundary values against PostgreSQL signed-bigint max. Automated tests
cover the executable paths, so no emulator journey is required for this infrastructure
follow-up.

### PR #251 review hardening — 2026-08-31

Live review validation found all three unresolved threads valid. Installed
WatermelonDB source confirms `synchronize()` passes
`experimentalRejectedIds` into `markLocalChangesAsSynced`; rejected created and
updated IDs are not marked synced, and rejected deleted IDs are not destroyed. The
safe generic-sync design therefore rejects every captured dedicated-table ID without
owner filtering, skips every dedicated remote write, and still pushes unrelated
owner-scoped generic changes. This removes the post-pull failure/watermark hazard and
prevents a prior user's dirty dedicated root from blocking the current user's generic
sync while leaving that foreign root dirty. An independently found auth-loss test also
requires `sync_push_auth_scope_lost` if auth disappears before push, so no unsent
generic row can be acknowledged.

This rejected-ID contract supersedes the earlier dated generic-push throw and
related manual-plan wording above; those lines remain only as historical evidence.

Linked operation plans now separate genuine prepared creates from declarative
existing-model operations and require separate cached-preimage and prepared-postimage
ownership validators. The repository derives every cached model from the existing
operation descriptors, validates and snapshots those preimages, and only then invokes
their update or delete preparation. Prepared validation receives the exact cached
models and prepared operations so domain implementations can recheck direct owners and
immutable owned-parent links. Auth is reasserted after each asynchronous validator,
cached state is restored before commit on failure, and replay invokes neither validator
nor existing-model preparation.

Focused Red, rerun with `--no-watchman` after the Windows Watchman pipe failed before
test execution: 4/4 suites failed with 8 failed and 61 passed of 69 tests. Failures
proved the dedicated throw, discarded push result, missing rejected-ID contract,
owner-rewrite bypass, and missing two-phase callback order. The added auth-loss
lifecycle test separately resolved instead of rejecting before the stable error was
implemented. Final focused Green is 4/4 suites and 51/51 tests. Relevant foundation and
sync Green is 9/9 suites and 103/103 tests; mobile typecheck passes. No schema, migration,
changed-file lint passes, and full repository lint reports 0 errors with 272 pre-existing
warnings. No schema, migration, remote database mutation, dedicated synchronizer,
account-guard enablement, or task checkbox change is included.

Current-head follow-up Red failed 1 of 33 foundation tests because a foreign existing
model omitted from the declared cached preimages could rewrite its owner and reach the
batch. Final Green replaces arbitrary existing-model preparation with repository-owned
declarative descriptors: focused foundation 33/33 and the relevant foundation/sync set
9/9 suites, 104/104 tests. Mobile typecheck and changed-file lint pass; full repository
lint reports 0 errors with 272 pre-existing warnings; `git diff --check` passes. The
current manual review must verify every existing descriptor is derived into the cached
validation/snapshot set before repository-controlled preparation.

Manual plan: inspect callback order and verify cached validation precedes preparation;
inspect generic push and verify all dedicated created, updated, and deleted IDs are
returned as rejected regardless of owner; verify the synchronize wrapper returns that
result to WatermelonDB; verify auth loss throws before any remote write. Installed
Watermelon source-contract coverage freezes both rejected-record marking and rejected
deletion preservation, so no emulator journey is required.

### PR #251 current-head scope and preimage hardening — 2026-08-31

This entry extends, and does not replace, the dated evidence above. `syncDatabase` now
binds the authenticated user captured before `synchronize()` to both pull and push.
Pull fails with `sync_pull_auth_scope_lost` when that user disappears or changes at
either boundary, including an empty/no-local-change synchronization, so WatermelonDB
cannot persist a timestamp for skipped data. Push uses the same bound identity and
reasserts it before returning, while retaining the `experimentalRejectedIds` contract
that supersedes the earlier historical generic-push throw/manual-plan wording.

Existing linked-operation descriptors must now be clean, unique by `(table, id)`, and
disjoint from genuine prepared creates before any updater runs. The repository freezes
plain `{ table, id, raw }` preimages captured before preparation and supplies them to
both ownership validators, allowing owned-parent foreign-key changes to be rejected
against immutable evidence and rolled back. Synced financial descriptors expose only
update and Watermelon soft-delete (`markAsDeleted`) preparation; unrestricted hard
delete is not part of the contract.

Focused Red proved both defects: all four synchronize lifecycle cases resolved instead
of rejecting, while 6 of 7 linked-plan safety tests failed for missing immutable
preimages, dirty/duplicate/overlapping input acceptance, and hard-delete exposure (the
existing `markAsDeleted` branch passed). Final focused Green is 2/2 suites and 11/11
tests. The broader foundation/generic-sync set is 11/11 suites and 108/108 tests.
Mobile and logic typechecks, changed-file lint, full repository lint, and
`git diff --check` pass. No schema, migration, remote database mutation, dedicated
synchronizer, account-guard enablement, or GitHub thread mutation is included.

Manual plan: inspect an A-to-B same-user owned-parent rewrite and verify the prepared
validator receives the original frozen parent ID and rejection restores `_raw`,
`_preparedState`, and `_isEditing`; inspect dirty, duplicate, and create-overlap inputs
and verify rejection occurs before updater invocation; inspect soft deletion and verify
only `prepareMarkAsDeleted` is batched; simulate auth loss/mismatch before and after an
empty pull and verify the prior watermark remains unchanged. These infrastructure paths
have deterministic automated coverage, so no emulator journey is required.

### PR #251 immutable linked-operation validator boundary — 2026-08-31

This entry extends, and does not replace, the dated evidence above. Linked-operation
ownership validators now receive only frozen plain preimage and prepared-postimage
snapshots containing `{ table, id, kind, raw }`; no live Watermelon model reference
crosses either validator boundary. The repository retains separate unexposed expectations
and, after every validation/auth await and immediately before batching, compares each live
operation's object identity, table, ID, exact preparation/editing state, and complete
shallow raw record. Raw comparison is key-complete and value-based, including Date values,
without serialization. Any drift rejects the commit and restores existing cached models
and genuine prepared creates to their captured state.

Focused Red was 1 failed suite with 3 failed and 14 passed of 17 tests: retained update
parent, soft-delete flag, and prepared-create amount mutations all reached a successful
commit. Final focused Green is 1/1 suite and 17/17 tests; combined foundation Green is
2/2 suites and 50/50 tests; broader foundation plus sync Green is 12/12 suites and
130/130 tests. Exact mobile and logic TypeScript checks pass. Changed-file lint passes,
the foundation integration file remains within the 900-line limit, full repository lint
reports 0 errors with 272 pre-existing warnings, and `git diff --check` passes.

Manual inspection verified that cached validation sees only frozen preimages, prepared
validation sees only frozen preimages/postimages, and update, `markAsDeleted`, and genuine
create tampering cannot reach `database.batch`. The deterministic tests also verify frozen
snapshot mutation is ineffective, failure restores `_raw`, `_preparedState`, and
`_isEditing`, and hard-delete preparation remains absent. No emulator journey is required
for this infrastructure-only boundary.

### PR #251 cached-preimage post-validation hardening — 2026-08-31

This entry extends, and does not replace, the dated evidence above. After cached ownership
validation returns and the expected user is reasserted, the repository now compares every
live cached model with its unexposed captured preimage and expectation before any update or
soft-delete preparation. Object, table, and ID identity must remain exact; preparation must
remain clean and non-editing; the complete shallow raw record must remain key/value equal;
and non-root, unique, and prepared-create-disjoint guards are reasserted. Any validator
closure that retains and mutates a Watermelon model therefore fails with
`financial_action_invalid_input`, restores its cached snapshot, and cannot invoke an updater,
`prepareMarkAsDeleted`, prepared ownership validation, or `database.batch`.

The first focused command hit the Windows Watchman startup failure before test execution.
Focused Red rerun with `--watchman=false` was 1 failed suite with 2 failed and 17 passed of
19 tests: retained update and soft-delete models with changed owner, parent, and amount raw
fields both committed instead of rejecting before preparation. Final focused Green is 1/1
suite and 19/19 tests. The explicit broader foundation plus sync set is 12/12 suites and
132/132 tests. Exact mobile and logic TypeScript checks pass. Changed-file lint and the
explicit 900-line guard pass; full repository lint reports 0 errors with 272 pre-existing
warnings; `git diff --check` passes.

Manual inspection verified the cached-model guard runs immediately after cached validation
and auth reassertion, before both existing-operation preparation paths. Deterministic tests
prove no preparation or batch call occurs and exact `_raw`, `_preparedState`, and
`_isEditing` rollback for both update and `markAsDeleted` closure tampering. No schema,
migration, remote database, dedicated synchronizer, account-guard, or GitHub thread mutation
is included.

### PR #251 pending-root and prepared-create closure hardening — 2026-09-01

This append-only evidence applies to exact base head
`fe92f0d7150e033257b8600ce7a1f053998dc5cd`. A resumed `pending_local` root is now
captured before the linked-plan callback and retained as an unexposed full raw snapshot
plus object, table, ID, owner, action, payload, outcome, and clean-state expectations.
Those expectations are reasserted after the plan, after every precommit ownership/auth
await, before root preparation, and against the prepared root immediately before the
atomic batch. Any drift rejects with `financial_action_invalid_input` and restores the
persisted root snapshot before commit.

After all declarative existing-model updaters run, genuine prepared creates are compared
with their original complete expectations before prepared postimages are captured. An
updater closure therefore cannot rewrite a prepared create's raw payload, identity, or
preparation/editing state and have that mutation blessed as the expected postimage.

Scoped Red evidence contained 5 failing cases: prepared-create raw/identity mutations and
pending-root owner/state/payload raw mutations all committed. Final focused Green is 2/2
suites and 58/58 tests. The broader financial-action foundation/generic-sync set is 4/4
suites and 73/73 tests. Exact mobile and logic TypeScript checks pass. Changed-file lint,
the explicit 900-line guard, full mobile lint, and `git diff --check` pass.

Manual inspection verified each pending-root assertion remains before
`prepareLocalRoot`/`database.batch`, failure restoration runs only before commit, and the
prepared-create recheck occurs immediately after every existing updater and before
postimage capture. Deterministic service tests cover these non-UI boundaries, so no
emulator journey is required. No schema, migration, remote database, synchronization,
account-guard, or GitHub thread mutation is included.

### PR #251 sync-owner watermark isolation — 2026-09-01

This append applies to head `48ba63b009ae933bda42ad6bd4d2befccf8917a8`. The sync
facade captures one authenticated user inside its existing module-level lock, reads the
adapter-local `__monyvi_sync_owner_user_id` marker, and forces the pull callback to use
`null` whenever that marker is absent or belongs to another user. It reasserts the bound
user only after `synchronize()` returns, then records the marker; auth loss, a user switch,
or any synchronize failure therefore leaves the previous marker intact. Installed
WatermelonDB source confirms the callback result is applied and its global
`lastPulledAt` is stored before `synchronize()` returns, so a subsequent user with a
different marker recovers with a full pull instead of inheriting that watermark.

The lifecycle harness controls callback return, simulated remote application, and
watermark advance in that order. It covers prior owner A to user B full pull/marker
commit, a post-callback auth switch with no local changes, B's older row after a global
watermark advance, same-owner incremental pull, and first-sync failure with a missing
marker. The first broader run was red in 24 assertions only because pre-existing
database doubles lacked the adapter metadata API newly required by the facade; adding
those focused doubles made the harness reach the intended synchronization behavior.

Final Green: broad sync coverage is 10/10 suites and 80/80 tests. Exact mobile and logic
TypeScript checks pass. Changed-file lint and full mobile lint pass; full repository lint
has 0 errors and 275 pre-existing warnings. `git diff --check` passes. The changed sync
facade and lifecycle test are 116 and 211 lines respectively; the touched legacy
`sync.test.ts` is 911 lines (907 before this four-line adapter-double addition) and no
configured maximum-file-lines lint rule exists. No schema, migration, remote database,
auth-path lock, GitHub-thread, or remote-data mutation is included.

### PR #251 owner-marker write auth closure — 2026-09-01

This append applies to exact head `be372cad0a5e6e42c9211e4525a50798139e025e`.
`syncDatabase` now reasserts its captured authenticated user immediately after awaiting
the adapter-local owner-marker write. If authentication switches during that metadata
await, the original and every caller sharing the active sync promise reject with
`sync_auth_scope_lost`; the marker may remain the original owner, which safely forces
the next user to full-pull.

Focused Red was 1 failed lifecycle suite: the original A caller resolved after a deferred
marker write and an A-to-B switch. The new controllable lifecycle case holds
`setLocal`, starts a concurrent B caller while the active promise is shared, releases the
write, expects both callers to reject, verifies the A marker remains, then verifies a
fresh B sync uses `null` and records B. Focused Green is 1/1 suite and 6/6 tests; broad
sync Green is 10/10 suites and 81/81 tests. Exact mobile and logic TypeScript checks,
changed-file lint, full repository lint (0 errors, 275 pre-existing warnings), and the
900-line check pass: the changed sync facade is 117 lines and lifecycle test is 262 lines.
No schema, migration, remote database, auth-path lock, GitHub-thread, or remote-data
mutation is included.

### PR #251 sequential linked-operation isolation — 2026-09-01

This append applies to exact head `26f287ab181f325d3940cf4e9d71641b2497b4f7`.
Existing linked operations now prepare in their declared atomic order, but immediately
before each preparation the still-unprepared suffix is checked against its captured
cached snapshots and expectations. An earlier updater therefore cannot mutate a later
update or soft-delete sibling and have the later operation accept that altered raw state.
The ordinary root-first batch order remains unchanged; a failure restores every cached
model before any later preparation or batch.

Focused Red was 1 failed suite with 2 failed and 25 passed of 27 tests: earlier update
callbacks mutated the raw amount/deleted flag of a later update or `markAsDeleted` model,
and both commits resolved. The parameterized regression pair now proves rejection, full
rollback, no later preparation, no prepared-ownership validation, and no batch. Focused
Green is 1/1 suite and 27/27 tests; broad financial-action Green is 4/4 suites and 75/75
tests. Exact mobile and logic TypeScript checks and changed-file lint pass; full repository
lint has 0 errors and 275 pre-existing warnings. `git diff --check` passes, and the
repository/safety-test files are 898 and 876 lines. No schema, migration, remote database,
auth-path lock, GitHub-thread, or remote-data mutation is included.

### PR #251 prepared-prefix sibling isolation — 2026-09-01

This append applies to exact head `41c0f3abca656d21bcc0c388c2ee9e03e57a0849`.
Each existing operation now captures its immutable prepared expectation immediately after
its own preparation. Before and after every updater, the repository verifies the prepared
prefix against those retained expectations and the unprepared suffix against cached raw
snapshots. This closes both mutation directions: an earlier updater cannot alter a later
unprepared sibling, and a later updater cannot alter an earlier prepared update or
soft-delete sibling. Failure restores all cached models and never reaches the batch.

Focused Red was 1 failed suite with 2 failed and 27 passed of 29 tests: a later update
mutated an earlier prepared update or `markAsDeleted` raw record, and both commits
resolved. The four-case directional matrix now proves rollback and no batch for update and
soft-delete targets in both orders. Focused Green is 1/1 suite and 29/29 tests; broad
financial-action Green is 4/4 suites and 77/77 tests. Exact mobile and logic TypeScript
checks and changed-file lint pass; full repository lint has 0 errors and 275 pre-existing
warnings. `git diff --check` passes, and the repository/safety-test files are 898 and 883
lines. No schema, migration, remote database, auth-path lock, GitHub-thread, or remote-data
mutation is included.
