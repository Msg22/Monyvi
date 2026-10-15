# #395 T046 — pure review financial payload implementation checkpoint

**Owner:** successor UI/financial pure lane; sole writer on `codex/395-ui-worker`.
**Source authority:** trusted `9a8987a8087db886d9b9244182ef8e8128016621`, frozen `contracts/financial-save.md` and `contracts/wire-shapes.md` (T004); source order and existing financial-action foundation at branch starting `2d306e34e44c87fadc8d3b903e133bb50e33760a`.
**Ownership:** T046 PURE only; account-review resolution remains NormalSQL, namespace/parser and Voice diagnostic privacy remain Core. No code owner overlap, runtime registry activation, app/service/SQL/provider/sync/UI/PR mutation or manual DB/provider test authorized.

## Preserved Root-authored tests (exact GitHub blob handoff)

Created in `packages/logic/src/financial-actions/__tests__`:

- `review-batch-save-fixtures.ts`: fetched exact `6d8e69a4438ce5e2d34ac915441a2e6d73a044ab`, content preserved.
- `review-batch-save.test.ts`: fetched `582e6047599ec9e654ccda5c6703a93b926adce0`; one mechanical compile correction: undefined `danglingRecord` used for the existing mismatched-record negative case changed to its real `mismatchedRecord` local. Removed six provably unused imports (`REVIEW_ACTION_ID`, `REVIEW_EXPENSE_ROW_ID`, `REVIEW_INCOME_ROW_ID`, `REVIEW_OCCURRED_AT`, `REVIEW_USER_ID`, `SMS_EXPENSE_FINGERPRINT`). **No assertions, inputs or cases weakened**.
- `review-batch-save-validation.test.ts`: fetched exact `5898f56474f89c426fc59be7514a8762627cd08d`, content preserved.

Root's earlier T042 coherent creation Red was **only missing `../review-batch-save`**: 0 behavioral assertions executed then. Root separately reported **172 existing financial tests PASS across seven suites** before this source. Neither result proves this T046 candidate Green.

## New closed pure implementation and exact APIs

`packages/logic/src/financial-actions/review-batch-save.ts` exports:

- `reviewBatchSavePayloadSchema` — strict Zod transport schema with additional deterministic cross-record/ref/effect invariants, not copied DTO unions.
- `validateReviewBatchSavePayload(value: unknown): ReviewBatchSavePayload` — canonical inferred output, throws on invalid payload.
- `createReviewFinancialActionDefinitions(invalidPayloadCode: string): readonly FinancialActionDefinition[]` — **explicit opt-in** registry definition for EXACT tuple `domain:"transactions"`, `kind:"review_batch_save"`, `payloadVersion:"review.batch-save/v1"` with `schemaVersion:"review.batch-save/v1"` and `operationCode:"review.batch-save"`. Converts validation failures to the caller's supplied reason. Optional `cashDefaultSnapshot` is omitted rather than serialized as `undefined` in the registry's canonical JSON contract.
- `ReviewBatchSavePayload` inferred from `reviewBatchSaveWireSchema` (type-only export, not a handwritten parallel DTO).

New cohesive dependencies:

