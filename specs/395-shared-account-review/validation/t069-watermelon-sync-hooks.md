# T069 — pinned Watermelon sync writer / ACK hooks (tests-first SDK seam)

**2026-10-16. Phase:** tests and technical handoff only; no SDK patch or
sync-feature implementation.  
**Repository:** Msg22/Monyvi. **Sole immutable GitData parent:**
706975465d360d6c329d048e0c220b63ff8688bd (its sole parent:
622d1cc9d315dd74e0779c1a2e20bb4d3f6babbb).  
**Owner scope:** one NEW actual-SQLite SDK test, this NEW report, minimal T069
plan/tasks amendments. Original spec/B1/six contracts untouched.  
**Execution:** **NOT RUN**, by lease. Root runs read-only Speckit analysis,
meaningful Red, then decides on a disjoint source grant. No ref, push, PR,
install, formatter, DB, native, emulator or provider operation.

## 1. Exact pinned installed-source facts

The immutable .tmp/395-sdk-sync-inputs/manifest.json identifies installed
@nozbe/watermelondb@0.28.0; captured installed/Main and verification postinstall
SHA-256 are identical
(611c3bb222a033a4a94f91bfc9fe0a8f32374d62b3d168d946748c11df5b2c3d). The source
snapshot is CONTEXT ONLY and **is not changed by this handoff**. Inspected the
actual pinned CJS/Flow code, not a presumed latest upstream API:

| Path under .tmp/395-sdk-sync-inputs/ | Pinned SHA-256                                                   | Relevant observation                                                                             |
| ------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| package.json                         | 5fe7ef04949eaf7c7e3b4e898b855d5ada51648ddb846641ebc46e271c4780fb | package v0.28.0; main ./index.js; types src/index.d.ts                                           |
| sync/index.js                        | 6c7f6732906249d4f72fba146fb419ce34070291b27857c1b8a7eda22c89cbcb | public synchronize wrapper dynamically requires ./impl/synchronize                               |
| sync/impl/index.js                   | 0f47c4198cdf5b748a8536f77e99bc64ed08c0edd3fcf61f3c2d196213113c72 | actual checkpoint get/set functions use adapter local key \_\_watermelon_last_pulled_at          |
| sync/impl/applyRemote.js             | 06d69ac70155406a6647a7323ef9a4b7d89a644d3796b6d94266f1cd2f998593 | remote application prepares and calls real db.batch; it does NOT start a DB writer itself        |
| sync/impl/markAsSynced.js            | ad0e2f0da5bfe2b5578a0158ff4db5aaeb0c8f2bb8d22e9f376c59ff1de20e45 | starts own db.write; inside writer selects created/updated for db.batch AND destroys deleted IDs |
| sync/impl/helpers.js                 | c444c6c0365543d4d2beb065d6a8089d17bfe5277b73f5dc5ba9f377a1df913e | helper context                                                                                   |
| src/sync/index.js                    | 578e38a7ffc9ec6b2902caadf3a6930ff0033563bfbc469fa72531f5ffc1a847 | same public Flow wrapper / exported closed sync shapes                                           |
| src/sync/impl/index.js               | 4ba8984f211a8cf426679ac70270c30843fe4cfb206fceac9c9fbcade89a525d | Flow checkpoint get/set functions                                                                |
| src/sync/impl/applyRemote.js         | 865a007c3eb6b56c9a6adb61067c41fc8e87e90cdfcc22e9243b1414c4d3d686 | Flow equivalent of remote batch implementation                                                   |
| src/sync/impl/markAsSynced.js        | 1af324c2f9768894f46fe4d977ccce3f68b91d50d1b58cdc49e22bbe6511b24c | Flow equivalent of writer/ACK                                                                    |
| sync/index.d.ts                      | 1e23769a87a59786c9345de7cbaad93385a16d05a390b4edcbb1a28107abbb56 | actual TS subpath declarations; exports SyncDatabaseChangeSet, SyncRejectedIds, SyncLocalChanges |
| src/sync/index.d.ts                  | **absent**                                                       | do not author against a fictional file                                                           |

