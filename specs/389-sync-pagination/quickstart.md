# Quickstart: Issue #255 Sync Pagination and Checkpoint

The approved core was validated locally on 2026-10-07. The historical genuine
Red evidence remains unchanged.

The following original sections retain PR381's dated core record. The current
approved historical-repair continuation and its separate evidence matrix are at
the end; earlier device/environment statements are not current inventory.

## Environment and execution boundary

Use only the owned monyvi-issue255-repro backend on API 54341 / database 54342.
Docker SQL uses internal port 5432 after checking external 54342. Never target
shared 54321/54322 or remote services. Reuse the main checkout's dependency
junction; do not install dependencies.

The user-authorized final batch ran after implementation. Only checks affected
by reported fixture/type corrections were rerun. No commit hooks, commits or
remote writes were executed.

## Manual scenarios and automated coverage

| Scenario                                                                                                                                                                 | Automated evidence                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial 2,501 rows, unchanged second sync, full ID/value manifests, 1,001 parents and children                                                                           | [sync-pull-cap.local.integration.test.ts](../../apps/mobile/__tests__/services/sync-pull-cap.local.integration.test.ts); real local Supabase + Watermelon SDK/SQLite                  |
| Empty, short, capped, exact-multiple/remainder pages; raw microseconds and UUID ties; invalid counts/cursors and later-page errors                                       | [issue255-paged-pull-contract.test.ts](../../apps/mobile/__tests__/services/sync/issue255-paged-pull-contract.test.ts)                                                                |
| Current-owner/shared categories, exact text, parent joins including soft-deleted parents and deleted children, snapshot retention, tied journal pages                    | [issue255-owner-snapshot-pull-contract.test.ts](../../apps/mobile/__tests__/services/sync/issue255-owner-snapshot-pull-contract.test.ts)                                              |
| Failed ordinary page leaves baseline and checkpoint unchanged                                                                                                            | [issue255-sync-checkpoint.sqlite.integration.test.ts](../../apps/mobile/__tests__/services/sync/issue255-sync-checkpoint.sqlite.integration.test.ts); real SDK/SQLite, network mocked |
| Failed later journal page leaves baseline and checkpoint unchanged                                                                                                       | Same real SDK/SQLite checkpoint file; journal paging also covered by owner/snapshot contracts                                                                                         |
| Good pull followed by failed push retains new checkpoint, applied rows and dirty deletion                                                                                | Same real SDK/SQLite checkpoint file; existing sync-push-service.test.ts retains separate push diagnostics                                                                            |
| Auth loss and user scoping                                                                                                                                               | Existing sync-auth-scope-lifecycle.test.ts and sync-multi-user.sqlite.integration.test.ts                                                                                             |
| Writer transaction blocks seal, post-seal publication, older M returned unchanged, ACL/auth refusal, real snapshot DELETE/rollback, owner-scoped tied journal pagination | scripts/testing/issue255-sync-reproduction/sql-fence-contract.test.js via node --test                                                                                                 |
| Financial guards, roles and unchanged business behavior                                                                                                                  | 101 existing financial SQL regression assertions across three suites; independent SQL/client review                                                                                   |

The snapshot SQL probe creates valid current-schema total_assets_usd fixtures.
Its tied journal timestamps are a separate controlled pagination fixture; real
DELETE/rollback assertions prove the producer path.

## Final local results

- 23/23 Jest suites, 176/176 tests across the initial batch and affected reruns:
  20 unchanged initial passing suites plus three affected passing suites (14
  tests). Do not describe this as one clean uninterrupted run.
- Original real-path cap/control/unchanged/parent-child cases passed.
- 101 financial SQL assertions and all three fence/journal probes passed.
- Owned migration chain replay, generated public Supabase types, mobile
  TypeScript, scoped TypeScript lint and formatting passed.
- Independent Gemini SQL/client review passed. Existing trigger bindings and
  static hook-body equivalence were verified.
