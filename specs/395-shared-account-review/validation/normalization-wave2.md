# #395 T014-M — Mobile source-adapter and stateful-arrival plan (PLAN ONLY)

**Lease:**
`codex/395-normalization-worker@5be676ddf9a8bb7b08a23cf2eedb4bb2205497b8`. This
checkpoint writes **only this new report**. Pure T014-P source `5be676dd`
remains frozen for Core's independent read-only review and Root's pending
type/lint/format checks. T004 authority:
`specs/395-shared-account-review/{contracts/parser-evidence.md,contracts/review-commands.md,contracts/wire-shapes.md,data-model.md,tasks.md}@7e27eb55c642dccef44f4b977a8712ab320ecd18`;
trusted governance `main@7838df64`, worker workflow `8a96f74c`. No
mobile/parser/SQL/schema/contracts/test source authority follows from this plan.

## Actual source inventory (read only)

- **T014-P pure API (published):**
  `normalizeAccountReviewParserResult(input: AccountReviewNormalizationInput): Promise<AccountReviewSession>`
  in `packages/logic/src/account-review/normalization.ts`. Discriminated
  `VoiceReviewNormalizationInput` / `SmsReviewNormalizationInput` includes fixed
  owner/session/sourceRevision/logical requestKey, canonical financial response
  rows, already mapped parsed transactions, owned snapshot, category UUID map,
  original Voice transcript or submitted SMS ID/body/sender/fingerprint,
  type-only injected `Sha256Provider`. `identity.ts` produces independent group
  and multiplicity-safe row IDs. Invalid v2 advisory preserves otherwise valid
  finance as unconfirmed/unresolved; no defaults, confirmation, selection or
  data access.
- **T010 lookup gap:** the intended
  `apps/mobile/services/account-review-read-model-service.ts` /
  `account-review-read-model-service.test.ts` **was not retrievable** at T014-P
  `5be676dd`, current Core `a5544b26`, integration `944cbafc` or incoming main
  `ac11a03b`. Do not assume it is merged or infer its published ABI. Before
  T014-M implementation, Root must provide its current reviewed T010
  source/commit and its `loadAccountReviewAccountSnapshots(expectedUserId)`
  callable signature; prefer its single scoped batch of active own accounts +
  bank details + sender children, `isDefault` locally, privacy-filtered
  `providerContext`, current preferred currency. Never reconstruct T010 by extra
  N+1 queries or pass balances/full card identifiers to Edge.
- **Current Voice:** `ai-voice-parser-service.ts::parseVoiceWithAi` returns
  `AiVoiceParserSuccess.transactions/transcript/originalTranscript/detectedLanguage`;
  legacy `matchedAccount.currency → explicit → preferred` fallback at existing
  lines 479–496 remains **v1-only**.
  `voice-flow-submission.ts::createRequestKey` uses
  `voiceRequestKeySchema.parse(randomUUID())`; network retry retains the logical
  recording request. Core exclusively owns v2 parser/transport integration
  **T012**, not this lane.
- **Current AI SMS:** `ai-sms-parser-service.ts::parseSmsWithAi` feeds
  `ai-sms-chunk-runner-service.ts::{runChunk,mapAiTransactions,applyChunkResolution}`,
  with original `messageId` → `SmsCandidate.message.id` and `smsFingerprint`
  mapping. Existing `SmsAiRequestContext` scan id/kind/start and per-chunk
  request keys are **transport identities**, never persisted account/row/group
  keys. `sms-parser-orchestrator.ts::parseSmsWithOrchestrator` drives AI, local
  and hybrid, returns `SmsParserOrchestratorResult`, and deduplicates existing
  SMS financial items by `getParsedSmsTransactionKey` in
  `mergeDistinctTransactions`; do not weaken current
  fingerprint/completion/fresh-retry/refusal logic. Core owns T013
  parser/chunk/provider files and their exact typed v2 evidence output.
- **Current matcher:**
  `sms-account-matcher.ts::{matchAccountCore,matchTransaction,matchTransactionsBatched,matchAllTransactions,fetchAccountsWithDetails}`.
  Old `matchAccountCore` has card/sender, institution, then default fallback;
  `matchVoiceTransaction` accepts model accountId or default. These are existing
  **legacy/live/headless** policies; review v2 must not reuse the fallback to
  manufacture currency/choice.
- **Current queue:**
  `sms-review-draft-repository.ts::{getSmsReviewDraftQueueSnapshot,mergeSmsReviewDrafts}`
  owns current user/queue/fingerprint checks and stored `selectionOverride`;
  `sms-review-draft-command-service.ts` serializes operations per owner/draft
  ID. The hook `useSmsReviewDraftQueue` guards asynchronous current
  owner/refetch generation and preserves unmodified item identities. Existing
  `sms-local-parser-adapter.ts::createLocalParserResult` and
  `sms-parser-orchestrator.ts::mapTrustedTransaction` carry exact submitted
  sender/body/fingerprint and parser hard reasons. No existing v2 review
  codec/atomic group command is assumed to exist.

## Proposed T014-M adapter APIs (names and types to freeze after Root Red)