**Pinned-input incompleteness / mandatory source preflight:** both the CJS and
Flow public wrappers load ./impl/synchronize, but neither
sync/impl/synchronize.js nor src/sync/impl/synchronize.js was included in the
supplied manifest. The exact checkpoint/reset admission and its encompassing
application writer therefore cannot be independently line-verified from these
snapshots. Neither is sync/impl/fetchLocal.js captured, although the reviewed
impl index imports it for the local changes/affected-record image. **Before
source patching**, the source owner must inspect and content-pin the actual
installed files for these entrypoints, verify them against the exact installed
0.28.0 copy and refuse unknown/mixed content. Do not invent a synchronize
implementation from a different release, claim the missing bytes were inspected,
or silently omit the hook. This is a preflight predicate, not permission to edit
these .tmp source snapshots in this lease.

## 2. Proposed precise optional API for v0.28.0

Use actual **exported** SDK SyncDatabaseChangeSet / SyncRejectedIds; no copy of
a private closed shape and no any. Add these to SyncArgs in the Flow source and
the real sync/index.d.ts alongside runtime support in both CJS/Metro source
paths:

```ts
beforeApplyRemoteChangesInWriter?: (
  capturedChanges: SyncDatabaseChangeSet
) => Promise<SyncDatabaseChangeSet>;

beforePullCheckpointInWriter?: () => Promise<void>;

beforeMarkLocalChangesAsSyncedInWriter?: (
  capturedChanges: SyncDatabaseChangeSet,
  alreadyRejectedIds: SyncRejectedIds
) => Promise<SyncRejectedIds>;
```

Contract details:

1. **Remote pre-apply:** invoke in the already admitted actual application
   **writer**, **after** stock reset/checkpoint admission and **before**
   preparing/applying the remote batch. It receives the captured remote change
   set and returns a validated replacement; rejection throws before its remote
   batch is applied. Never call this from the stock onWillApplyRemoteChanges
   callback: that runs outside the writer.
2. **Pull checkpoint:** invoke in the same writer **after** remote application
   and **before** the SDK advances its pull checkpoint. It may re-read owner and
   protected membership and reject. An already completed underlying Watermelon
   adapter batch might remain committed even when the guard throws; **the test
   deliberately expects this**. The required guarantee is no false checkpoint,
   not a fictitious all-or-nothing rollback across already committed adapter
   calls. Retried pull must safely replay.
3. **ACK revalidation:** invoke **inside the existing**
   sync-markLocalChangesAsSynced writer **before both** its create/update
   selection and deleted-ID destruction. Pass the original captured changes and
   existing transport-rejected IDs. Await the callback and compute a table-wise,
   deduplicated union of previous and new rejected IDs. The callback must
   **never be able to clear** a previous rejection. Retain all existing stock
   create/update \_raw equality, reset checks, record selection and tombstone
   disposal semantics for nonrejected rows. Do not postpone the callback until
   after db.batch or destroy calls.
4. **Stock compatibility:** all hooks are optional; absence exactly preserves
   the 0.28.0 behavior, including push failure, rejected-ID handling, reset,
   raw-equality, and successful tombstone cleanup. Protect default incremental
   SQLite path first; if turbo/replacement/unsafe-batch cannot honor these
   semantics, explicitly fail closed for protected sync rather than silently
   bypass hooks.
5. **Writer boundary:** no DB writer held while awaiting pullChanges,
   pushChanges or another network/OS operation. Hook callbacks must be local and
   bounded; do not turn them into a network/prolonged-GC policy.

**Runtime/version capability marker proposal** (must be emitted identically from
CJS and Flow/Metro runtime and declared with an exact TS string literal):

