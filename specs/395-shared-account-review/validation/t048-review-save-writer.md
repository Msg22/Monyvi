# #395 T048 — selected review financial Save production checkpoint

**State: SOURCE AUTHORED, NOT RUN / NOT ACCEPTED.** Root owns the coherent
49 T043 cases, protected legacy tests, strict TypeScript/lint/format, SQLite
evidence and independent nonauthor review. No test, provider, emulator, native,
SQL or other execution was performed by this owner.

## Immutable scope

- Trusted governing Main: de09f76bdadb570c99a1015bbf1c680279b0d5ad.
- Exact accepted complete source parent:
  3fd664bd9abe78684e84415913921c2a44391243, tree
  1cd52a000cb42ccf58cd63fe6c7961e70a7ee3e4.
- Approved current financial source contracts and T043 source:
  b89f9433dbfafc0dec84b5fea306e2b2968ee7f4.
- All authored service/preparation/financial/ownership/SMS helper and this
  validation file paths are new and absent in the parent.
- Existing pending-account-service.ts baseline d7e66234f8557bd1369fd9e28c3379e22dcaffbb
  is unchanged. The accepted T047 core adapter remains unchanged at
  ec607a0830b80215ef5264221034a681ed596b26.
- Existing foundation repository, legacy balance command, default production
  registry, SQL, DB schema, sync, reconciliation, hooks, locale and UI are not
  edited.

## Selected-intent and foundation boundary

The new createAccountReviewSaveService({ database, hashProvider,
getCurrentOwnerId, loadCurrentSession }).saveSelectedAccountReview({
session, intent }) consumes the canonical T004 immutable SaveIntent. Synchronous
admission validates the schema and frozen actionId/occurredAt/owner/source/
session/revisions, exact selected row and confirmation evidence, and every
planned row/group account identity. Physical IDs come only from the supplied
plannedEntityIds; bank/sender localRefs rederive the pinned UUIDv8/hash
preimage using normalizeAccountSmsSender, with no row-index or new random ID.

The dedicated private account-review-financial-command-service.ts instantiates
createFinancialActionFoundationRepository with the explicitly opt-in T046
review registry, scoped owner operations and the injected database. The
accepted T047 createCoreReviewBatchSaveAdapter validates the complete exact
transactions/review_batch_save/review.batch-save/v1 envelope before forwarding
it to this real command. Neither the legacy account-balance command nor
legacy canonicalizeEffects/buildEnvelope handles this action. The global
DEFAULT_FINANCIAL_ACTION_REGISTRY is unchanged.

Preflight creates canonical envelope/evidence without committing any models.
Inside the ONE owned foundation database.write, plan generation rechecks
current actor, identical current loaded session/selected data, owned active
account/default state, account currency/type, accessible active category,
SMS physical source snapshot and alias map. The exact canonical envelope
must equal the preflight envelope byte-for-byte. The linked plan supplies
all prepared account/child/transaction/transfer/effect creates and existing
account/SMS operations, cached/prepared ownership callbacks, and semantic
prepared-postimage verification. The existing atomic foundation captures
preimages, restores cache on failed SQLite batch and retains committed state
despite a postcommit observer failure.

## Financial and account invariants

Only newly selected unsaved financial rows enter the canonical cloud payload.
Existing account balances use shared exact minor-unit conversion and financial
revision helpers; zero-net selected rows retain all financial records, one
zero-valued effect and one account revision increment. There are no fabricated
nonzero effects, repeated opening delta, direct balance save or unrelated
create. Amount, currency, fingerprint, category, SMS/VOICE and ATM endpoints
have separate source/owner guards.

Created Cash/Bank/Wallet accounts have zero *opening* minor units and selected
effects only. Exact frozen account UUID order chooses one first default when
the owned active snapshot is empty; a nonempty set leaves ALL new flags false
and preserves the existing or intentional null default. One
creationDefaultSnapshot is present iff any new account is created.
BANK has one owned bank_details and normalized sender aliases; WALLET has
sender aliases but no bank_details; CASH has no children. Unselected groups
create no accounts. No SMS ATM destination group is invented.