1. **`apps/mobile/services/account-review-source-adapter-service.ts`:**
   `createVoiceAccountReviewSession(input: VoiceReviewNormalizationInput): Promise<AccountReviewSession>`
   and
   `createSmsAccountReviewSession(input: SmsReviewNormalizationInput): Promise<AccountReviewSession>`.
   Thin mobile composition calls the already published pure normalizer **once
   after** the original Voice success or admitted SMS scan. Inputs reference
   `@monyvi/logic`'s canonical exported types and actual T010 read model; do not
   copy response DTO, parse a second model response or fabricate financial
   categories. Return a plain `accountReviewSessionSchema`-accepted value
   alongside the existing financial result through Core's **T012/T013-owned
   typed success field**, not through searching raw provider payloads.
2. **Snapshot/hash seam:** `createAccountReviewHashProvider(): Sha256Provider`
   from the existing platform-approved digest implementation (verify actual
   Expo/crypto service export before wiring). Inject digest into the pure
   function; do not add `node:crypto` to mobile or log digest preimages.
   `loadAccountReviewAccountSnapshots` from **T010** supplies current owner,
   active-only owned accounts including child sender/card metadata and captured
   preferred currency; canonical `categoryIdsBySystemName` must derive from
   current owned category records (real category UUIDs, no fabricated category
   ID).
3. **Trustworthy local path:**
   `adaptTrustedSmsAccountReviewEvidence(input: {transactions: readonly ParsedSmsTransaction[]; admittedCandidates: readonly SmsCandidate[]; ownedSnapshots: AccountReviewOwnedContext; logicalScanId: string}): SmsReviewNormalizationInput`
   is **proposed**, not an existing API. Only synthesize strict canonical v2
   row/evidence for actual deterministic trusted-pattern sender/card/source
   evidence validated against the admitted original message and current owned
   snapshots. Otherwise pass `providerResponse:null` and obtain conservative
   `legacy_unknown`/unresolved without pretending proven `omitted`. Ordinary SMS
   stays BANK/DIGITAL_WALLET; ATM Cash is a _separate_ destination with
   explicit/eligible evidence and T019 resolver authority. Do not change
   original `smsFingerprint`, body, original sender, category or financial
   dedup; never trigger a new AI call to group.
4. **Review-only matcher branch:** proposed
   `getAccountReviewV2MatchCandidates(input: {row: AccountReviewRow; owned: AccountReviewOwnedContext}): readonly AccountReviewAccountContext[]`
   inside `sms-account-matcher.ts` is **evidence-filtering only**, not an
   account acceptance/default resolver. It must require confirmed row currency +
   eligible source type + explicit verified owner/card/provider/sender;
   foreign/deleted account IDs and stale snapshot IDs fail. Future T019
   `getAccountReviewAccountCandidates`/`resolveAccountReviewRow` determine
   actual choice (including default only for _absent_ evidence). Keep
   `matchAccountCore`/legacy `matchTransaction` intact for live/headless/v1; v2
   never applies account-first currency priority or ambiguous sender-to-default
   fallback.
5. **Optional initial projection/arrival hook:** propose
   `stageAccountReviewArrival(input: {current: AccountReviewSession|null; incoming: AccountReviewSession; expectedOwnerId:string; expectedSessionId:string; expectedOperationGeneration:string}): {mode:"initial"|"delegate_to_reducer"|"stale"; incoming:AccountReviewSession|null}`
   as a **platform guard**, not an account-choice algorithm. No asynchronous
   callback may replace current state if owner/session/sourceRevision or
   operation generation changed; reset/cancel on logout, source or user switch.
   For an existing edited session, stage then delegate to T027's immutable
   merge/reducer API rather than assigning `current=incoming`. This proposed
   shape must be reviewed with the canonical reducer result contract; it does
   not authorize implementation of `reduceAccountReviewCommand` in mobile.

## Exact ownership and sequencing (new grants only)

- **Before code:** Root confirms published T010 ABI, awaits Core T012 Voice and
  T013 SMS v2 typed transport preservation, accepts this API plan, grants
  disjoint T014-M tests-only Red. No direct edits to
  `ai-voice-parser-service.ts`, `ai-sms-parser-service.ts`,
  `ai-sms-chunk-runner-service.ts`, provider/Edge code or index; those are
  Core's exclusive lanes. T015 fixture lane is separate.
- **T014-M proposed future source files:** new
  `apps/mobile/services/account-review-source-adapter-service.ts`; bounded
  `apps/mobile/services/sms-account-matcher.ts` review-only branch; bounded
  `apps/mobile/services/sms-parser-orchestrator.ts` _only after T013 releases
  its integration seam_, plus a cohesive adapter helper if its formatted file
  would exceed 900 lines. No current mutation of `sms-review-draft-*.` New queue
  codec/writers and authorizing immutable group/review command application
  remain US2 T027–T031 ownership.