```ts
export const MONYVI_SYNC_WRITER_GUARDS: "monyvi/watermelon-sync-writer-guards/0.28.0/v1";
```

The protected-sync consumer (separately owned) must check strict equality to
that literal **before** performing protected synchronize; absence, mismatch,
partial patch or unsupported entrypoint fails closed rather than running unsafe
stock sync. It must not rely solely on a type declaration, and stock/unprotected
consumer calls without hooks remain compatible. Tests in this phase do NOT
import the future marker.

## 3. Reproducible source-phase dependency (NOT IMPLEMENTED)

A succeeding and independently granted SDK **source** owner may touch only
scripts/postinstall.js, NEW scripts/patch-watermelon-sync-hooks.cjs, and focused
patch verification sources; generated installed artifacts (CJS, Flow/Metro,
actual TS subpath declaration) are patch outputs, **not** committed manual
node_modules edits. Preserve current postinstall fixes.

The new script must check the exact package version, all touched file-existence
and pre-patch SHA-256, known post-patch SHA-256, and cross-entrypoint
consistency before any mutation; reject unexpected preimage, partial/mixed
installed state, unsupported content or missing declaration. Repeated install
must be idempotent by verifying the complete expected postimage, not by a loose
includes() success test. No dependency/Watermelon upgrade, sync-engine
replacement, Database.write monkeypatch, native changes, or unsafe source-string
test in place of real behavioral integration.

Private Add/Review correction lifecycle, suppression and GC policy remain in
their separately approved owner-scoped modules/contracts; the SDK hooks provide
only the necessary writer/ACK revalidation seam and neither authorize nor
implement Add-private cleanup.

## 4. Authored REAL SQLite behavioral cases

Path:
apps/mobile/**tests**/services/sync/account-sync-sdk-hooks.sqlite.integration.test.ts.
The test imports the real @nozbe/watermelondb/sync synchronize, uses
SQLiteAdapter with the existing real dispatcher, packages/db/src/schema.ts, real
models, batches, checkpoint adapter storage and getDeletedRecords. Only the
test-local sync transport is supplied; **no fake synchronizer/DB writer/SDK
implementation**.

The callback fields are defined on an **inferred local options variable** and
passed to existing synchronize(options); TS structural typing accepts the excess
fields on current declarations. All callback payloads use SDK-exported public
types; no forward imports of nonexistent modules or marker.

| Case                     | Real persisted assertion                                                                                                   | Expected on stock pinned SDK                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| R1 remote replace        | pre-apply hook runs inside actual writer (real database.batch), reads old checkpoint and substitutes sanitized created raw | **Red**: ignored hook, wrong remote value / no writer mutation |
| R2 remote refuse         | async throw before application, remote ID absent and checkpoint unchanged                                                  | **Red**: stock applies remote ID / advances                    |
| R3 post-apply checkpoint | hook sees applied remote row, throws, checkpoint stays old but previously applied row may persist                          | **Red**: stock advances, no reject                             |
| R4 ACK update / union    | transport rejection A plus hook-proposed B both stay updated; hook performs real in-writer batch of separate probe         | **Red**: SDK ignores B and marks it synced                     |
| R5 ACK delete            | rejects captured deleted ID before destruction; tombstone persists, later ordinary sync releases it                        | **Red**: stock destroys tombstone immediately                  |
| C1 stock raw equality    | later local edit during async push prevents stale captured update from being marked synced; no writer lock across push     | **Stock control, expected pass**                               |
| C2 no hooks              | ordinary dirty update becomes synced; deleted tombstone destroyed                                                          | **Stock control, expected pass**                               |

**Status:** authored only; **NOT RUN**. Root must run meaningful stock Red,
review it independently (including any fixture issue preventing true behavioral
Red), and grant source only after the missing synchronize implementation bytes
and capability preflight are satisfied. No claim of Green, migration,
native/device or hosted readiness.