- Database-package TypeScript has a pre-existing TS2416 at
  packages/db/src/models/base/base-market-rate-observation.ts:35, reproduced
  unchanged on the pinned base. It is excluded from this fix.

## Remaining manual boundaries

Device/emulator E2E, restart/device recovery, killed-app/HeadlessJS and visual
variants were not executed; no emulator was available. No remote delivery or
merge readiness is claimed. Historical repair, #367/#377 and #368/#376/#380
remain separate.

Additive migrations are 082–085. Do not rerun a Watermelon schema/model
generator: only public Supabase types changed. The original Red archive
run-1791353499634 remains the genuine failure evidence; no new genuine Red claim
is made for subsequently authored contracts.

The owned backend was stopped after validation (exit 0), with its backup
preserved.

## Approved continuation — manual plan and coverage

Source: b2ec0fd4bc81cf2bf504f86d3bb781f605b355fc. The approved bounded
continuation now has local Green and independent source/QA acceptance, recorded
below. Device upgrade and deployment acceptance remain blocked. Root
coordinates; one local successor integrated and tested the changes.

### Evidence and runner vocabulary

H =
[issue255-historical-recovery.sqlite.integration.test.ts](../../apps/mobile/__tests__/services/sync/issue255-historical-recovery.sqlite.integration.test.ts)
E =
[issue367-effect-delivery.sqlite.integration.test.ts](../../apps/mobile/__tests__/services/sync/issue367-effect-delivery.sqlite.integration.test.ts)
K =
[issue255-sync-checkpoint.sqlite.integration.test.ts](../../apps/mobile/__tests__/services/sync/issue255-sync-checkpoint.sqlite.integration.test.ts)

Lead-reported joint b2 run: 17 tests, nine genuine failures, eight passes, zero
harness failures. K's three controls and the direct real rejected-action
reconciliation control passed. Do not infer other per-case PASS results from the
aggregate. H/E use real SDK/SQLite with scripted network, not live Supabase.
This paragraph records the original Red baseline; the 19 supplemental branches
and owned-backend execution now have the separate final results below.

### Minimum matrix

