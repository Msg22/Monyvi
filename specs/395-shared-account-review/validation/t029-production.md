# #395 T029 — Owned SMS review command/publication writer checkpoint

**Status: production source authored ONLY, NOT EXECUTED or accepted.** Root owns
the coherent Jest/TypeScript/lint/formatter/reducer/SQLite batch and independent
nonauthor review. No branch move, push, PR, DB schema, SQL, cloud financial
action, UI, locale, native, provider or application runtime check.

## Immutable source and accurate Red

- Source commit parent: 03857f1d36f93a4d7330cbb55e3db52c9a47417c. Its tree
  contains corrected 9f Main dependency closure and the accepted 20 command +
  six publication scenarios from the bounded tests-only grants. Do NOT merge
  this entire tree or use older b5/005d dependency trees.
- Root's **actual pre-source** T029 admission: 25 protected namespace cases
  PASS; the command suite has ZERO assertions because its production module was
  missing (creation Red). Six real SQLite publication scenarios execute: three
  PASS, three FAIL at real V1-only publication, untrusted lookalike acceptance,
  and destructive/silent malformed V1 reading. These are the only claims about
  executed behavior here.
- Canonical T028 codec correction is accepted separately at source blob
  902b133dfc93405aaa3471880a68d31c4598e545; T027 reducer and #395 approved
  contracts are separate immutable Main authorities. This source commit does NOT
  attempt to republish their whole trees.
- Original protected production baselines: sms-review-draft-repository.ts
  72385c2220f9256efd9aad9ba3e1afabcaaa89a1; sms-review-namespace-state.ts
  9298b8b85180725e4b9a9b1158e5c34d9d9fadcd;
  sms-review-namespace-draft-snapshot.ts
  bb5c92fdb0e43f606d2ce4168e926c04f149ab14; sms-sync-service.ts
  7b7217a5d5f4ce093d6567e68e47b1e4683ec5bd. All other owned T029 source files
  were previously absent.

## Immutable command authority

The public service implements the frozen
executeSmsAccountReviewCommand({queueId,command,accountSnapshots,nextUndoToken})
shape. It owns one real Watermelon database.write, current actor/owner/queue and
fingerprint identity queries, source-scoped V1/V2 decode and canonical
review-session rehydration. Caller accountSnapshots is an advisory input, NOT a
DB authority; the service rereads actual current owned accounts from the shipped
read-model service inside the serialized writer.

The private graph helper correlates physical draft IDs with canonical logical
row IDs by scoped unique SMS fingerprints, never by equals-ID assumption. It
reconciles the UNION of each row's referenced active group and durable removal
tombstones; duplicate group snapshots must match identity/status/revision
exactly, while unrelated rows need not store identical groups. Every per-row
global owner/session/sourceRevision/
preferredCurrency/reviewRevision/operationGeneration/tombstone header must
agree. The canonical session schema checks reciprocal group links.

For an accepted transition, all affected and unaffected V2 draft headers are
encoded with the next global reviewRevision/operationGeneration, while
unaffected individual row revisions remain unchanged. The single batch also
updates authoritative selectionOverride, scoped queue updatedAt and only
approved draft payload columns. It uses the existing
commitScopedPreparedBatch/Watermelon cache-preimage rollback boundary; auth is
rechecked immediately before preparation. Failed writes do not consume the
transient Undo token or change durable bytes. Successful commit wins over
post-commit notifications; the only Undo lease is a WeakMap of the physical
owned queue and exact canonical previous state, never serialized. V1 rows are
migrated only through the closed pure T028 codec with legacy_unknown/uncertain
evidence; no fake provenance, provider-validated model IDs or status 0 as edit
CAS.

## Complete trusted publication

MergeSmsReviewDraftsInput now has the narrowly approved optional reviewSession?:
AccountReviewSession. Progress, legacy and unproven calls omit it and retain the
original V1 writer. Only the final sms-sync-service call forwards the actual
final parser result reviewSession object.

A new narrow namespace-state assertion requires the EXACT WeakMap-bound
published session, currently published receipt, exact pending candidate object
identities, current owner/queue and one-to-one fingerprint scope. Cloned
lookalike sessions/transactions and IDs are rejected before writing and again
immediately before preparing the batch. Canonical schema/codec checks also
require the original transaction financial snapshot.

The final publication writer uses the existing actual owned queue under one
serialized write, v2-encodes previously missing original rows and promotes
unchanged V1 progress only when the original baseline bytes still match, without
clearing explicit selection or user edits. Existing V2 decisions are
authoritative over equivalent late input. When all existing rows are V2,
canonical late-row reducer reconciliation adds new source rows unchecked while
preserving confirmed/removed state, overrides and tombstones. Partial group
promotion or a mixed-unproven generation fails closed rather than applying a
partial inconsistent group snapshot. All published receipts settle only after
durable commit or validated no-op dedup; no new provider request or queue/model
metadata.

## Read recovery, exclusions and Root gates

The owned draft snapshot now decodes both V1 and V2 with the approved dual
reader. Malformed/unsupported payloads throw the existing stable
SmsReviewDraftCodecError rather than deleting a queue/draft or returning an
apparently empty successful snapshot; all payload/selection bytes survive. Truly
empty queues still honor the existing namespace pin and prune policy. Legacy
unrelated update/selection/discard paths and cloud Save services were not
rewritten by this narrowly owned T029 source wave.

**NOT RUN BY THIS OWNER:** Jest, unit/integration/E2E, TypeScript, ESLint,
formatter, code generator, SQLite execution, native emulator, provider or hosted
services. Source readbacks are not verification Green. Root must extract exact
changed blobs, run coherent 20+6 production SQLite cases plus 25 protected
namespace cases and broader type/lint, then obtain independent NONauthor review
before any acceptance.