- **Exact proposed tests-first paths:** new
  `apps/mobile/__tests__/services/account-review-source-adapter-service.test.ts`
  (Voice/SMS one-call emission/typed normalized field, v1/invalid advisory
  financial retention, category owner/hash injection); new
  `apps/mobile/__tests__/services/sms-account-matcher.review-v2.test.ts` (v2 no
  default/account-first currency, source-eligible sender/card/candidate,
  legacy/live unchanged); new
  `apps/mobile/__tests__/services/sms-account-review-local-evidence.test.ts`
  (real admitted trusted/local deterministic provenance, null unknown, no model
  invocation); bounded existing
  `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts` or discovered
  current equivalent (hybrid dedup/chunk composition, fingerprint/completion).
  Do not invent nonexistent test target if current suite naming differs.
  Stateful arrival tests proposed in
  `apps/mobile/__tests__/services/account-review-late-arrival.test.ts`,
  coordinated **after T027** supplies immutable reducer/merge API.
- **T027 / later ownership:**
  `packages/logic/src/account-review/{reducer.ts,identity.ts}` owns canonical,
  pure conflict-aware resolution/revision/confirmation/tombstone transitions;
  T028–T031 own queue codec, atomic writer, local restoration and serialized
  group/row command persistence. T014-M owns only I/O provenance, initial
  session construction, owner-generation gates and invocation of that later
  reducer, never independently edits selected/revision/override/group
  confirmation state. Hook/UI renderers consume state but do not decide matches.

## Incremental/late source merge invariant (requires T027, not an early T014-M replacement)

- Immutable batch of accepted source IDs/fingerprints with per-row stable
  `rowId` and `evidenceKey` determines _candidate_ arrival; late new rows
  unselected and no confirmation by default. Same
  owner/source/session/generation only. Preserve prior `rowId`, `revision`,
  `hasUserAccountOverride`, `hasUserCurrencyOverride`, user-selected
  `assignment`, `currency`, `selected`, `saveIntent`, tombstone
  `removedEvidenceKeys`, group `revision` and `confirmedIdentityRevision`, plus
  durable per-SMS `selectionOverride`; never replace a current edited row with
  fresh `normalizeAccountReviewParserResult` output.
- Equivalent late group member may inherit _only_ prior confirmed identity if
  exact current canonical `evidenceKey` and owner/session/group identity
  revision match and tombstone is absent; must remain **unselected**.
  Incompatible card/provider/currency/type or removed evidence remains
  pending/unresolved; never resurrect tombstones or implicitly confirm/Save.
  Existing edit wins over a delayed original input even if chunk response looks
  valid.
- **Physically indistinguishable Voice twins:** occurrence multiset yields
  stable ID **set** across reorder/rechunk, not proof of which twin received an
  edit. If a later partial chunk cannot correlate an edited twin to prior IDs,
  mark recoverable ambiguous identity and preserve existing source
  rows/selections unchanged; do not choose by arrival ordinal, rebuild row IDs,
  silently rebind saved choices or drop one twin.
- T027 owns stale CAS/reducer feedback, revision increments, explicit
  confirm/select/remove/Undo, and proper user-visible recovery; T014-M must not
  implement its own second business rules. Queue mutation only after rechecking
  `expectedUserId`, queue ID, draft ID/fingerprint, current revisions and
  operation generation under the existing per-owner serialized writer; no
  original-message changes on late retry.

## Compatibility, privacy, risk and external movement

- **Legacy:** Voice v1/old-server output and SMS v1/AI/local/hybrid safeguards
  retain original selection/confirm/headless and parsed transaction behavior.
  Malformed _advisory_ may not cause a second provider request or a durable SMS
  negative; malformed _financial_ still follows existing parser retry/refusal
  rules. Do not log transaction amount, SMS text, sender, voice transcript, raw
  provider JSON, account name/card, identity hash preimage, fingerprint or other
  PII; diagnostics contain only reason codes/counts.
- **Primary risks to test:** unmerged/unverified T010 read-model and unapproved
  actual T012/T013 typed result ABI; potential 900-line
  `sms-parser-orchestrator.ts` formatting split; current `mergeSmsReviewDrafts`
  baseline refresh can update untouched drafts unless future v2 writer is gated;
  `getParsedSmsTransactionKey` dedup must remain unchanged; original Voice
  account-first currency and legacy matcher fallback must never leak into v2; no
  local SHA import in mobile.
- **New main intake:** origin/main at `ac11a03b7bf9f75b842a7df2639f1c885e2c386b`
  merged #387 historical metals; new
  `089_historical_metal_rate_request_limits.sql` consumes 089, with 088 unused.
  Future #395 migration slot proposal is **090 review batch / 091 account
  default** (recheck after future root CLI allocation), **not** 088/089. Root
  will separately correct frozen number references before any SQL grant. No
  migration was created, changed, applied or deployed. #393 form branch remains
  separately open at `0bb9`; do not assume its account-form behavior merged.
  Preserve database-local version 30/cache and future generated `db:sync-local`
  output.
- **Stop condition:** plan only, no tests or provider/device/commands executed.
  Root independently accepts/red-tests before source grant. T014-P source and
  this wave-2 plan freeze at publication; T011/T015 foundation 155-pass and
  TypeScript/Deno/i18n Green reported by Root do not prove T014-M or override
  independent Core review.