| ID  | Precondition and action                                                                                                                                                                                          | Observable expected result                                                                                                                                                                         | Coverage / disposition                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 | Empty disposable local DB; 2,501 eligible owned rows plus below-cap control. Sync normally, then unchanged.                                                                                                      | Complete IDs/historical values once; unchanged data on second sync.                                                                                                                                | PASS owned 085 current-source cap suite:37 control, 2501 initial, unchanged second, 1001 parent/child; cap.results.json.                                                                     |
| C02 | Effective backend cap K below client request size. Pull 2K+1 rows and an exact multiple.                                                                                                                         | All rows arrive; a capped short response never ends traversal early.                                                                                                                               | PASS scripted capped/exact-remainder pager contracts and measured real cap 1000. A lower configured cap was not executed; optional and not claimed.                                          |
| C03 | Establish checkpoint through real sync; then more than K ordinary creates, updates and soft deletes. Sync incrementally.                                                                                         | Exact new/changed/deleted ID sets; unchanged rows preserved.                                                                                                                                       | PASS owned live-3: 1001 creates, 1001 updates, 1001 soft deletes, independent manifests and unchanged repeat.                                                                                |
| C04 | Same owner/schema 29, advanced actual checkpoint, older missing rows with non-default values. Invoke normal sync.                                                                                                | Automatic complete historical hydration, no reset/forced-full caller flag/timestamp rewrite.                                                                                                       | PASS original H and owned live-3: 1001 pre-checkpoint rows recovered automatically with schema 29; no forced-full caller flag.                                                               |
| C05 | Repair due. Complete sync; invoke again and reopen the same fixture DB before another invocation.                                                                                                                | Matching owner receipt persists only after apply/success; ordinary incremental behavior resumes.                                                                                                   | PASS H continuation: exact owner receipt, success, repeated sync and SQLite adapter reopen. Process/device restart remains unexecuted.                                                       |
| C06 | Existing state/dirty work; fail later ordinary/effect/journal page or the actual SQLite apply. Retry without reset.                                                                                              | No partial repair, cleanup or receipt; prior valid checkpoint/work preserved; retry completes safely.                                                                                              | PASS scripted page-failure/K controls plus actual SDK apply failure, unchanged metadata and reopened retry. No live transport-failure injection.                                             |
| C07 | Good pull followed by failed push; separately fail receipt storage after success. Retry.                                                                                                                         | Good pull/checkpoint stand, unsent work stays dirty, completion absent; retry causes no duplicate financial posting.                                                                               | PASS K and H continuation: good pull/bad push retains checkpoint and dirty work; receipt-write failure stays due and retries.                                                                |
| C08 | A completed repair; preserved B data/dirty work; switch owner or lose auth during repair.                                                                                                                        | A's receipt never satisfies B; no foreign application/cleanup; incomplete attempt cannot complete either owner incorrectly.                                                                        | PASS H per-owner/switch/post-apply-loss and existing auth-scope suites. Device account-switch usability remains unexecuted.                                                                  |
| C09 | Owned accounts/roots/effective and compensated effects, exact large strings. Initial and incremental sync; repeat; inject invalid compensation time.                                                             | Stable links/IDs/strings; null preserved, valid date converted, invalid date fails before apply; no balance replay.                                                                                | PASS original E, shaping and owned live-3: route, exact strings, null/valid/invalid conversion and no balance replay. Impossible calendar-date hardening deferred.                           |
| C10 | Pending create/edit/delete and unresolved financial group; same action/hash remote terminal root. Sync, fail transport, retry.                                                                                   | IDs/payload/hash and optimistic evidence survive until actual undo. Terminal state requires 110/inactive/deleted in the known fixture, not 125/effective/active. No receipt strands withheld rows. | PASS real E compensation 110/inactive/deleted, receipt withheld then second full pull without repeated RPC; seven shaping cases cover six states/identity/Metals Add. Broader #339 excluded. |
| C11 | Pre-journal S-old is clean/owned/in-window but absent remotely; S-new exists. Include dirty/foreign/cutoff/after-H controls. Complete repair; repeat; also fail a later page and race a local edit before apply. | Remove only eligible absent clean S-old after complete apply; retain S-new once and every protected row. No cleanup on failure or from stale cleanliness.                                          | PASS H original/continuation and live-3: pre-journal replacement, bounded actual SDK vector, post-pull dirty edit, explicit journal precedence and dirty remote-update matching.             |
| C12 | Verified supported installation origin, populated history and preserved owner/checkpoint. Authorized normal upgrade/sync and offline interaction.                                                                | Historical values and local work survive; lists/details remain usable without crash/freeze; offline reads/writes work.                                                                             | BLOCKED: supported physical JS/build/backend origin and authorized device upgrade/offline usability execution remain unavailable.                                                            |
| C13 | Hold a real ordinary writer transaction; separately move a row across H while paging and soft-delete another. Finish writer/pull, then sync again.                                                               | Seal/write ordering holds; eligible IDs/tombstones are not permanently omitted; eventual next cut completes convergence.                                                                           | BLOCKED full route concurrent cursor movement/late commit; unchanged 082–085 fence proof is historical evidence only. No new SQL run or #382 clock hardening.                                |

### Deterministic snapshot vector

Freeze test time/H at 2026-10-07T12:00:00.000Z. Under the existing calendar-day
retention rule the cutoff is 2026-07-09T12:00:00.000Z. Use distinct identities:
S-old and S-new inside the window; an absent dirty owned row; an absent foreign
row; a row exactly at cutoff; a row at H; and a row after H. Only clean owned
absent rows strictly above cutoff and no later than H are eligible. A present
row at H stays; an absent clean owned row at H is eligible. S-new appears once.
Preserve dirty/foreign/out-of-window values and pending deletion intent. Recheck
inside the SDK apply writer after every network page finishes. Include a real
local edit in onWillApplyRemoteChanges (after pull return, before the writer),
plus a clean absence control. Explicit journal deletions outside the window and
remote updates to dirty existing rows must preserve prior SDK semantics.