- `review-batch-save-shapes.ts`: lowercase UUIDs, strict real UTC millisecond timestamps and calendar dates, canonical revision via existing `parseCanonicalUnsignedIntegerString`, bounded signed ±2^63−1 minor-unit strings (including `"0"`, rejecting `"-0"`), currency membership from existing `SUPPORTED_CURRENCIES`, transaction type from existing `VALID_TYPES`, generated AccountType type-only typing, closed root/selected/group/guard/effect/children/account/transaction/transfer/SMS bookkeeping and optional Cash snapshot. Only finite positive financial row minor units. Existing account/transaction/transfer persisted field vocabulary retained; no AI raw evidence, balances, state snapshots or provider context copied into cloud payload.
- `review-batch-save-integrity.ts`: ASCII sorted/unique domain mutations by `entity:id`, create guards by `entity:id`, domain refs by UUID; equality of all create mutation ID/guards/domain refs, no repeated entity ID; exactly one selectedSourceRef per financial create and exact transaction/transfer source fingerprint parity, voice null fingerprint and SMS non-null distinct across both entities; no unused new account, strict bank-only single details child, no child of existing/Cash, normalized unique sender aliases; Voice bookkeeping empty, SMS selected deletion count and distinct local draft/queue refs, confirmed-group referenced account involved.
- `review-batch-save-effects.ts`: derives exact selected signed account deltas via `bigint`, one posted effect per affected account, zero effect retained, per-account currency matching, overflow/cross-effect duplicate rejection, strict ATM from/to endpoints and no silent FX conversion, new-account zero opening / no target / Bank-Wallet never default; new Voice CASH permitted only with exact `cashDefaultSnapshot`, first-active default parity; SMS newly created Cash restricted to selected ATM destination. Every created financial row additionally obeys the existing `MAX_TRANSACTION_AMOUNT` ceiling, with `getCurrencyPrecision` and typed currency to convert the inclusive major-unit bound to a bigint minor-unit limit; no floating-point conversion or additional rounding. No Number/money-float accumulation or fabricated opening effect.
- `review-batch-save-envelope.ts`: purpose-built pure check after explicit registry payload validation; reuses inferred canonical payload type; verifies new review root `domainReferenceId` equals **first sorted created financial record UUID**, accountGuard IDs exactly match sorted effect-account IDs and all financially referenced accounts, missing/additional guards fail, new-account expectedRevision `"0"` + required `expectedAbsent` account guard, revision exhaustion disallowed.
- **One minimal extension** to existing `action-contracts.ts` `canonicalizeFinancialActionEnvelope`: narrow `else if` for exact `transactions/review_batch_save/review.batch-save/v1` invoking `assertReviewBatchSaveEnvelope`. Previous `account.balance-effects/v1` branch (including its nonzero-only legacy validator), final fallback for other guarded tuples, metals, envelope shape/root serializer and default registry are unchanged. There is **no wildcard version match**, v1 relaxation or implicit new tuple registration. This source extension was separately approved by Root after identifying the existing `else if (accountGuards.length !== 0)` blocker.

### Pure proof boundary and deliberately unclaimed behavior

The pure payload validator proves *shape and payload-internal correspondence only*. It cannot prove current owner, category access/active state, stored account currency/default snapshots, existing financial revisions, uniqueness/card across database rows, external SMS fingerprint duplicates, absent IDs in local/hosted DB, retry/idempotency/replay semantics, exact local cleanup linkage or actual revision increments. Those **MUST** be revalidated under the future authenticated local writer and SQL/CAS transaction. A recorded Cash snapshot is checked for structural/current-intent consistency, not authenticated *current-state equality*. New group account IDs must still be checked against selected/referenced owned drafts in the actual T043/T014/SQL lane.

Only canonical already-posted integer minor units are accepted here; converting entered decimal amounts with the existing Decimal half-even/precision utilities happens earlier in the authorized writer. This module does not infer an AI opening balance, perform rounding, materialize a DTO from provider text, run a database query, touch runtime `index.ts`, mutate `DEFAULT_FINANCIAL_ACTION_REGISTRY`, or use a live provider. Existing old-tuple zero-effect rejection remains unchanged; new zero-net permitted strictly under the new explicit tuple and still **requires** an account guard. Stored revision r→r+1, canonical postimage and once-only zero compensation are *execution duties* of 088/persistence, not accomplished by this helper.

**Important integration dependency:** the strict registered envelope check only runs when a caller explicitly constructs a registry using `createReviewFinancialActionDefinitions`. Until Root integrates the new tuple into the authenticated runtime registration after SQL/server readiness, attempting new review saves through the global default registry correctly remains unsupported.