## SMS original and cleanup semantics

The private SMS preparation resolves physical draft IDs through authenticated
owner+physical queue+source fingerprint and validates stored V2
owner/session/row/revision/selection/transaction. It does not identify a
draft by rowId, queue index, nickname or Cloud transaction ID. Existing owned
active transaction OR transfer fingerprints deduplicate before posting, while
deleted/foreign fingerprints do not. The payload contains only opaque local
bookkeeping references and hashes; no raw SMS, transcripts, draft JSON or
Undo tokens. Remaining linked unselected rows are rebound to the newly
created account within the same linked-operation plan; independent CIB groups
and explicit selections remain untouched.

The foundation's present existing-operation type permits update and
markAsDeleted, but not prepareDestroyPermanently. Thus finance-linked selected
drafts use the supported atomic logical tombstone operation; an all-dedup,
no-financial-root cleanup may permanently remove local drafts/empty queue in
one separate cleanup-only writer. There is NO second financial commit and
never a fake action root. The T049 old SMS-save adapter remains untouched.
Root must adjudicate physical deletion semantics and protected-push handling
with T049; this T048 checkpoint does not silently extend the foundation API.

## Replay/recovery integration gates

A previously accepted action is identified by immutable action ID and owned
hashed root before reconstructing any postcommit financial guards. The
review-only foundation returns replay without reposting an effect. Altered
occurrence/selected financial IDs/fingerprints/confirmed group refs reject.
Pending-local ambiguous roots fail closed rather than issuing a new action.
Concurrent identical actions serialize through the foundation writer.

A durable complete selected-intent hash beyond the approved new cloud payload,
device-local rejected-action raw SMS/default/created-child recovery snapshot,
canonical rejected-action compensation and push/restart installation remain
T049/T050/T051/T052 source/integration gates. The current foundation group
model has no authorized review-only local recovery field; no raw snapshot was
smuggled into payloadJson/outcomeJson, no new schema/store/global state was
invented, and no assertion is made that restart compensation is complete.
The canonical outer current-session authority T029 remains separately owned:
this service requires an injected loadCurrentSession and never synthesizes a
trustworthy persisted session.

## Root acceptance

T043's 31 service + 18 physical SQLite tests were missing-SUT creation Red,
zero executed assertions, when this source grant began. Do NOT count them as
49 behavioral failures or PASS. Root should install this changed-files-only
source, run one coherent 49+legacy/types/lint/SQLite batch, inspect meaningful
failures and commission independent nonauthor source review. The initial
source artifact is frozen for Root evaluation, NOT presumed approved or
activated in production routes.

**NOT RUN by this owner. STOP after the immutable unreferenced GitData commit.**

---

## Bounded correction checkpoint — T043 import cycle and source style

**Status: correction authored, NOT RUN; Root's coherent verification pending.**
This receipt supplements the initial a82 source checkpoint. It neither replaces
the approved contracts nor claims Save behavior Green.

**Root's actual pre-correction batch:** all **40** core and protected legacy
tests PASS. Both T043 Save suites load **ZERO assertions** due to a Jest mock
module cycle, not 49 failed Save behaviors. `@monyvi/db` mock factory
previously read `LEDGER_MODEL_CLASSES` from the full SQLite helper; the
helper imports T043 fixtures, which import the real SMS sender service, which
re-enters the mocked `@monyvi/db` before the helper has initialized its model
array. Generated parity PASS. Only five new T048 source typing diagnostics
and scoped lint remained before this correction.

