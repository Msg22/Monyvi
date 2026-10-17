# Monyvi #395 — T030 legacy SMS bootstrap and mixed-review tests-first contract

**Status: TESTS AUTHORED; NOT EXECUTED / NOT ACCEPTED.** Read-only sources and
one tests-only GitData child were used. Root independently runs admission. No
production code, app hook, test-only authority object, schema, DB column, SQL,
source service, native dispatcher, provider or ref was modified.

## Authority and exact source dependency

- Immutable parent: `4cdbd71db52e87281c9bdb9db25c29312b7cfe94`.
- Root's already reported **65 PASS** T029 suite: 18 command + two guards +
  seven real publication + 25 namespace lifecycle + 13 namespace lease. These
  are _previous_ results, not results produced during this lease.
- Approved contract: `specs/395-shared-account-review/contracts/wire-shapes.md`
  lines 183–200, `data-model.md` lines 89–104, and approved T029/T030/T039/T054
  dependency graph in `tasks.md`. No new product approval is needed for V1
  compatibility. T028 V2 codec must be the separately Root-accepted revision
  including `migrateSmsReviewDraftV1ToV2` / `legacy_unknown` and
  `accountEvidence: uncertain`; the base commit alone does not install it.
- Test fixture prerequisite: accepted frozen T025
  `account-review-v2-t025-fixtures.ts` overlay, already consumed by the existing
  protected command/codec tests. The tests reuse this fixture, canonical review
  schema/reducer, actual SQLite adapter and native
  `sms-review-namespace-test-harness` **as their first runtime import**.
- Both new suites statically import a future service module which is **currently
  absent**. Root's immediate batch is therefore expected to stop at **creation
  Red, zero assertions** until the service is implemented. That is not evidence
  that the authored behavior has passed or failed.

## Frozen private entrypoint (only public-to-app API; no wire expansion)

```ts
export function loadOrBootstrapOwnedSmsReviewSession(input: {
  readonly expectedOwnerId: string;
  readonly queueId: string;
  readonly signal?: AbortSignal;
}): Promise<AccountReviewSession>;
```

Proposed owning file:
`apps/mobile/services/account-review-legacy-bootstrap-service.ts` **NEW**. The
entrypoint returns only a validated canonical session, never a proof token or
guessed V1 authority.

Internal implementation should be module-private:

```ts
interface CapturedLegacyV1Preimages {
  readonly ownerId: string;
  readonly queueId: string;
  readonly rows: readonly LegacyPhysicalPreimage[];
  readonly queuePreimage: OpaqueActualQueuePreimage;
}
async function captureOwnedLegacyV1Preimages(
  input: OwnedSmsReviewLoadInput
): Promise<CapturedLegacyV1Preimages>;
async function commitOwnedLegacyV1Anchor(
  captured: CapturedLegacyV1Preimages,
  signal?: AbortSignal
): Promise<AccountReviewSession>;
```

The illustrative internal aliases above are PRIVATE descriptions only: derive
their field types from real `SmsReviewQueue`, `SmsReviewDraftItem`, accepted
codec and user-scope models. Do **not** export, persist or trust caller-created
copies of this internal data. The authenticated writer must verify the exact
captured queue and ALL physical owned V1 row preimages, including owner, queue,
ID, unique fingerprint, payload version, exact JSON bytes, selection override,
order/position and creation/parse/update times. The writer serializes behind
`database.write`, rereads the current actor and queue after acquiring that lock,
validates membership/expiry and uses `commitScopedPreparedBatch` with
cached-model rollback. A failed adapter commit does not consume authority; a
postcommit-notification error respects the durable result. Never mint a
transport lease or use its operation generation `0` as edit CAS.

Only one deterministic anchor is promoted: the earliest by `position` then
physical UUID. All unrelated V1 payload bytes and selections remain untouched.
The anchor uses `legacy-local:<physicalDraftId>` identity, explicit original
transaction account/pending/category/Date/selection,
`accountEvidence: uncertain`, `currency: legacy_unknown`, unresolved assignment
and no fabricated group/evidence/message ID. Canonical durable genesis must
differ from a speculative uncommitted `reviewRevision=0, operationGeneration=0`
command, so an unproven preview cannot accidentally become an authorized edit
after bootstrap. Subsequent edit admission uses only the committed V2 header and
per-row CAS, not a caller's previously sampled V1-like header.

## New cases — `account-review-legacy-bootstrap.sqlite.integration.test.ts`

15 authored cases:

1. One all-V1 queue creates exactly one deterministic physical V2 anchor;
   unrelated V1 bytes remain identical; accountID, pendingAccount, category,
   Date and authoritative selection survive with unknown currency/no invented
   absence or confirmation.