Create the legacy starting state through H's legitimate fixture path with an
actual SDK checkpoint and no new repair receipt. Do not first run the new
successful repair and then silently erase its receipt to manufacture a case. No
real user snapshot data or physical-device copy is required.

### Continuation bindings (2026-10-08; local execution below)

- H and E retain desired-behavior assertions through minimal same-folder
  issue255-historical-recovery-fixtures.ts /
  issue367-effect-delivery-fixtures.ts modules.
- issue255-historical-recovery-continuation.sqlite.integration.test.ts: receipt
  success, failed-push/reopen retry, A/B receipts, storage failure, actual SDK
  adapter apply failure/reopen, scoped snapshot vector, production one-time
  snapshot cleanup, dirty edit during final remote page, and post-apply owner
  loss; post-pull/pre-writer dirty edit and explicit-journal/remote-update
  controls.
- financial-pull-shaping.test.ts: six canonical unresolved states, synchronized
  unresolved root, semantic JSON equality/mismatch, matching/mismatching
  immutable effects, missing/resolved hydration, owner rejection, and valid
  unresolved Metals Add canonicalization with the existing date context.
- issue367-effect-delivery-continuation.sqlite.integration.test.ts: actual
  reconciliation before terminal success, withheld receipt, subsequent complete
  pull without lower effect bound, stable exact evidence and no repeated
  monetary posting.
- These 19 supplemental cases passed in the final local verification. The
  original 17-test baseline remains nine genuine behavioral failures/eight
  controls at b2ec0fd. Its pre-journal diagnostic was a gap-observation control;
  the current test now seeds an old SDK install and asserts the approved
  repaired behavior.

### Owned-backend-085 final batch

Use
scripts/testing/issue255-sync-reproduction/issue255-historical-recovery-run.cjs
with the existing private synthetic runtime path and an outside evidence
directory. The launcher verifies exact monyvi-issue255-repro containers, API
54341 / external DB 54342 and migration 085 before invoking the installed mobile
Jest preset. It never starts, resets or reconfigures a backend.

The authored live suite measures the real cap with 2,501 rows, establishes a
genuine SDK checkpoint that omitted pre-existing older rows, then invokes
automatic production recovery. It also covers cap+1 incremental
creates/updates/soft deletes, unchanged repeated sync, actual accepted effect
revision/string/no-replay and snapshot replacement/journal delivery. Compare
independent remote/local ID/value manifests. Reuse the existing cap suite for
its 2,501-row and 1,001-parent/child journeys on current code.

Ordinary fixture cleanup uses exact IDs and synthetic owner. One stable
immutable accepted account/action/effect fixture is retained for idempotent
reuse; snapshot journal entries remain retained by design. Remote snapshot
fixtures use fresh UUIDs per run to avoid reusing retained deletion identities.
No financial guard bypass or auth-user deletion. Local SQLite reset disposes
only the in-memory test database.

No live transport-failure injection or lower-cap reconfiguration is claimed.
Scripted-network SDK cases cover retry and owner/dirty boundaries. Route-level
concurrent row movement, physical-device upgrade/usability and cloud deployment
remain explicit gaps. Existing SQL fence evidence applies to unchanged 082–085;
do not label it a new runtime run.

### Device, deployment and closure boundaries

C12 remains manual/BLOCKED. Lead inventory: SM-A546E Android 16, development
1.0.0/code 1, schema 29 with owner/checkpoint. Active JS/source/OTA and
historical backend origin are unknown. No current-owner pending account/groups
were reported; synthetic pending tests remain necessary. Emulator has no app;
the second physical installation's identity is unknown.