## Mechanical import + SQLite test structure correction (separate lease)

This note records the subsequent bounded T029 correction against immutable
parent `acb270403d71f3d261f99af5693a1b90f21bb4fd`. The Root intake batch loaded
**ZERO assertions** in the four tested SMS suites because the three new source
files referenced `../../../../packages/logic/...` from `apps/mobile/services`;
that relative path goes one level above the repository and cannot resolve. The
dependent TypeScript/lint cascades are not independent financial or review
behavior failures.

Corrected **only import specifiers** in `account-review-command-service.ts`,
`account-review-command-snapshots.ts`, and
`account-review-command-publication.ts`: all eight mistaken
`../../../../packages/logic/` occurrences now use the existing
`../../../packages/logic/` service boundary. No source logic, DTO, reducer,
account decisions or runtime guard was changed in this correction.

The existing `account-review-command-service.sqlite.integration.test.ts` was 822
raw lines at the previous blob, but Root measured **964 normally formatted
lines**. Move precisely its two T029 guard cases, _with byte-identical test
bodies and assertions_, into the separately authorized
`account-review-command-guards.sqlite.integration.test.ts`. The new suite uses
the **real** `sms-review-namespace-test-harness` as the FIRST executed import,
real SQLite adapter and Watermelon models, existing canonical T025 fixtures,
real reducer/codec and the unchanged command service entrypoint. The original 18
T025 SQLite cases stay together in their existing file and retain all
assertions. The existing pure T029 builder module is reused without
modification. The six publication cases are unchanged. No second fake DB,
placeholder writer or native bridge shim.

Raw authoring sizes (not a formatter claim): original command 822 lines;
corrected command 722 lines; new guards 242 lines. Root must verify the
_normally formatted_ file cap and run the entire real SQLite coherent batch;
none of those checks was run by this worker.

**NOT RUN:** Jest, SQLite, TypeScript, lint, formatter, generator, provider,
native or emulator. No behavioral Red/Green is claimed for this artifact;
Financial Save peer review is separate and unaffected.

## T029 bounded publication-proof and auth-shim correction

This later correction is based solely on immutable pinned parent
`5236c86eca1c8c805baadd7749b768aff42c880a`. Root's reported 159-assertion
admission included publication **6 PASS / 1 FAIL**: an in-place group-name
mutation of the exact published session was accepted before V2 persistence.
Namespace lifecycle 25 PASS, lease 13 PASS and two command guard cases PASS. The
main command suite's 9 PASS / 9 FAIL is a test auth-shim failure: its mock
lacked the real `getRequiredCurrentUserId` export called by the accepted account
read model. These are ROOT results from before this patch, not new verification.

The existing private `publishedSessions` WeakMap now remembers BOTH the original
receipt and a canonical-schema-validated, JSON-serialized snapshot of the entire
session at `bindSmsReviewNamespacePublishedSession`. The initial publication
admission validates live canonical contents again, not just the same session
identity, candidate objects, IDs, status and fingerprints; a schema-valid
name/amount/selection/group change fails closed before any write. A repeated
completion using an earlier bound session also checks the same snapshot before
isolating a new candidate receipt. The snapshot is RAM-only, lives behind the
WeakMap, is not logged, persisted or attached to an ordinary review/edit
command, and does not freeze an object.

The T025 main-command test mock now exposes
`getRequiredCurrentUserId(): Promise<string>` by reading its existing mutable
`mockCurrentUserId` at EACH invocation. Auth changes remain observable and the
real `loadAccountReviewAccountSnapshots` guard is not modified or bypassed. Its
raw complex postimage return type is reexpressed as one typed private interface
and `readonly DraftPostimage[]` for the repository's array-simple lint
convention. The original 18 command test case bodies, separate two real-SQLite
guard cases, publication tests and all native/harness/model mocks are untouched.

### READ-ONLY T030/T054 legacy V1 bootstrap limitation

`account-review-command-snapshots.ts:110–130` currently chooses the first
decoded V2 review as its global revision/generation authority and throws
`account_review_legacy_revision_unproven` when every physically owned draft is
V1. V1 contains account/category/selection information but NO authenticated
review revision, group identity/proof, or provenance for a preferred-currency
omission. A transport lease's initial generation `0`, guessed header or
recreated AI parsing is NOT sufficient edit CAS.

**Narrow future testable option (NOT IMPLEMENTED):** inside an exclusive
authenticated DB writer, fetch exactly one current owner/queue and all its
physical V1 rows; prove unique owned fingerprints and the unchanged raw
`{draftId,queueId,ownerId,fingerprint,version,payloadJson, selectionOverride,position,parsedAt}`
preimage of every participating row. Fail closed if missing, malformed, expired,
replaced or concurrently modified. Treat this as a separate one-time
migration/initialization transaction, not a replay of an existing review
command. Only a freshly committed coherent V2 snapshot may establish the first
durable revision and generation; then require an edit/retry against THAT sourced
authority, never accept the caller's old/unproven V1 generation. Preserve the
original account ID, pending account, category, dates, selected override and
physical IDs through the accepted T028 V1 converter; mark
`accountEvidence=uncertain` and currency `legacy_unknown`, with no fabricated
group or auto-selection. The exact genesis revision/entry policy and concurrent
preimage failure tests require separate Root approval before T030/T054.
Meanwhile fail closed without changing V1 bytes.

**CHECKS NOT RUN BY THIS WORKER:** Jest, real SQLite, typecheck, lint,
formatter, generator, emulator, provider or hosted work. Root runs the coherent
follow-up batch and commissions separate nonauthor acceptance.

**STOP — T029 source ownership released at the GitData checkpoint.**