2. Real fresh adapter proves revision/generation persistence; a second load
   writes zero additional bytes.
3. An old-preview revision/generation `0` command cannot masquerade as committed
   authority or alter the selected original.
4. A fully V2 review opens without any write or altered revision.
5. Two serially admitted concurrent bootstraps create one anchor.
6. Foreign owner and sign-out cannot expose/change owned records.
7. Pre-aborted and held-writer-aborted requests cannot write.
8. Missing queue/real expiry cannot resurrect physical rows.
9. Malformed V1 raises `SmsReviewDraftCodecError: malformed_payload` with queue
   and raw bytes intact.
10. Adapter precommit failure restores all 10 local tables and cached Watermelon
    models; retry on the same source commits once.
11. Real actor change while the SQLite writer is held cannot authorize the
    previous owner's queued bootstrap or change its cached models.
12. Real expiry queued before bootstrap destroys the old owned queue/drafts,
    with no resurrection after writer release or later retry.
13. Queued actual selection change remains authoritative.
14. Queued real V1 transaction/account edit is preserved without overwrite.
15. Queued progress-V1 insertion is not omitted after bootstrap/reload.

The suite uses a real `adapter.testClone()`, scoped ownership, a held Watermelon
writer for concurrency and an actual rejected adapter.batch injection for
rollback; no fake successful SUT or native shim.

## New cases — `account-review-legacy-transitions.sqlite.integration.test.ts`

Six authored real-SQLite/public-service cases:

1. `set_row_selected(false)` touches only the anchored row: V1 sibling's exact
   payload, selection, position, parsedAt and local revision remain unchanged,
   while global V2 revision/generation advance correctly.
2. A REAL opted-in `parseSmsWithAi` complete published-session receipt admits
   one new fingerprint in a mixed V1/V2 queue, with new row unchecked and
   previously stored override/legacy row bytes unchanged.
3. Existing confirmed QNB V2 identity and clicked selection win over genuinely
   later original-request SMS evidence; sibling remains V1 and additional row
   does not silently disappear.
4. Durable removed-group tombstone survives real late evidence without
   re-confirmation or persisted transient Undo; unrelated V1 remains V1.
5. A real published colliding fingerprint with a different group identity is
   rejected with all 10 SQLite tables and cached models unchanged.
6. An unreadable sibling V1 blocks real late final publication with stable codec
   error and zero partial writes.

The only mocked response is the _existing harness's provider fixture_; the
parser, namespace WeakMap proof, reducer, dual codec, DB adapter, writer, and
financial/user ownership are not faked.

## Source gaps to admit and stage after the test Red

- **Bootstrap NEW private service:** owner/queue/preimage checked bootstrap and
  durable anchor, no new persistent fields, schema or public authorization
  token. Preserve actual old selection and account/category choices.
- **`account-review-command-snapshots.ts`:** mixed V1/V2 rehydration must
  validate one committed V2 header and stable per-row legacy revision. Current
  implementation rejects all-V1 at lines 110–130. Global revisions changing
  cannot invent a newer untouched V1 row revision.
- **`account-review-command-service.ts`:** after boot, only touched V1
  rows/groups migrate; unrelated V1 payload/selection bytes stay exact.
  Persisted V2 rows may have consistent global headers without bumping unrelated
  local revisions. Recheck actor, queue, fingerprints and current DB
  owned-account context inside one atomic writer; transient Undo only.
- **`account-review-command-publication.ts`:** current mixed-queue branch at
  lines 173–191 can return `create=[]`, `updateIds=[]` despite a real published
  final result with missing fingerprints. Correct this with exact
  WeakMap-candidate publication proof and durable-state priority, and reject
  incompatible group or edited physical evidence non-destructively.
- **Facade (subsequent Core T030 grant):** NEW
  `apps/mobile/hooks/useAccountReview.ts` and bounded adaptation of
  `useTransactionReviewSelection.ts` for cancellation, subscription,
  optimistic-result generation fencing and Voice memory-only sessions. No hook
  DB writes; no new Voice table.
- **Later T039/T054 integration:** scoped chooser/currency callbacks and only
  validated selected financial Save navigation, owned separately by
  Core/Financial/Choices. Do not use legacy Save as a V1 fallback.

No tests in these two files require a public preimage token or new review wire
keys. Bootstrap/hook/financial scopes must remain separate.

**NOT RUN:** Jest, actual SQLite tests, TypeScript, lint, format,
parity/generator, native/emulator/provider/hosted work. This is authored
tests-first creation Red only, not 21 newly observed behavioral failures.