**Harness correction:** The NEW
`apps/mobile/__tests__/services/account-review-save-ledger-models.ts`
directly imports the same **11 actual WatermelonDB model classes**, in the
same order, with no app service, fixture, database singleton or mock import.
Both existing T043 Jest factory closures require only that isolated module.
`account-review-save-sqlite-test-helpers.ts` imports and re-exports its
identical `LEDGER_MODEL_CLASSES` binding; its existing real SQLite seeding,
raw-table snapshots, adapter faults, cache assertions, owner races, and fresh
instance replay remain untouched. Both test suite bodies, all **31 service +
18 SQLite** cases and all assertions remain unedited. The test/helper
baselines are the exact b89f9433 test blobs (not present in the a82 tree).

**Production typing/style correction only:**

- `account-review-save-accounts.ts`: typed model `createdAt` assignment
  during `prepareCreate` replaces indexing an unknown `_raw.created_at`;
  the prevalidated `group.type` is captured in a narrowed local before
  passing it into the model-creation callback. Three multiple-const statements
  are split without changing their values or order.
- `account-review-save-financial.ts`: same typed `createdAt` setter
  and three multiple-const splits. Currency, amounts, revision and effects
  calculations remain unchanged.
- `account-review-save-ownership.ts`: unknown-to-record guard with own
  property presence checks replaces unsafe arbitrary `_RawRecord` indexing.
  All pre-existing owner/postimage semantic comparisons remain intact.
- `account-review-save-plan.ts`: `finalPayload` accepts a canonical
  **readonly** effect array and already copies it before sorting, without
  mutating frozen input or changing the action hash policy.
- `account-review-save-service.ts`: removes only three unused imports;
  replay's uncalled plan callback returns the same rejected Promise without
  an unnecessary `async` modifier. The injected typed plan callbacks and
  complete envelope are not rewritten.

No pending-account, foundation, legacy command, global registry, SQL, sync,
reconciliation, SMS T049 adapter, UI, locale or other source changes. No
fake writer, database shim, bypass, casts, `any`, disabled tests or artificial
success path was introduced.

**Root next:** integrate only the changed blobs against immutable a82 parent
plus the frozen b89 T043 test baselines, then rerun **49 T043 + 40 legacy/core**
in one coherent real-SQLite batch, strict mobile/logic TypeScript, lint and
formatting. A separate nonauthor review remains required for source acceptance.

**NOT RUN by this owner. STOP — bounded correction source released.**

---

## T048 readonly created-at preparation correction (root coherent Save batch)

**Status: narrow source correction AUTHORED, NOT RUN.** The previous typed
`model.createdAt = new Date(occurredAt)` helper at this report's prior
checkpoint was not valid runtime behavior. Root's first full executing batch
after the Jest model registry correction ran **89 tests: 62 PASS / 27 FAIL**.
The protected 32+8 cases all PASS; all 27 remaining failures share an actual
`@readonly @date("created_at")` setter error during `prepareCreate`, not
27 unrelated Save contract failures. Root reports all eight T048 source
modules strict TypeScript 0, lint 0, formatter 0, generated parity 0 at
the pre-correction state. Those are Root's observations, not new tests here.

**Exact correction:** Only the two private `fixedCreatedAt` helpers in
`apps/mobile/services/account-review-save-accounts.ts` and
`apps/mobile/services/account-review-save-financial.ts` replace the forbidden
model decorator setter with:

```ts
function fixedCreatedAt(model: Model, occurredAt: string): void {
  Object.assign(model._raw, { created_at: Date.parse(occurredAt) });
}
```

This follows the existing approved
`apps/mobile/services/metal-canonical-action-group-service.ts`
`setServerIdentity` at lines 412–415. The generated Account, BankDetails,
AccountSmsSender, Transaction and Transfer base models all declare
`@readonly @date("created_at")`, so setting the decorated `createdAt`
property throws. Updating the prepared model's raw record with
`Object.assign` is an existing project convention. This retains the
immutable, canonical `intent.occurredAt` timestamp in both the local
prepared model and matching cloud mutation; it does not generate a fresh
timestamp, skip the timestamp, change ID allocation or suppress failure.
No arbitrary keyed raw indexing, casts, `any`, altered schema or generated
model edits. The three account/child and two financial call sites remain.