The lead refreshed live cloud inventory read-only on 2026-10-08 at 06:05 UTC: 78
migration records, maximum 081; 082–085 remain absent. The owned isolated
backend was verified at 085. This local task made no cloud mutation. Code-only
success does not deploy core 082–085 or establish live compatibility. Before
actual upgrade acceptance, identify supported native/JS/OTA build, local
migration origin and backend versions through authorized read-only inventory. No
phone copy, credentials or private financial payloads are requested.

Only separately authorized device runs can verify a normal same-owner upgrade,
preserved data/checkpoint/dirty work, usable lists/details during sync, and
offline reads/writes without crash/freeze. A fresh emulator run cannot prove
upgrade of the installed phone. No benchmark framework is required.

Record code-ready, owned-backend-verified, deployed and actual-upgrade-verified
separately. Full closure stays blocked until required live/device gaps are
verified. Broader #339 liveness/terminal-corruption repair and #382 remain
deferred. No reset, clear-data, launch/install, deployment or remote mutation is
authorized by this plan.

### Final local verification — 2026-10-08

Source branch codex/issue255-historical-recovery, base
b2ec0fd4bc81cf2bf504f86d3bb781f605b355fc; installed real WatermelonDB 0.28,
schema 29; isolated monyvi-issue255-repro at API 54341 / DB 54342 /
migration 085.

- Latest-result-per-suite aggregate: **24/24 suites, 218/218 tests PASS**,
  combining the first batch with six focused reruns (34 tests). This is not one
  single clean broad run. Original harness failures remain recorded.
- Mobile TypeScript PASS; scoped actual ESLint --fix PASS. The last autofix
  changed equivalent erased array-type notation only.
- Owned live-3: **2/2 PASS**; original real-cap companion: **4/4 PASS**.
  Measured cap 1000,1001 historical rows,1001 per incremental operation;
  complete ordinary ID/value manifests, exact financial evidence, snapshot
  replacement, unchanged repeat and no balance replay.
- Backend setup initially failed because the archived synthetic owner no longer
  existed. Guarded authorized setup created one new synthetic test owner after
  verifying empty financial fixture slots; no real/shared/cloud data changed. A
  subsequent raw-adapter metadata fixture error was fixed and rerun. These setup
  failures are not behavioral Red.
- Ordinary live fixtures were cleaned by exact owner/IDs. The synthetic auth
  owner, immutable account/action/effect fixture and deletion journal remain
  retained. Private runtime data is excluded from repository/review artifacts.
- No new database migration, generated model/type work or SQL-suite replay. The
  previously verified DB-package TS2416 baseline is unchanged; mobile TypeScript
  has no exclusion.

Evidence outside the repository: issue255-completion-20261008/approved-core/
final-checks/{jest.results.json,focused-1-jest.results.json,focused-1-types.log,
final-lint.state.json,live-3/jest.live.results.json,live-3/live-proof.json,
cap.results.json,backend-3.state.json}. The sanitized
C255-QA-evidence-summary.json records exact per-suite result provenance without
credentials.

Device/emulator/manual execution, cloud deployment, lower-cap reconfiguration
and full live route-concurrency movement remain unexecuted as mapped above. No
commit, push, merge or deployment is implied.

### Independent acceptance and remaining boundaries

Normal TS3 and logic/style/database/security reviews passed the final bounded
source. Independent G255-QA passed the bounded core and its evidence; no
actionable production finding remains. T026 review and T027 coverage-disposition
handoff are complete. This is local core acceptance, not issue closure or
deployment readiness.

C02 actual lower configured cap remains optional and unrun. C12 supported-device
upgrade/offline usability remains BLOCKED/unrun. C13 actual route-level
concurrent cursor movement/late commit remains BLOCKED/unrun. Dated cloud
inventory and unknown installed-build origin remain explicit acceptance gaps.