**STOP — tests-only ownership released after an unreferenced GitData artifact.**

## T029/T030 owned legacy implementation source checkpoint (subsequent grant)

**Production authored only; NO source or test execution by this owner.** Root
previously established creation Red solely at the absent bootstrap module, zero
assertions in the two new suites. Separately, T029's previously accepted 65-case
real SQLite batch is not a claim that the new 21 cases are Green. This
changed-only source artifact is based on immutable
`77d02aaddefb2e2325f37608891e336e4047761c` and must be reconciled with Root's
separately accepted T028 corrected V2 codec. The parent tree's old V1-only codec
is NOT silently installed or changed by this worker.

### New private service and bootstrap authority

`apps/mobile/services/account-review-legacy-bootstrap-service.ts` implements the
previously frozen public-to-app-only API
`loadOrBootstrapOwnedSmsReviewSession({expectedOwnerId,queueId,signal?})` and
does **not** expose an authorization ticket. Before acquiring the write it
captures the unique current-owner queue, its entire owned draft membership, each
row's complete sorted Watermelon `_raw` preimage, unique fingerprint, exact V1
JSON/selection/physical ordering and all timestamps. Every source is
codec-decoded without deleting invalid records.

A serialized single `database.write` rechecks actor, abort, queue identity,
complete membership and exact cached preimages. A second concurrent bootstrap
finding an already committed V2 header rehydrates that header instead of writing
a new genesis; a modified still-all-V1 preimage rejects. The selected
deterministic first physical draft is promoted through the accepted
`migrateSmsReviewDraftV1ToV2` codec, with `reviewRevision=1` and
`operationGeneration=1` only after an authenticated atomic commit. The source
revision `0` is a newly persisted _legacy source snapshot marker_, never a
transport lease/edit authority. The current owned profile supplies only
`preferredCurrency` as a review-context value; legacy row currency stays
`legacy_unknown` and accountEvidence stays `uncertain`.

The existing `commitScopedPreparedBatch` protects cached-model preimages on
precommit failure and uses the adapter's durable-commit-wins publication
behavior. All unrelated physical V1 rows, account/category fields, selected
overrides, pending-account metadata, dates and source fingerprints remain
intact. An abort, expiry, logout, wrong queue, changed legacy edit, modified
membership or unreadable V1 never causes a draft deletion, discarded choice,
second anchor or synthetic proof.

### Graph, touched-only persistence and late parser admission

`account-review-command-snapshots.ts` now assigns an untouched V1 row's _local_
revision the stable committed legacy genesis `1`, while reading the actual V2
anchor's global reviewRevision/operationGeneration. V1 global session updates
never fabricate a newer local row revision.

`account-review-command-service.ts` updates V2 global headers for a successful
command but migrates only changed/touched V1 rows or all physical V1 members of
an affected group. Unrelated V1 raw payloads and selection overrides remain
untouched. The original authenticated single-writer/canonical reducer/volatile
Undo boundaries are preserved.

`account-review-command-publication.ts` uses the validated complete
published-session/candidate WeakMap receipt and rehydrates the actual mixed
owned V1/V2 graph for every genuine late final parser result. It correlates old
logical and physical rows by scoped fingerprint and does not treat
`legacy-local:<physicalId>` as a copied canonical source ID. Existing decisions,
selected overrides, tombstones and source revisions win; genuinely new
fingerprints enter unchecked. All updated V2 rows receive consistent headers,
while unrelated V1 bytes stay unchanged. New rows referring to a previously
confirmed group with unproven revision/identity/status are marked unresolved
rather than inheriting confirmation. Same-fingerprint conflicting active group
IDs are rejected without preparing a batch. A genuine final input containing new
fingerprints cannot be silently acknowledged with zero durable rows. Previously
unedited V1 progress may promote only when its complete actual prior bytes match
this same initial trusted session; older or edited V1 queues must first obtain
the authenticated genesis anchor.

### T030/Financial and Root boundaries

Only authorised hygiene was applied to the two new test suites (unused
type/value imports and a typed Jest rejected-adapter fault callback) and the
protected command test's mock-return annotation. **All 21 new cases and all 65
protected case bodies/assertions remain unchanged.** No new hook/facade, route,
UI, financial Save, locale, SQL, provider identity, table/column or persistent
Undo field is added.

**NOT RUN:** Jest, SQLite, TypeScript, lint, formatter, generator/parity,
native, emulator, provider or hosted checks. Root owns the cohesive 21+65 test,
strict type/lint and nonauthor review gates. The new production source is only a
provisional GitData artifact, not accepted behavioral Green.

**STOP — source and test-hygiene ownership released to Root.**