**Immutable parent:** `8434612a81308f776746367bab4fc3310d26ac51`.
Only the two source paths above and this validation report change.
The 49 T043 assertions and protected 40 tests remain byte-identical;
all harness files, other T048 modules, foundation, legacy command, SQL,
sync, T049 and T029 sources are untouched. Earlier report evidence is
retained for audit, with this correction superseding its erroneous claim
that the decorated-property setter was a safe typed write.

**Required Root acceptance:** import exact changed blobs and rerun coherent
**49 Save + 40 protected tests**, then source TypeScript, lint and format
as independently scheduled. This correction is not asserted Green here;
provider, emulator, native, hosted database and runtime checks are NOT RUN
by this owner. No branch/ref moves, pushes or PR/issue mutations.

**STOP — bounded T048 readonly-date correction ownership released.**

---

## T043 signed-effect adjudication and postcommit replay regressions

**Tests-only checkpoint, NOT RUN by this owner.** Root's actual coherent
pre-correction batch after the readonly-date fix: **89 executed, 88 PASS,
one S39 FAIL**. All **31 service + 40 core/protected** tests PASS,
**17/18 real SQLite** tests PASS. The sole S39 mismatch is a stale
expectation: `makeSaveFixture("voice-cash")` uses
`scenarioRows("voice-cash")` with `amount: "11"` and no explicit
transaction type; the canonical fixture `row()` defaults to `EXPENSE`.
The required signed financial effect for a newly created Cash account
is therefore **-11**, not +11. Only the S39 assertion value changes
(`balance: 11` → `balance: -11`), while its no-default behavior,
revision, root and `creationDefaultSnapshot` checks remain unchanged.
No source arithmetic is adjusted to appease the faulty assertion.

**Three new fresh-instance replay tests**, all against the real
`reopenSqliteLedger` adapter after an already successful financial Save.
Each candidate goes through the real canonical
`accountReviewSessionSchema` (and `accountReviewSaveIntentSchema` when
the selection changes), so a malformed or impossible candidate does not
masquerade as an acceptance/red result:

- **S27b, coherent amount edit:** First Save `voice-existing` and prove
  `committed`; keep the same action ID, occurrence, selected row ID,
  revision, planned physical IDs, assignments and currency, while
  changing **both** `amountDecimal` to `"14"` and
  `transaction.amount` to `14`. The source row remains valid but its
  financial delta differs from the stored action. Replay must reject.
- **S27c, valid selection/plan superset:** First Save `voice-shared`;
  then mark one previously unselected, genuinely linked QNB row selected,
  increment that row's revision and the session's review/generation
  revisions, and append its selected-row descriptor and one new unique
  transaction physical ID (`testUuid(990)`) to a **schema-validated**
  immutable intent. Preserve the original action ID, occurrence, *every
  existing planned alias/physical ID*, existing selected revisions,
  confirmed QNB group and evidence. This intentionally keeps old
  `selectedSourceRefs` and `domainRecordRefs` as subsets of the new
  references, exposing the current replay membership-only comparison.
  The already-tested swap case `changedSelectedSharedQnb` is insufficient:
  a swap removes an old selected row and is caught by the existing
  subset check. New selection must reject without reposting.
- **S27d, confirmed group definition changed:** First Save a genuine
  `sms-shared` action with three unselected drafts still physically
  present. Change only the confirmed QNB display name to
  `"QNB Edited Savings"` in a schema-valid review session, retaining
  action ID, occurrence, planned account/child/row physical IDs,
  group ID, revision and evidence key. The old stored payload's
  `confirmedGroupRefs` continues matching the weaker comparison; the
  new frozen group definition must nevertheless reject as changed
  action content rather than replay the old hash.

