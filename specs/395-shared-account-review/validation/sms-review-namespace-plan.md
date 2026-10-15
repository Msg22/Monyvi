# #395 — Owned SMS review namespace, original-v1 provenance and queue lifecycle

**PLAN ONLY; no implementation authority.** Reviewed live `codex/395-core-worker@508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6`, current main governance `63d6e40bf24867aa269ef8a74b79c7bcbb618205`, preceding read-only [SMS session namespace proposal](https://github.com/Msg22/Monyvi/blob/508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6/specs/395-shared-account-review/validation/sms-review-session-namespace-plan.md#L1-L77) and current SMS queue/parser/orchestrator sources. Current root-provided **T013** evidence: 76 mobile, 15 strict Deno helper and 80 Edge Node tests PASS; six null-version and five transport checks PASS, ESLint clean. These validate existing provider/parser gates, **not** complete direct/hybrid v2 session namespace, old-v1 review carrier or queue durability. This author executed **no** tests, DB commands, native/emulator/provider calls or builds. This report modifies **only itself**.

## 1. Verified current behavior; the two hard blockers

| Boundary | Current behavior and consequence |
| --- | --- |
| Queue ID source | [`packages/db/src/database.ts:5–9, 56–91`](https://github.com/Msg22/Monyvi/blob/508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6/packages/db/src/database.ts#L56-L91) calls `setGenerator(generateUUID)` **before constructing WatermelonDB**. Its generator produces standard lowercase UUID v4 model IDs. A *freshly created owned* `SmsReviewQueue.id` is therefore a legitimate `AccountReviewSession["sessionId"]` after canonical validation. Existing/legacy IDs must still be validated, never cast. |
| Read/empty cleanup | [`getSmsReviewDraftQueueSnapshot(expectedUserId):211–255`](https://github.com/Msg22/Monyvi/blob/508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6/apps/mobile/services/sms-review-draft-repository.ts#L211-L255) returns `null` when no owned queue, or removes an **empty** queue using [`removeOwnedQueueIfEmpty:196–209`](https://github.com/Msg22/Monyvi/blob/508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6/apps/mobile/services/sms-review-draft-repository.ts#L196-L209) before returning `null`. It is a UI/data snapshot accessor, **not** a namespace-acquisition API. |
| First queue creation | [`mergeSmsReviewDrafts:300–514`](https://github.com/Msg22/Monyvi/blob/508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6/apps/mobile/services/sms-review-draft-repository.ts#L300-L514) first scopes/sanitizes finance, then in `database.write` rejects dismissed/saved/already-present fingerprints. If there are **no new/refreshable rows**, it returns early at 442–459; otherwise it creates `queueCollection().prepareCreate` **inside the same prepared batch** as new items at 462–503. It currently returns only counts/fingerprints, not a queue ID. Thus no queue ID exists for a new owner's earlier `parseSmsWithAi` completion. |
| Direct Core | [`parseSmsWithAi:673–802`](https://github.com/Msg22/Monyvi/blob/508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6/apps/mobile/services/ai-sms-parser-service.ts#L673-L802) returns from original sequential/parallel chunk completion. [`resultFromState:268–284`](https://github.com/Msg22/Monyvi/blob/508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6/apps/mobile/services/ai-sms-parser-service.ts#L268-L284) carries `reviewChunks` but does **not** create `reviewSession`. Frozen T007 calls this parser **directly** and requires one *complete* owned canonical session on opt-in success. |
| Hybrid and local | [`parseHybrid:523–721`](https://github.com/Msg22/Monyvi/blob/508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6/apps/mobile/services/sms-parser-orchestrator.ts#L523-L721) combines trusted/local, optional category enrichment and AI; [`parseSmsWithOrchestrator:750–890`](https://github.com/Msg22/Monyvi/blob/508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6/apps/mobile/services/sms-parser-orchestrator.ts#L750-L890) can also use local-only or AI-primary. Its source selection/dedup must **precede** publishing the one final review session; intermediate AI-only progress is not a durable snapshot. |
| Transport IDs | `SmsAiRequestContext.scanSessionId:string|null` ([service:112–120](https://github.com/Msg22/Monyvi/blob/508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6/apps/mobile/services/ai-sms-parser-service.ts#L112-L120)) is an opaque scan-service identity. Splits/fresh retries can replace `ChunkWork.requestKey` ([chunk runner:469–537](https://github.com/Msg22/Monyvi/blob/508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6/apps/mobile/services/ai-sms-chunk-runner-service.ts#L469-L537)); `SmsScanContext.reviewSessionId` is a numeric UI generation ([context:59–100](https://github.com/Msg22/Monyvi/blob/508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6/apps/mobile/context/SmsScanContext.tsx#L59-L100)). **None** is the canonical review session UUID, owner authorization or account-match proof. |
| Existing last-item actions | [`discardSmsReviewDraft`:669–728](https://github.com/Msg22/Monyvi/blob/508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6/apps/mobile/services/sms-review-draft-repository.ts#L669-L728) removes the queue when the last item is discarded; [`restoreSmsReviewDraft`:785–841](https://github.com/Msg22/Monyvi/blob/508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6/apps/mobile/services/sms-review-draft-repository.ts#L785-L841) currently allocates a **new** queue if one no longer exists. Undo of the last edited row is therefore a **future T028/T029 identity preservation case**, not evidence that the early lease solves full Undo. |

**Blocking cycle:** Direct T013/T007 expects `reviewSession` **before** the post-parse queue merge; T014-M's canonical normalization needs a stable UUID **before** deriving row/group IDs; full queue codec/edit/Save migration is held at T028–T031 by T016. Deriving a transient UUID from chunk keys and then substituting a later created queue UUID would **renamespace edited rows**. This is a real T014-M ↔ T028 *identity-acquisition* cycle, not permission to implement full T028 early.

## 2. Decision: conditional atomic **owned queue UUID lease** after accepted finance, before initial normalization

**Recommend the narrow lease, not "first atomic acceptance" as the present solution.** For one interactive current owner, atomically **read an existing owned queue or create exactly one empty owned queue** only once the original parser has a successfully admitted, original-identity-correlated **reviewable positive financial row** and is about to construct its first review session. Its Watermelon UUID `queue.id` becomes `sessionId` **as-is** after checking canonical UUID syntax. Multiple original chunks, parallel parses for the same owner/queue, and hybrid/local completion reuse this **same UUID**; owner isolation also requires comparing the owner, not treating UUID knowledge as authentication.

An early empty queue is a **temporary namespace lease**, *not* a saved draft, fabricated transaction, provider "positive", new review row, default account, T028 migration or UI activation. Create it through existing `database.write` and `commitScopedPreparedBatch` ownership/rollback helpers (no new table/column) and retain the ID until either real accepted rows are committed to the owned queue or the empty lease is safely released/garbage-collected. An ordinary queue read may return `null` to UI while an active lease pins its empty record; the current unconditional empty-prune operation **must be guarded by active lease state** in the same queue repository. An app restart loses only the *in-memory* lease, so an orphan empty queue with **no saved/edited rows** can be pruned on the next owned read. Nonempty existing queues remain durable without a lease token.

**Why first-atomic-acceptance is not viable under the current public result contract:** waiting until `mergeSmsReviewDrafts` writes its first item would avoid provisional empty queues, but direct `parseSmsWithAi` must already have returned the fully normalized session. Moving parser completion behind the current merge means committing financial drafts **inside the parser** before user-facing review, changing saved-state/dedup/cancellation behavior and encroaching on gated T028 codec/writer work. Returning a provisional ID and later replacing it is forbidden. This alternative is only reconsiderable if Root explicitly redesigns/Red-tests direct-parser publication and the T028 gate; it is **not** a drop-in fix.

**Lease timing for both paths:**

1. **Direct opt-in `parseSmsWithAi`:** keep original auth/consent/quota/DeepInfra/chunk transport untouched. After all *admitted* chunks settle and original finance/provenance is correlated, if no eligible positive rows or no `reviewAccountSnapshots`, return the prior parser result **without** creating a queue/lease or reviewSession. Otherwise the internally imported SQL-owned final-session service acquires the UUID lease, normalizes once across accepted source chunks (or per chunk with the **same** sessionId), validates current actor/lease again, and adds the complete `AccountReviewSession` before returning. No **required public parser callback**, new parser argument, external model or grouping call.
2. **Outer AI-primary/hybrid/local:** preserve the ordinary `parseSmsWithOrchestrator` final admitted/deduped financial set. In hybrid, an internally invoked AI parser may carry its own initial AI-only session/lease, but **must not publish that interim session to progress/UI or replace the outer complete session**. Reuse/revalidate the **same owned queue UUID** through the shared repository lease; add trusted/local proof only if source-grounded (otherwise `providerResponse:null`/unconfirmed). Local-only requests with at least one reviewable original finance row acquire that same namespace without any new AI request. A caller that already holds a lease keeps it pinned through final publication; nested leases are reference-counted. No orphan AI-only initial session is persisted.
3. **Late arrivals/retries:** retries, 413 splits and reorderings may produce new model aliases/transport keys, not new `sessionId` or changed `rowId` for previously admitted source. Reuse original message ID+fingerprint as source; namespace *model* `transactionRef` and `suggestionRef` consistently per accepted chunk, never namespace source IDs/fingerprints/UTF-16 spans. T027 later merges against current revision/selection/group/tombstones. Without that reducer, a stale initial batch may return as a **candidate**, never overwrite an edited row's assignments/selection/revisions.

## 3. Exact minimal SQL-owned API proposal (subject to separate Root freeze/Red)

**Proposed owner:** NormalSQL / T014-M + narrowly leased existing queue repository. The only early prerequisite potentially allowed by [main plan:173–184](https://github.com/Msg22/Monyvi/blob/63d6e40bf24867aa269ef8a74b79c7bcbb618205/specs/395-shared-account-review/plan.md#L173-L184) and [main tasks:62–73, 213–224](https://github.com/Msg22/Monyvi/blob/63d6e40bf24867aa269ef8a74b79c7bcbb618205/specs/395-shared-account-review/tasks.md#L62-L73) is the **atomic owned queue UUID acquisition/lease helper**, independently tested for races. Full codec, command writer, stateful reducer, UI and Save remain gated.

```ts
// PROPOSED, NOT IMPLEMENTED.
// apps/mobile/services/sms-review-namespace-lease-service.ts
// Private app-service contract; derive ID type from canonical output.
type OwnedSmsReviewQueueLease = Readonly<{
  expectedUserId: AccountReviewSession["ownerId"];
  queueId: string; // actual owned SmsReviewQueue.id, checked as canonical UUID
  sessionId: AccountReviewSession["sessionId"]; // EXACTLY queueId
  leaseToken: string; // app-local opaque token, never model/provider input
  queueGeneration: string; // app-local queue-lifecycle CAS epoch, not a DB column
}>;

acquireOwnedSmsReviewQueueNamespace(input: {
  readonly expectedUserId: AccountReviewSession["ownerId"];
  readonly signal?: AbortSignal;
}): Promise<OwnedSmsReviewQueueLease>;

assertOwnedSmsReviewQueueNamespaceCurrent(input: {
  readonly lease: OwnedSmsReviewQueueLease;
  readonly signal?: AbortSignal;
  readonly expectedReviewOperationGeneration?: AccountReviewSession["operationGeneration"];
}): Promise<void>;

releaseOwnedSmsReviewQueueNamespace(input: {
  readonly lease: OwnedSmsReviewQueueLease;
  readonly disposition: "no_accepted_rows" | "cancelled" | "published" | "committed";
}): Promise<void>;
```

**Implementation bounds before code:** Keep `getOrCreate`, validation, in-flight token/reference count and zero-item conditional destroy together under the existing `sms-review-draft-repository.ts` owned `database.write`/prepared-batch boundary, or in a small **new** service that calls a single bounded repository primitive; **no scattered DB queries in hooks/components**, no new SQL/Watermelon schema. Never call `getSmsReviewDraftQueueSnapshot` as acquisition: it currently deletes empty queues. Use existing `getCurrentUserDataScope` / `assertExpectedCurrentUser`, `assertSingleQueue`, and `commitScopedPreparedBatch` primitives. Register a committed new empty queue's active lease before the writer unlocks. If two same-owner acquires race, only the **single** `database.write` winner creates a queue; the other reads its UUID. Any foreign owner, >1 owned queue, pre/post-await actor change, abortion, or invalid existing queue ID fails closed; do not cast/noncanonically rehash legacy queue IDs.

**Checks and CAS semantics:** An active lease token identifies `(owner,queueId,queueGeneration)`. The internal in-memory `queueGeneration` increments when an owner resets a review, clears/discards the queue, replaces it or logs out; an ordinary single-operation abort revokes **only its own leaseToken**; it is **not** a substitute for the canonical `operationGeneration`/row/group revisions or persisted T028 CAS. Before hashing/normalizing, after awaits, before publication, and at any owned draft merge, re-read the *current* owned queue ID and actor and compare the lease token/generation. If the queue was deleted/replaced, **reject** the stale completion; never reuse its rows under a new queue. A legitimate metadata/`updatedAt` change or newly committed item in the same queue is **not** an automatic reason to renamespace; T027/queue writer handles conflicting edits/revisions, not the identity lease.

**Empty-queue cleanup:** In `getSmsReviewDraftQueueSnapshot` and `removeOwnedQueueIfEmpty`, return the same UI-visible `null` for zero drafts but skip physical empty queue deletion **while any valid in-flight same-queue lease remains**. On `no_accepted_rows`/cancel/owner-switch/timeout, release token in `finally`, then under an owned writer: destroy only if **same queue ID**, zero rows, **zero other leases**, expected generation and same actor. Never delete an existing populated queue, a queue reused by another active parse, or a replacement queue. On `published`, hold the private lease until its caller either commits accepted drafts, abandons/clears the review, or the gated T028 lifecycle takes ownership; otherwise releasing immediately would prune the empty queue between `parseSmsWithAi` return and later merge. A crashed process has no active tokens; the current owned empty cleanup safely recovers. Tests must prove the absence of phantom queues after failure and that snapshot reads do not invalidate live sessions. Other destructive queue paths (`removeInvalidItems`, `deleteSmsReviewDraftRecordsInWriter`, discard-one/all, expiry and Save cleanup) must either honor a matching active queue/Undo lease or explicitly invalidate its generation **before** deleting that queue; if not yet granted, any later stale completion must still fail by owned queue-ID revalidation. Never silently reuse a replacement queue.

**Later Undo caution:** Current last-row discard destroys the queue; Undo allocates a **fresh** queue ID. Under T028/T029, either keep an owner-scoped empty queue/undo lease during the volatile Undo period or implement a separately verified restoration retaining the **original** canonical session UUID. Until that work is accepted, do **not** activate v2 edited-row discard/Undo semantics that would silently renamespace edited rows. This is an explicit **remaining** T028 cycle, not solved by claiming the early UUID helper is the whole codec.

## 4. SQL-owned complete initial session seam, not a Core parser callback

Reuse the existing [`SmsReviewChunk`](https://github.com/Msg22/Monyvi/blob/508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6/apps/mobile/services/ai-sms-parser-review.ts#L23-L38) type, which is already `Pick<SmsReviewNormalizationInput,"requestKey"|"financialRows"|"mappedTransactions"|"submittedMessages"|"providerResponse">`. Proposed private adapter composition (NormalSQL source owner, not published here):

```ts
// apps/mobile/services/account-review-source-adapter-service.ts
export function createCompleteSmsAccountReviewSession(input: {
  readonly reviewAccountSnapshots: AccountReviewOwnedContext;
  readonly acceptedReviewChunks: readonly SmsReviewChunk[];
  readonly sourceRevision: AccountReviewSession["sourceRevision"];
  readonly namespaceLease: OwnedSmsReviewQueueLease; // private acquired ID
}): Promise<AccountReviewSession>;
```

The complete assembler validates current T010 zero-argument owner snapshot and pinned scope, uses the real SHA-256 provider and already mapped original `categoryId` UUIDs (no new category query), and normalizes each valid v1/v2 accepted chunk with **one shared queue UUID** but its own real model `requestKey`. All distinct source rows must survive, with only accepted same-fingerprint positives admitted once. Combine compatible pending groups by canonical stable evidence keys; namespace provider-local alias references consistently; preserve genuine v1 unknown and good v2 evidence separately. Return a single **initial** `accountReviewSessionSchema.parse` result (`selected:false`, revision `"0"`, pending confirmation, `saveIntent:null`) when no current edited session exists. A current edited session is routed to T027 reducer/CAS when separately ready, not replaced in T014-M.

**No new required public callbacks:** The original public `parseSmsWithAi(candidates,context,onProgress?,abortSignal?,expectedUserId?,requestContext?,requestKey?)` and `ParseSmsContext.reviewAccountSnapshots?` remain additive/optional. Core's parser may internally `import("./account-review-source-adapter-service")` or otherwise invoke the actual SQL module at the original success boundary; that module must **not import Core parser/orchestrator back**, avoiding a cycle. The outer orchestrator is the SQL T014-M writer and builds its final combined result under the **same owner/queue lease**. No parser component/hook queries the DB directly or supplies a public custom session factory.

## 5. Must preserve opted-in original old-server v1 finance before mapping

**Current defect:** [`parseAiResponse` untagged v1 branch](https://github.com/Msg22/Monyvi/blob/508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6/apps/mobile/services/ai-sms-parser-response.ts#L142-L226) validates strict `AiSmsTransactionSchema` (`currency:string`) and retains `transactions` for legacy mapping, but doesn't set the opt-in review carrier. [`reviewChunkFor`](https://github.com/Msg22/Monyvi/blob/508e34f8f3d35afd4fe152a8d023ed4c6fcbbec6/apps/mobile/services/ai-sms-chunk-runner-service.ts#L585-L624) requires `reviewV2FinancialRows` and `reviewV2ProviderResponse !== undefined`, so original successfully mapped v1 finance produces **zero `reviewChunks`**. `resultFromState` then loses the original `messageId/date/categorySystemName` provenance even though financial display may succeed. Do not reverse-map `ParsedSmsTransaction.date` to a forged original date or call the provider again.

**Smallest Core parser fix requiring its own tests-first grant:** in `apps/mobile/services/ai-sms-parser-response.ts`, *only when the original request opted in*, project the already validated **strict-v1 financial row** through the existing canonical `accountReviewSmsFinancialRowSchema.safeParse` **before** `mapAiTransactions`. Preserve exact `messageId,amount,currency,type,counterparty,date,categorySystemName,isAtmWithdrawal,cardLast4,confidenceScore,isTrusted`. Carry it under the **same** existing `ChunkAiResult` review pair or a private canonical `Pick<SmsReviewNormalizationInput,"financialRows"|"providerResponse">` typed branch, with **`providerResponse:null`** for genuine **absent version**, not `undefined` or an invented versioned response. In `reviewChunkFor`, allow the pair `financialRows+providerResponse:null` for opted-in true v1 and match **both** original submitted `messageId` and its fingerprint to the successfully mapped accepted candidate. Use original `work.messages` as `submittedMessages`; don't trust model aliases for source lookup. No opt-in means no review carrier; untrusted/unmapped/nonreviewable rows contribute no review chunk.

**Strict separation:** Keep the existing non-null `AiSmsTransactionSchema` and v1 transport path untouched for non-opt-in calls. V2 nullable financial currency stays in the canonical v2 branch; neither path infers review certainty from a matched account or client preferred currency. A malformed v2 *advisory* with valid financial row keeps the raw evidence with `account_evidence_invalid`/unconfirmed under T014-P; a genuinely invalid financial row or unadmitted source cannot create a positive/negative fingerprint. The normalizer's sourceDate contract admits **real YYYY-MM-DD or exact millisecond Z timestamp**, not arbitrary ISO offsets: if a v1 date is legacy-valid but canonically unrepresentable, preserve original mapped finance and report recoverable unresolved review state; never mutate date/convert timezone to make a fake match. Source original category UUID must remain the mapped accessible category ID, never a generated substitute.

## 6. Required tests-first lease before any source changes

| Gate / proposed **exact** target | Required expected result |
| --- | --- |
| NEW `apps/mobile/__tests__/services/sms-review-namespace-lease.test.ts` (SQL-owned) | Same-owner concurrent acquisition creates **one** owned queue UUID; existing nonempty queue keeps ID across requests/reopen; reject foreign user/multiple queues/noncanonical legacy ID; live lease pins empty queue across `getSmsReviewDraftQueueSnapshot` reads; no-rows/failure/abort safely reaps only the same empty queue, never deletes replaced/populated queue. |
| Bounded `apps/mobile/__tests__/services/sms-review-draft-repository.test.ts` (SQL-owned) | A scoped `database.write` plus `commitScopedPreparedBatch` guards competing acquisitions and exact owner; queue creation failure rolls back without an orphan; concurrent merge/replacement/empty cleanup invalidates stale token; no second queue, duplicate accepted fingerprints, edited-row overwrite or lifecycle leak. |
| Bounded `apps/mobile/__tests__/services/ai-sms-parser-review.test.ts` + `ai-sms-parser-service.test.ts` (Core test owner, separate grant) | Direct opt-in true v1 original finance carried as `SmsReviewChunk` with `providerResponse:null`, original date/source fields intact, full `reviewSession` after SQL lease; mixed v1+v2 in multiple chunks keeps both source identities, no account-first certainty, no extra provider, no phantom negative/terminal outcomes. |
| NEW `apps/mobile/__tests__/services/sms-parser-orchestrator.review-v2.test.ts` (SQL T014-M, separate grant) | Hybrid + local-only assemble **one final** review namespace matching direct AI helper's ID; AI-only interim not published; partial/progress cannot overwrite edited selection; no trusted/AI duplicate fingerprint or extra grouping call; abort/current-owner/generation stale before final publishing. |
| Existing `apps/mobile/__tests__/services/account-review-source-adapter-service.test.ts` (SQL T014-M) | `createCompleteSmsAccountReviewSession` uses zero-argument T010 current-owner scope; one pinned queue ID across source chunks; mapping source `messageId+fingerprint`, valid pending groups, correct category UUID, stable row/evidence IDs under reorder/retry and no stale-edited-row replacement. |
| Later T028/T029 (NOT early helper) codec/queue Undo tests | Legacy v1 encoded bytes/selection overrides unchanged; queue ID retained across last-row volatile Undo or explicitly blocked without identity rewrite; full persisted group revisions/tombstones/CAS and Save remain held until T016 + own Red. |

**Failure/cancellation matrix to preserve:** 401/revoked consent, 403 auth, 413 split/oversized, 429 quota/capacity, 502 fresh retry and 120s live timeout use existing original request identities/completion accounting; never open a namespace on wholly refused/nonfinancial work. If actor changes during T010/hash/queue writer, abort/fail closed, release only own token and never return a false successful session. When an accepted finance batch arrives with stale `queueGeneration` or operation generation, return recoverable stale outcome; no cross-user row, no default account, no replacing edited data. Logs include only stable reason codes, counts and timing—never queue token, account/evidence names, fingerprint, SMS body, amounts or full provider context. No new database columns, server action fields, prompt inputs or second provider invocation.

## 7. Disposition / exact dependency owner handoff

**Recommendation to Root:** freeze the **queue UUID equals canonical local SMS `sessionId`**, guarded by a narrow SQL-owned post-finance, pre-normalization atomic lease. This resolves the *initial identity-capture* cycle for both direct Core parse and later SQL orchestrator without renaming rows. Freeze lease-token ownership through final acceptance, abandoned review and last-row Undo, and approve the exact SQL facade boundary. The first-acceptance-only alternative presently conflicts with direct-parser complete-session semantics. Mark the current `getSnapshot` empty-prune/Undo behavior as known lifecycle guards, not proven Green.

**Minimal prerequisite scope, after separate Root Red/approval only:** `apps/mobile/services/sms-review-draft-repository.ts` (one owned queue create/reuse/empty prune primitive) + optional cohesive NEW `apps/mobile/services/sms-review-namespace-lease-service.ts` (private lease ref counts/epoch) + focused lease/repository tests. If tests prove more existing deletion paths need a guard, Root must grant each bounded path separately; no full T028 codec/Save/UI. **Core** later fixes opt-in v1 original-financial carrier on its parser paths under a separate test/source lease. **SQL T014-M** separately owns `account-review-source-adapter-service.ts`, matcher and final `sms-parser-orchestrator.ts` composition. **SQL/pure T027** owns revision-aware late merge, and **T028/T029** own durable queue/session codec, undo/tombstones and Save-state serialization. The [governing 63d6 main permission](https://github.com/Msg22/Monyvi/blob/63d6e40bf24867aa269ef8a74b79c7bcbb618205/specs/395-shared-account-review/tasks.md#L213-L223) is explicitly **conditional**, not an implementation grant or T016 completion.

**All lanes held:** no Core parser/Edge/provider/source, SQL, queue, index, reducer, test, contracts or UI writes in this report. No checks executed. **PLAN-ONLY — STOP / OWNERSHIP RELEASED / FROZEN pending Root review and separate meaningful Red.**


## T014-M Core test-first queue namespace/complete original-source gate

**Fresh Root ownership clarification:** the earlier SQL-owned *proposal* for an early queue lease is superseded **only for tests-first**: Core now owns two NEW isolated Jest/real SQLite test suites for this exact early identity and complete-session boundary. Core does **not** yet own the corresponding lease/repository primitive, assembler, SMS parser or orchestrator **production** changes; Root must observe true Red and grant each bounded production path separately. NormalSQL retains the pure T014-P/T019 resolver, SQL-owned T014-M existing source-adapter and account matching until transfer; UI owns financial pure source/style. Existing local Root **T007 split** Voice/SMS fixture assertions are unchanged; this Core branch does **not** overwrite the old combined T007 file.

**Published preceding source-only privacy correction:** `465057cb463dcba3e68a7a056d9924a8886f30c2`, parent `3584686dc20e3272edf7242609e5d1462827a44a`, exactly `apps/mobile/services/ai-voice-parser-service.ts`: the semantic warning now has *only* allowed fixed `reasonCode:"voice_semantic_mapping_failed"`, removing redundant `errorClass` and the unexplained category-length clamp. Root's earlier 105/107 mobile control cases PASS and two privacy failures were for the now removed field; no new executable Green claimed.

**Tests-first paths and independently executable boundaries:**
- NEW `apps/mobile/__tests__/services/sms-review-namespace-lease.sqlite.integration.test.ts`: **12** atomic owner/queue/lease tests with *actual* WatermelonDB SQLite adapter and actual `sms-review-draft-repository` (no mock repository/assembler/normalizer/parser), injecting only an authenticated-current-user boundary and native SQLite test database. Concurrent acquire yields **one** real lowercase canonical queue UUID, same ID as `AccountReviewSession.sessionId` and unique per-operation tokens. Existing nonempty queue never renames; snapshots return `null` for empty UI but retain a published pin; abort/no-rows/owner-switch/replacement/duplicate queues fail closed; no temporary/orphan queue after final cancellation; existing real `mergeSmsReviewDrafts` preserves the UUID; last-row discard invalidates the prior generation; a stale completion cannot mutate a replacement.
- NEW `apps/mobile/__tests__/services/sms-review-complete-session.sqlite.integration.test.ts`: **15** original-source tests on the **real** parser, actual normalizer/assembler and same SQLite queue (not mocked), with mock **only** Edge transport, parser-mode flags and auth/consent ports. Test two chunks with duplicate **model-only aliases** but distinct exact SMS IDs/fingerprints, reorder-stable original row IDs and shared canonical queue namespace; accepted duplicate fingerprint appears once and conflicting attempts fail closed. Genuine untagged original **v1** preserves `messageId,date,categorySystemName,currency,isTrusted,cardLast4` in `SmsReviewChunk.financialRows` before mapping, with `providerResponse:null` (not `undefined`) and `legacy_unknown` review currency; v2 `currency:null` retains unconfirmed account review despite a display-only EGP currency. A direct parser opt-in returns a full schema session, no public callback, no UUID coercion of `scanSessionId`, no invented source ID/negative; no-opt-in emits unchanged financial-only result. Hybrid/trusted/local outer parsing produces one final deduped owner/queue session, without a second grouping call or replacing already selected rows. Existing transport response accounting remains original.
- The new SQLite tests intentionally import the **not-yet-implemented** `@/services/sms-review-namespace-lease-service` and SQL-owned `@/services/account-review-source-adapter-service`. This creates genuine missing-module Red under integrated Root until the separately granted source lands, **not** a fake SUT, `jest.mock` of a source module, a copied wire schema or an assumed success. Future tests may need limited auth/SQLite setup adaptation after Root's actual Red, never weakening assertions. Both new files are below 900 raw lines; strict formatter/function limits remain Root verification.

**Frozen private lease helper ABI (types derived from canonical output):**
```ts
// Future apps/mobile/services/sms-review-namespace-lease-service.ts
// OwnedSmsReviewQueueLease derives sessionId from AccountReviewSession["sessionId"].
type OwnedSmsReviewQueueLease = Readonly<{
  expectedUserId: AccountReviewSession["ownerId"];
  queueId: string; // the existing/current-owner SmsReviewQueue.id, canonical UUID
  sessionId: AccountReviewSession["sessionId"]; // exactly queueId
  leaseToken: string; // per-operation only, never provider/log/external API
  queueGeneration: string; // private owner/queue epoch, NOT a schema column
}>;
acquireOwnedSmsReviewQueueNamespace(input: {
  readonly expectedUserId: AccountReviewSession["ownerId"];
  readonly signal?: AbortSignal;
}): Promise<OwnedSmsReviewQueueLease>;
assertOwnedSmsReviewQueueNamespaceCurrent(input: {
  readonly lease: OwnedSmsReviewQueueLease;
  readonly signal?: AbortSignal;
  readonly expectedReviewOperationGeneration?: AccountReviewSession["operationGeneration"];
}): Promise<void>;
releaseOwnedSmsReviewQueueNamespace(input: {
  readonly lease: OwnedSmsReviewQueueLease;
  readonly disposition: "no_accepted_rows" | "cancelled" | "published" | "committed";
}): Promise<void>;
```

**Retention, bounded tokens, and final release authority:** allocate a **single** owner/queue **published pin**, with separately bounded operation-level in-flight lease tokens. `release(..., "published")` ends the returning parser operation's active work but **must not prune/unpin** its empty queue: keep the owner/queue pin through UI publication and the later existing draft-commit transaction, explicit abandon/clear/reset, actor change or cancellation. Several concurrent publications share **one queue pin**, not an unbounded list of orphan promises/tokens. The approved T014-M caller must retain enough private pin lineage to call `release(..., "committed")` **only after** the existing `mergeSmsReviewDrafts` commits the accepted draft(s) under the exact queue ID. A failed/skipped merge does not falsely mark committed; a cancelled/abandoned review releases only its own operation and, if no other active/published work, conditionally deletes the same empty queue under the existing owner-scoped SQLite writer. Existing last-item discard/clear/reset/expiry/logout paths must either notify/invalidate the pin's `queueGeneration` or fail stale owner/queue assertions before any new row publication. Snapshot reads do not physically prune a pinned empty queue; after process restart the no-token empty queue can be pruned by current cleanup. Existing **nonempty queue metadata updates** do not renamespace any edited row. Undo of final edited row remains gated T028/T029; no new DB column, UI, codec, Save or mockup.

**Exact SQL/assembler integration boundary:** `SmsReviewChunk = Pick<SmsReviewNormalizationInput,"requestKey"|"financialRows"|"mappedTransactions"|"submittedMessages"|"providerResponse">`; `createCompleteSmsAccountReviewSession({reviewAccountSnapshots,acceptedReviewChunks,sourceRevision,namespaceLease}):Promise<AccountReviewSession>` remains SQL-owned until explicitly leased. It validates actor/lease after awaits and before publishing, keeps distinct originals and source spans' `sourceRef=messageId` and `smsFingerprint` unchanged, namespaces only model aliases per accepted chunk, uses already trusted parsed `categoryId` and original date, and invokes the real T014-P normalizer/identity hashing. The same queue UUID applies to direct and outer hybrid/local; intermediate AI-only progress may not overwrite outer final session, and edited-row late merge awaits T027. No required public parser callback or second provider/grouping request. Do not use `scanSessionId`, numeric UI revision, requestKey or model alias as a canonical local session UUID.

**Gate:** Root reruns new lease+assembler tests with its repaired real SQLite runtime (not fake in-memory queue) and current integrated SQL adapter; record exact creation/behavior Red and any truly missing dependent module. Run formatter <900 files/<50 functions, strict TypeScript, owner/privacy checks and existing parser v1/v2/T007 tests, without provider/native/emulator/deploy. Only after Root acknowledges Red may Core receive a new bounded namespace/repository/original-v1 carrier/assembler production grant. This turn does **not** write those source files. **TESTS FIRST; STOP / RELEASE / FROZEN.**

## Core successor tests-only harness correction after Root pre-assertion Red

**Governed checkpoint:** `85ce6167304c0f5a7b05e222469794ced02872d9`
(original 27 authored cases are preserved, not declared passing). This
tests-only successor checkpoint repairs the Babel/Jest initialization failure
by resolving WatermelonDB `Q` **inside** the current-user fixture factory.
It registers the actual `Account`, `BankDetails`,
`AccountSmsSender`, `Profile`, and accessible `Category` model classes
with both real SQLite adapters. A shared fixture persists the same two owned
accounts, current-owner profile/preferred currency and system Shopping
category as the synthetic pinned T010 captured context. It deliberately
does **not** manufacture card/sender child evidence or mock a successful
T010 read, normalizer, namespace lease, parser or final assembler.
A discriminated `source === "SMS"` check guards access to
`transaction.smsFingerprint`, and the chunk-row mapping callback has the
canonical `AccountReviewSession` type. Future source missing-module
errors remain genuine creation Red.

**Additional observable cases (three):** one performs 24 serialized
acquire/publish cycles and verifies the **same single** physical owned queue,
retirement of completed operation authority, a live current lease and
conditional final cleanup. It measures public lifecycle behavior, **not**
private heap/Map cardinality; no debug API is invented. One uses an actual
HTTP 429 `rolling_limit` `Response` error and asserts original
`capacity_limited`, nonretryable status, `availableAt`, absence of
durable negatives/terminal fingerprints and **no** review session or queue.
The third uses real SQLite `mergeSmsReviewDrafts`,
`updateSmsReviewDraftItem` and `updateSmsReviewDraftSelection` to preserve
a user's edited amount/payload and selected state across a hybrid
trusted-plus-AI parse; progress must never surface an interim AI-only
`reviewSession`, and the final output retains the exact owned queue UUID.

**Explicit gate:** these protect only **initial** UUID lease, direct/final
SMS session assembly, and original existing-draft non-mutation. The
stateful T027 merge/reducer rule for *late* AI rows versus in-memory edited
group assignment/selection/revisions is **not proven** or mocked here.
Full queue codec, last-row Undo identity, Save and UI remain T028/T029/T031
gated. No SQL/schema/provider/orchestrator source was modified. Root must
run real SQLite creation/type/formatter gates and distinguish genuine
missing-source Red from harness failures **before** any production grant.