## Current check receipt and Root checkpoint

This Normal ChatGPT worker published source/tests/docs through GitHub connector and performed remote source/diff review. It did **not** run npm/Jest, strict TypeScript, ESLint, Prettier, local SQL/pgTAP, a full-save runtime, provider call, emulator, hosted DB, or migration. **T046 actual compile/behavior Green remains unverified.** In particular, Root must:
1. Integrate the exact UI T046 source/test commit into its coherent local worktree, run the two new test files and existing seven legacy financial suites; inspect precise failing assertions and strict TypeScript/lint/format.
2. Check new registry serialization and the helper's narrow branch against the frozen T042 zero-net/new-bank/ATM/first-Cash/negative refs/guards/currency/fingerprint/legacy vectors, including attempt to use the unregistered tuple on default registry.
3. Independently inspect schema/export visibility, circular runtime import between contract helper and canonical revision parser, and ensure the new envelope guard branch cannot weaken old financial roots.
4. Treat new runtime/SQL/sync/writer/effect revision and recovery acceptance as **separate future owners and gates**. No unsupported server registration or local green should be inferred from these pure source files.

**Ownership release:** One complete **T046 PURE source checkpoint**, pending Root tests/independent review. **FROZEN**. No general project acceptance, Save screen success, registration deployment, or background work claimed.


---

## Follow-up lint/style checkpoint — Root consolidated batch (2026-10-15)

**Root's actual coherent evidence (reported by Root, not rerun in this chat):** integrated new payload+resolver and prior financial suites **19/19 suites, 462/462 tests PASS**; strict logic `tsc` **0 errors**. The new T042/T046 cases include **45 new payload behavioral assertions/cases** alongside **172 legacy financial cases**; the existing canonical v1 behavior remains untouched. These results establish Root's passing local test batch on the pre-style source, **not** global/runtime registration, SQL/CAS, deployed behavior or final independent payload acceptance.

**Source-only formatting/lint repairs:**

- `review-batch-save-shapes.ts`: added an explicit generic mutation schema return type, using the repository's strict Zod object convention `z.ZodObject<..., z.core.$strict>` to preserve closed/discriminated-union inference; no validator/schema logic changed.
- `review-batch-save.ts`: consolidated the value and type import from the same shapes module and changed the function-array type from nested `readonly (...)[]` to `ReadonlyArray<...>`; the unused `z` import was already absent at the lease's starting head, so no removal was necessary. Schema checks and tuple registration are unchanged.
- `ai-voice-review-privacy.test.ts`: reordered constructor before explicit readonly members in the platform `Category` test fixture and changed `allDiagnostics`' non-simple nested readonly-array return type to `ReadonlyArray<ReadonlyArray<unknown>>`. **All three test cases, logger privacy allowlist, and assertions are untouched**. Core retains sole ownership of the separate production diagnostic `errorClass`/reason-code corrections.

**Change controls:** No T046 test fixture/assertion edited in this follow-up. No changes to normalizer, source adapter, Core parser, provider, SQL, local Save, runtime services, queues, UI routes, `index.ts`, or `DEFAULT_FINANCIAL_ACTION_REGISTRY`. No new version activation, metadata provider call or database write. Pure guard and ledger effects unchanged.

**Verification boundary:** This worker used the GitHub connector to review and update the exact authorized files. **No new local Jest/TypeScript/ESLint/Prettier/AST run** was performed here. Root must reformat, inspect function lengths (<50) and type/lint the finalized strict Zod annotation, then independently review the exact source and rerun the coherent batch before accepting. The reported **19 suites/462 PASS, strict logic tsc0** are Root's externally executed pre-style baseline, not an independent post-style Green receipt.

**Handoff:** publish exact remote SHA and freeze all UI/T046 writes. Source remains a candidate until Root's independent payload review; Core owns Voice production logging and NormalSQL owns resolution.

---

## T046 pure A–G correction checkpoint — independent Red verified by Root (2026-10-15)