The shared assertion helper captures every one of the same **11 real
SQLite tables** from the already committed, freshly cloned database,
including action roots, effects, transactions, transfers, draft
rows/queues and children. It also retains all loaded Watermelon model
references with their `_raw` JSON preimages, and verifies both the
unchanged durable tables and the **same cached instances** after
rejected replay. It explicitly checks a genuinely committed root and
at least one persisted effect before the rejection attempt. No mock
receipts, additional database writer, artificial pending state, skipped
tests or bypass of frozen validation were introduced.

The original **31 service + 18 physical SQLite = 49** T043 cases remain;
this tests-only addition increases the physical suite to **21 cases**
and overall Save inventory to **52**. All original assertions are
preserved except the expressly adjudicated S39 expected signed
balance. The core/protected 40 stay unchanged. The source, frozen
fixture, model registry, SQLite helper, foundation and SMS adapter
are unmodified. The service test path remains at its accepted parent
blob `6742a7b228953a8588546723374062a80ae92646`; only
`account-review-save-service.sqlite.integration.test.ts` and
this report change.

**Root's next evidence:** run the coherent real-SQLite **52 Save +
40 core/protected = 92** cases, confirm S39 matches the signed
delta, and observe any targeted replay Red with no partial table/cache
writes. A later bounded production replay fix must preserve identical
fresh-instance replay PASS and fail the three coherent changed payloads.
No source fix has been authorized in this tests-only lane.

**NOT RUN; STOP — bounded T048/T043 tests-only ownership released.**


---

## T048 immutable replay-content binding and SQLite harness correction

