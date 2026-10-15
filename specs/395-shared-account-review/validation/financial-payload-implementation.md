# #395 T046 — pure review financial payload implementation checkpoint

**Owner:** successor UI/financial pure lane; sole writer on \`codex/395-ui-worker\`.
**Source authority:** trusted \`9a8987a8087db886d9b9244182ef8e8128016621\`, frozen \`contracts/financial-save.md\` and \`contracts/wire-shapes.md\` (T004); source order and existing financial-action foundation at branch starting \`2d306e34e44c87fadc8d3b903e133bb50e33760a\`.
**Ownership:** T046 PURE only; account-review resolution remains NormalSQL, namespace/parser and Voice diagnostic privacy remain Core. No code owner overlap, runtime registry activation, app/service/SQL/provider/sync/UI/PR mutation or manual DB/provider test authorized.

## Preserved Root-authored tests (exact GitHub blob handoff)

Created in \`packages/logic/src/financial-actions/__tests__\`:

- \`review-batch-save-fixtures.ts\`: fetched exact \`6d8e69a4438ce5e2d34ac915441a2e6d73a044ab\`, content preserved.
- \`review-batch-save.test.ts\`: fetched \`582e6047599ec9e654ccda5c6703a93b926adce0\`; one mechanical compile correction: undefined \`danglingRecord\` used for the existing mismatched-record negative case changed to its real \`mismatchedRecord\` local. Removed six provably unused imports (\`REVIEW_ACTION_ID\`, \`REVIEW_EXPENSE_ROW_ID\`, \`REVIEW_INCOME_ROW_ID\`, \`REVIEW_OCCURRED_AT\`, \`REVIEW_USER_ID\`, \`SMS_EXPENSE_FINGERPRINT\`). **No assertions, inputs or cases weakened**.
- \`review-batch-save-validation.test.ts\`: fetched exact \`5898f56474f89c426fc59be7514a8762627cd08d\`, content preserved.

Root's earlier T042 coherent creation Red was **only missing \`../review-batch-save\`**: 0 behavioral assertions executed then. Root separately reported **172 existing financial tests PASS across seven suites** before this source. Neither result proves this T046 candidate Green.

## New closed pure implementation and exact APIs

\`packages/logic/src/financial-actions/review-batch-save.ts\` exports:

- \`reviewBatchSavePayloadSchema\` — strict Zod transport schema with additional deterministic cross-record/ref/effect invariants, not copied DTO unions.
- \`validateReviewBatchSavePayload(value: unknown): ReviewBatchSavePayload\` — canonical inferred output, throws on invalid payload.
- \`createReviewFinancialActionDefinitions(invalidPayloadCode: string): readonly FinancialActionDefinition[]\` — **explicit opt-in** registry definition for EXACT tuple \`domain:"transactions"\`, \`kind:"review_batch_save"\`, \`payloadVersion:"review.batch-save/v1"\` with \`schemaVersion:"review.batch-save/v1"\` and \`operationCode:"review.batch-save"\`. Converts validation failures to the caller's supplied reason. Optional \`cashDefaultSnapshot\` is omitted rather than serialized as \`undefined\` in the registry's canonical JSON contract.
- \`ReviewBatchSavePayload\` inferred from \`reviewBatchSaveWireSchema\` (type-only export, not a handwritten parallel DTO).

New cohesive dependencies:

- \`review-batch-save-shapes.ts\`: lowercase UUIDs, strict real UTC millisecond timestamps and calendar dates, canonical revision via existing \`parseCanonicalUnsignedIntegerString\`, bounded signed ±2^63−1 minor-unit strings (including \`"0"\`, rejecting \`"-0"\`), currency membership from existing \`SUPPORTED_CURRENCIES\`, transaction type from existing \`VALID_TYPES\`, generated AccountType type-only typing, closed root/selected/group/guard/effect/children/account/transaction/transfer/SMS bookkeeping and optional Cash snapshot. Only finite positive financial row minor units. Existing account/transaction/transfer persisted field vocabulary retained; no AI raw evidence, balances, state snapshots or provider context copied into cloud payload.
- \`review-batch-save-integrity.ts\`: ASCII sorted/unique domain mutations by \`entity:id\`, create guards by \`entity:id\`, domain refs by UUID; equality of all create mutation ID/guards/domain refs, no repeated entity ID; exactly one selectedSourceRef per financial create and exact transaction/transfer source fingerprint parity, voice null fingerprint and SMS non-null distinct across both entities; no unused new account, strict bank-only single details child, no child of existing/Cash, normalized unique sender aliases; Voice bookkeeping empty, SMS selected deletion count and distinct local draft/queue refs, confirmed-group referenced account involved.
- \`review-batch-save-effects.ts\`: derives exact selected signed account deltas via \`bigint\`, one posted effect per affected account, zero effect retained, per-account currency matching, overflow/cross-effect duplicate rejection, strict ATM from/to endpoints and no silent FX conversion, new-account zero opening / no target / Bank-Wallet never default; new Voice CASH permitted only with exact \`cashDefaultSnapshot\`, first-active default parity; SMS newly created Cash restricted to selected ATM destination. No Number/money-float accumulation or fabricated opening effect.
- \`review-batch-save-envelope.ts\`: purpose-built pure check after explicit registry payload validation; reuses inferred canonical payload type; verifies new review root \`domainReferenceId\` equals **first sorted created financial record UUID**, accountGuard IDs exactly match sorted effect-account IDs and all financially referenced accounts, missing/additional guards fail, new-account expectedRevision \`"0"\` + required \`expectedAbsent\` account guard, revision exhaustion disallowed.
- **One minimal extension** to existing \`action-contracts.ts\` \`canonicalizeFinancialActionEnvelope\`: narrow \`else if\` for exact \`transactions/review_batch_save/review.batch-save/v1\` invoking \`assertReviewBatchSaveEnvelope\`. Previous \`account.balance-effects/v1\` branch (including its nonzero-only legacy validator), final fallback for other guarded tuples, metals, envelope shape/root serializer and default registry are unchanged. There is **no wildcard version match**, v1 relaxation or implicit new tuple registration. This source extension was separately approved by Root after identifying the existing \`else if (accountGuards.length !== 0)\` blocker.

### Pure proof boundary and deliberately unclaimed behavior

The pure payload validator proves *shape and payload-internal correspondence only*. It cannot prove current owner, category access/active state, stored account currency/default snapshots, existing financial revisions, uniqueness/card across database rows, external SMS fingerprint duplicates, absent IDs in local/hosted DB, retry/idempotency/replay semantics, exact local cleanup linkage or actual revision increments. Those **MUST** be revalidated under the future authenticated local writer and SQL/CAS transaction. A recorded Cash snapshot is checked for structural/current-intent consistency, not authenticated *current-state equality*. New group account IDs must still be checked against selected/referenced owned drafts in the actual T043/T014/SQL lane.

Only canonical already-posted integer minor units are accepted here; converting entered decimal amounts with the existing Decimal half-even/precision utilities happens earlier in the authorized writer. This module does not infer an AI opening balance, perform rounding, materialize a DTO from provider text, run a database query, touch runtime \`index.ts\`, mutate \`DEFAULT_FINANCIAL_ACTION_REGISTRY\`, or use a live provider. Existing old-tuple zero-effect rejection remains unchanged; new zero-net permitted strictly under the new explicit tuple and still **requires** an account guard. Stored revision r→r+1, canonical postimage and once-only zero compensation are *execution duties* of 088/persistence, not accomplished by this helper.

**Important integration dependency:** the strict registered envelope check only runs when a caller explicitly constructs a registry using \`createReviewFinancialActionDefinitions\`. Until Root integrates the new tuple into the authenticated runtime registration after SQL/server readiness, attempting new review saves through the global default registry correctly remains unsupported.

## Current check receipt and Root checkpoint

This Normal ChatGPT worker published source/tests/docs through GitHub connector and performed remote source/diff review. It did **not** run npm/Jest, strict TypeScript, ESLint, Prettier, local SQL/pgTAP, a full-save runtime, provider call, emulator, hosted DB, or migration. **T046 actual compile/behavior Green remains unverified.** In particular, Root must:
1. Integrate the exact UI T046 source/test commit into its coherent local worktree, run the two new test files and existing seven legacy financial suites; inspect precise failing assertions and strict TypeScript/lint/format.
2. Check new registry serialization and the helper's narrow branch against the frozen T042 zero-net/new-bank/ATM/first-Cash/negative refs/guards/currency/fingerprint/legacy vectors, including attempt to use the unregistered tuple on default registry.
3. Independently inspect schema/export visibility, circular runtime import between contract helper and canonical revision parser, and ensure the new envelope guard branch cannot weaken old financial roots.
4. Treat new runtime/SQL/sync/writer/effect revision and recovery acceptance as **separate future owners and gates**. No unsupported server registration or local green should be inferred from these pure source files.

**Ownership release:** One complete **T046 PURE source checkpoint**, pending Root tests/independent review. **FROZEN**. No general project acceptance, Save screen success, registration deployment, or background work claimed.