**Evidence BEFORE this correction:** Root actually ran the 591e945a regression test checkpoint against pinned 9732edd4 pre-fix production: 10 financial suites, 240 cases, 226 passed / 14 meaningful assertion failures, zero loading errors. All 217 original financial cases passed. The 14 failures cover genuine A queue, B first-import initialization, C per-row maximum, D local bookkeeping ID collision, E missing new-account confirmation, F configured cutoff, and G new Cash source-role leaks. This is **Root-provided pre-fix Red**, not a post-fix Green claim.

**Minimal corrected pure APIs and dependencies:**

- **B**: `canonical-unsigned-revision.ts` is the single dependency-free primitive for the original branded `CanonicalUnsignedIntegerString`, max revision 9223372036854775807, grammar and `financial_action_invalid_revision` error. `action-contracts.ts` imports and re-exports `parseCanonicalUnsignedIntegerString`, the type and maximum unchanged; `review-batch-save-shapes.ts` imports directly from the primitive. No schema→canonicalizer cycle or duplicated grammar.
- **A/D/E**: `review-batch-save-integrity.ts` now accepts distinct drafts within one queue iff every SMS bookkeeping `queueId` equals the explicit `sessionId`; requires unique sorted draft IDs, rejects local draft/queue ID aliases to each other or `domainRecordRefs`, and requires a referenced confirmed account group for every new account except a selected SMS ATM Cash destination. Existing account-only no-group and reused-account group controls remain valid; no stored group ownership assertion is fabricated.
- **G**: `validateSourceAndChildren` now examines **every** financial use of newly created CASH in SMS; rejects ordinary SMS transaction source accounts and ATM source endpoints while preserving Voice Cash and selected ATM Cash destinations. This is pure newly-created account metadata only. Existing stored account types still require the authorized owner-scoped runtime/SQL validation.
- **C**: retained preexisting candidate implementation using the shared `MAX_TRANSACTION_AMOUNT` with generated currency precision and exact `bigint` per transaction/transfer; canonical signed minor-unit bounds remain symmetric ±9223372036854775807; net-zero cannot conceal two oversized rows.
- **F**: `validateReviewBatchSavePayload(value, validationInput?)` is backward compatible and optionally accepts existing `FinancialActionValidationInput` with `latestAllowedCalendarDate`; the exact review definition forwards that input. If present, requires a real canonical calendar date and rejects every transaction or ATM transfer later than it; no `Date.now` or device time dependency. No expansion of other registry types or runtime activation.
- **Fixture accuracy:** original handed-off two-SMS new-Bank fixture and singleton ATM fixture now use `sessionId` equal to their actual queue IDs. Both saved SMS rows share the one true queue, retaining distinct draft IDs. The `SMS_QUEUE_ID_2` constant remains only for explicit mixed-queue negatives; the original 217 financial cases and all regression assertions remain in place. Regression builders now narrow the actual `ReviewMutation.entity` before accessing financial fields; the two-row C maximum equality expectation remains exact. The D queue/domain alias regression also uses matching session/queue IDs to isolate alias validation from the A mixed-queue guard.

**Release boundary:** The new parser primitive and financial-action modules are strictly pure; no default registry activation, `index.ts` barrel, SQL, application Save, sync, account database, provider, queue service, UI or runtime changes. All existing old-v1 nonzero validation, financial envelope serialization, hashing, signed bounds and canonical revision error semantics remain in place.

**What is NOT verified here:** This Normal ChatGPT worker authored GitHub blobs and one guarded GitData tree/commit. It ran **no local Jest, TypeScript, ESLint, Prettier, AST, Node, SQL/pgTAP, emulator or provider**. Root must run the coherent test batch against the exact final SHA, verify every positive and negative vector A–G, shapes-first initialization, type narrowing, original 217 cases, formatter and all-function-length limits before accepting. Source ownership **FROZEN after checkpoint**.