**Status: source/tests AUTHORING ONLY; NOT RUN or accepted.** Immutable source
parent \`b4ae7775aee4fe13f9e6f8460bdd85ea28ca4fe9\`, tree
\`c69b7432435cc8e1f2f94d36e05458dda4870474\`, parent \`d876385\`.
It includes all eight prior Save source modules, the complete actually executed
52-case Save suite and two-case independent boundary suite, and the accepted
frozen 44587a91 test fixture. No prior full tree is merged.

### Root-confirmed prepatch observations

The real SQLite batch now proves S27b, S27c and S27d all reach their
intended assertions but incorrectly return \`{ kind: "replay" }\`. The
counterexamples respectively change a coherent amount, add a selected QNB
row with an additional planned transaction, and rename a confirmed QNB
group while retaining its revision/identity refs. S26 identical fresh
replay already succeeds. S28/S29/S30/S37 still exercise real
transaction-ID UNIQUE/PRIMARYKEY conflicts but generic Jest \`toThrow\`
matches the adapter's cross-realm Node \`SqliteError\` poorly.
The S42 raw \`SQLiteAdapter.batch\` mock has the wrong asynchronous
contract and hangs rather than reporting a transaction failure; S43
extra frozen child membership remains an unverified behavioral gate.
Core/protected 40 and service 31 remain PASS; source TS/lint/parity were
already clean. All observations are pre-correction Root evidence only.

### Replay proof, not postcommit reconstruction

NEW private \`account-review-save-replay.ts\` compares the frozen
\`AccountReviewSaveIntent\` and its canonical session to the **already
persisted** \`review.batch-save/v1\` envelope, rather than generating a
replacement cloud action from current/postcommit balances, financial
revisions or default flags. The existing envelope is still parsed through
the accepted T046 registry and its original payload hash is validated
by the opt-in financial foundation on idempotent dispatch.

Every committed \`selectedSourceRef\` must match an actually selected
frozen logical row, original fingerprint, exact planned record ID and
type. Its selected transaction/transfer mutation is compared to the
review row's canonical Decimal minor units, numeric amount, account
assignment, source, date, currency, type/category, immutable notes and
counterparty, and stored createdAt. Every created/confirmed group is
checked against its frozen account definition (name, type, currency,
institution/provider), exact account UUID and revision. BANK children,
normalized sender labels, card suffixes and their frozen hash-derived
physical child aliases are checked against the full mutation membership.
Extraneous planned IDs and missing frozen create members fail closed.
No raw review row, SMS body or transcript is newly serialized on wire,
and no registry, foundation, SQL, schema or global store is changed.

The helper distinguishes the **immutable full selection intent** from
the action's **actually posted subset** for SMS. For \`sms-mixed\`, the
originally selected fingerprint A is already saved under an owned active
transaction outside this action, whereas B is a new posted transaction.
The full frozen intent retains both selected rows and planned physical
create IDs, but the immutable committed \`selectedSourceRefs\` and
financial mutations rightfully contain only B. An omitted selected row
is admitted exclusively if it is SMS and an independent owned active
transaction/transfer with its exact fingerprint and a record ID outside
the committed mutation proves prior saving. If an omitted row alone
references a confirmed account group, its unused frozen account/Bank/
sender planned IDs are permitted only after all selected members for
that group meet this independent dedup proof, with the original alias
derivation still validated. Voice never gets this omission exception.
This deliberately avoids the incorrect full-intent-count equality
that would reject legitimate fresh-instance partial-dedup replay.
The cleared current review session is never required for a replay;
the stored source is authoritative and the initiating actor is rechecked.
The limitation of the unchanged cloud contract is explicit: omitted
historically deduplicated rows do not have their raw precommit review
snapshot on wire, so no nonexistent stored digest is claimed.

### Frozen test revisions

- **S26b NEW positive**, genuine \`sms-mixed\` with both frozen selected
  rows and both frozen financial physical IDs; seed prior owned active
  fingerprint A, commit remaining B, then replay the same original
  session/intent/action in a separate fresh SQLite database/service.
  Assert replay and unchanged physical state; neither A nor a fabricated
  second effect is serialized into the committed mutation.
- **S27b/c/d** remain unchanged meaningful fresh-instance Red evidence.
- **S28/S29/S30/S37** continue injecting or creating genuine
  \`transactions.id\` SQLite constraints. Rather than relying on
  an \`Error instanceof\` matcher across Node realms, require the
  original rejection's precise \`SQLITE_CONSTRAINT_PRIMARYKEY\` or
  \`SQLITE_CONSTRAINT_UNIQUE\` code plus \`UNIQUE constraint failed:
  transactions.id\` message. All physical rollback/cache/retry assertions
  remain after this diagnostic check, not skipped or weakened.
- **S42** now matches the actual WatermelonDB 0.28
  \`SQLiteAdapter.batch(BatchOperation[], ResultCallback<void>): void\`
  contract. It collects real attempted \`destroyPermanently\` tables
  and reports a deliberately injected error via
  \`callback({ error: new Error(...) })\`, never a dangling rejected
  Promise. The real prepared-batch writer and rollback assertions remain
  in place. **S42/S43 production issues are not fixed or adjudicated** by
  this tests-only shim correction; Root must rerun to establish genuine Red
  before granting an implementation repair.

The 31-case service suite, all 40 protected/core cases, frozen fixture,
financial-effect math, actual Watermelon ledger helper/registry,
SQL/sync/provider/locale/hook and T029 production are untouched.
The 21 physical SQLite Save cases gain **S26b**, becoming 22;
the two boundary cases remain intact. Root should run its complete
55 Save plus 40 protected suite and strict types/lint/format.
The actual new 53-Save/2-boundary counts must be reported separately
if tests are batched by file, never silently dropped.

**Execution by this owner: NOT RUN.** No Jest, TypeScript, lint,
formatter, SQLite, DB/provider, emulator, native or verification gates
executed. Commit will be unreferenced, changed paths only, with no
branch/ref/push/PR/issue mutation.

**STOP — T048 bounded source/tests correction ownership released.**
