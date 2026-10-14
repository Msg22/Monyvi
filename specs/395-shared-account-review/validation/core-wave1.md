# #395 Core Wave 1 — T005/T007 test-only handoff

**Historical Wave 1 status:** TEST AUTHORING COMPLETE. T009 source ownership was subsequently authorized and is recorded below; no parser/Edge/SQL authorization follows from it. This is a bounded tests-first receipt, not a production change, Red/Green execution result, deployment claim, or ownership of the root feature branch.

## Immutable source and authorization

| Item | Value |
| --- | --- |
| Repository | `Msg22/Monyvi` |
| Issue / integration PR | #395 / #396 (not mutated by this lane) |
| Isolated test-only branch | `codex/395-core-worker` |
| Exact source parent | `7e27eb55c642dccef44f4b977a8712ab320ecd18` from `codex/395-implementation-context` |
| Trusted governing main | `7838df64eb9b3828c6e8f1a02f590b008d5435fd` |
| Current test authoring parent before this final receipt | `070ba8a4d4c77b4a228dda5f0613929cfaf399f4` |
| Authoritative T004 wire shapes blob | `b6c513eec986b93158be51002487e6a39c84361b` |
| Routing exception | Normal ChatGPT → Antigravity → justified native fallback; no OpenCode, no Codex handoff |

GitHub returned 404 for the target branch directly before creation. `create_branch` succeeded with the exact immutable base and the new ref was reread at that SHA before publication. The test files are on the isolated branch only. UI's T006/T008 files, root-owned integration/ledger, contract docs, production, SQL, PR/issues/Pages/main remain untouched.

Read governing constitution, AGENTS, offline-financial-systems engineer persona/skill at trusted main; team-led workflow with approved exception at context SHA; TDD guide and feature spec/plan/tasks/data-model/manual test and contracts including `wire-shapes.md`. The frozen T004 `DefaultSnapshot { activeAccountIds, defaultAccount }` current-state guard was not changed or renamed in this test wave.

## Changed test and report files only

1. `packages/logic/src/account-review/__tests__/fixtures.ts` — synthetic canonical UUIDs, Voice and SMS v1/v2 payload factories, UTF-16 span builders, grounded Voice CASH scenario, no customer data or secrets. Fixture source/evidence types derive from the canonical T004 exported `AccountReviewRow` and `AccountReviewEvidenceSpan` types instead of copied unions.
2. `packages/logic/src/account-review/__tests__/schemas.test.ts` — 29 declared Jest test/table definitions, with multiple parameterized cases. Strict request/PII whitelist and generated enum checks; required nullable account fields; card suffix preservation; duplicate UUIDs; evidence geometry/UTF-16 text; explicit/contextual/absent constraints; omission vs unknown/ambiguous/conflicting/unsupported; known vs unconfirmed currency; assignment null/identity/revision; durable group shape; reciprocal group/source refs and duplicates; provider-financial boundaries; SMS ordinary CASH rejection vs grounded Voice CASH acceptance; v1/v2 distinction and valid financial content when advisory fails.
3. `scripts/__tests__/account-review-edge-contract.test.ts` — 6 executable Node/tsx tests comparing canonical and generated Edge schema acceptance for concrete legal/illegal samples and Zod JSON Schema projections, including Voice Gemini/CASH, SMS DeepInfra/completion, privacy, unsupported versions, invalid refs and uncertain currencies. Generated Edge validators must be standalone; functional parity, not only matching source strings.
4. `apps/mobile/__tests__/services/account-review-parser-adapters.test.ts` — 14 declared Jest tests with mocked single Edge transport and real existing parser entry points. Voice multipart v2 context/version, original one-call budget, category/amount retention, shared evidence, genuinely ambiguous/null currency, legacy v1, malformed advisory degradation to unknown/unresolved, malformed core financial rejection and privacy-safe logs. SMS v2/v1 parse result, null unknown currency, original-call context and correlation, malformed advisory with valid financial rows, wrong message ID, capacity refusal and current-owner scope. No provider invocation occurs during authorship or this receipt.

`accountReviewRequestContextSchema` supplies the existing top-level `reviewContractVersion`, `preferredCurrency`, `accounts` fields to client tests, not a new wrapper or alternate wire contract. Mobile tests discover nested advisory states without presupposing an unapproved UI/presentation shape.

## Contract obligations and current Red boundaries

These are **intentional pre-production failures** and represent required implementing exports/behaviors; test execution has **not** been claimed:

- T009: `packages/logic/src/account-review/schemas.ts` does not exist at the immutable base. Tests import its exact named T004 exports: `accountReviewRequestContextSchema`, `accountReviewEvidenceSpanSchema`, `accountReviewAccountEvidenceSchema`, `accountReviewCurrencyEvidenceSchema`, `accountReviewSuggestedAccountSchema`, `accountReviewVoiceResponseV2Schema`, `accountReviewSmsResponseV2Schema`, plus state `accountReviewCurrencySchema`, `accountReviewAssignmentSchema`, `accountReviewGroupSchema`, and inferred types `AccountReviewRow`/`AccountReviewEvidenceSpan`. Before T009 exists, Jest and tsx may report missing-module resolution rather than reaching behavioral assertions. Do not misreport that import error as verified behavioral Red.
- T011: generated standalone `supabase/functions/_shared/account-review-contract.ts` is also absent at base. Edge parity tests need generated validator exports with the canonical T004 names. They check schema functional equivalence and JSON projection hygiene; actual Gemini/DeepInfra request-schema support still needs separate provider integration evidence.
- T012: `parseVoiceWithAi` must forward the normative v2 discriminator and safe owned context in the existing multipart parse-voice call, retain v1 compatibility, and make validated advisory evidence accessible to normalization without inventing a second provider request or substituting preferred currency for ambiguous provenance.
- T013/T014: `parseAiResponse` and the `parseSmsWithAi` orchestration must preserve valid financial rows with typed advisory data, correlate each `messageId` to the submitted SMS and exact source spans, keep unrelated/invalid provider responses unresolved, and preserve completion/refusal/negative-fingerprint rules. The new v2 context fields follow T004. Existing v1 currency parsing remains unchanged; v2 nullable unconfirmed is explicitly exercised.
- T016: barrel exports still need registration by the eventual implementing owner. T007 intentionally does not edit the barrel.
- The v2 response may carry advisory details at a new typed result boundary not fixed by T004. Tests assert recoverable state and one-call behavior, not a copied mobile result interface. Root should align this typed adapter boundary during production integration rather than bypass assertions.

## Commands for the ROOT local batched foundation Red

From repository root with existing installed dependencies (no second install, no device):

```bash
npm test -w @monyvi/logic -- --runInBand --runTestsByPath src/account-review/__tests__/schemas.test.ts
npx tsx --test scripts/__tests__/account-review-edge-contract.test.ts
npm test -w @monyvi/mobile -- --runInBand --runTestsByPath __tests__/services/account-review-parser-adapters.test.ts
```

Subsequent local static checks once exports are implemented: `npm run typecheck -w @monyvi/logic`, `npm run typecheck -w @monyvi/mobile`, and scoped formatter/lint. Scripts use the repository's existing Jest/ts-jest and `tsx --test` runners. **None were executed remotely**: this GitHub-only worker has no attached runnable root checkout and did not call a provider, hosted service, SQL, emulator, or formatter. Do not claim Red/Green, static type pass, runtime provider correctness, device visual evidence or 80% coverage from these authored tests alone.

## Coverage boundary and risk notes

- Genuine financial row validity is tested separately from untrusted advisory validity; SMS failed correlation must not produce a durable negative or new provider request.
- `parseAiResponse` v2 now requires null/unknown currency support without weakening old v1; the tests require correct source-aware discrimination.
- The generated contract test compares runtime Zod validators and projected JSON shapes. It is not a substitute for separate configured-provider projection compatibility and original provider-invocation tests after T011–T014.
- State schemas, provider cross-reference validation and mobile parser integration are tests-first expectations, not implementations. The complete save/default financial CAS/SQL tests are outside T005/T007 ownership. T006/T008 belong to UI.
- Data-quality assertion in the fixtures: Voice CASH is grounded by a spoken Cash span; ordinary SMS CASH is rejected rather than silently recast into Bank/Wallet.
- Independent lead review must evaluate assertion granularity, formatting and actual Jest/tsx failures at the pinned checkout. No code path, branch, root ledger or mockup outside this assigned slice has been edited.

**Handoff:** five allowed files, no extra helpers, no production/test outside the allowlist. All subsequent writing requires a new exclusive assignment and current immutable head. This lane **FREEZES** after the final report commit.

## Reopened test-only recovery — original local checkpoint blocker

**Verified frozen starting HEAD:** `3672b43992cda3938ee0fd6ec906e80d1fb2058e`. Root's separate local verification found that the combined Jest/tsx batch was **not accepted as behavioral Red**: the T005/Edge suites stopped at missing canonical `schemas.ts`, while `account-review-parser-adapters.test.ts` stopped in the Babel Jest hoisting transform at its original line 67, because `jest.mock` referenced `syntheticSession`.

**Bounded correction:**
- Replaced the out-of-scope session capture with the existing Jest-pattern **`mockStableSession` lazy binding**, retaining only `mock*` top-level factory captures and values defined inside the other mock factories. Existing parser entrypoints, mocked one-call Edge transport, financial assertions, privacy and refusal tests remain intact. No unsafe casts/virtual mocks/production shims.
- Removed the test-only fixtures' `../schemas` type dependency. Their source is inferred from the existing `TransactionSource` with `MANUAL` excluded; evidence-field strictness is tested by **T005** against the normative Zod schema, not reimplemented in fixture code.
- **T007 constructs its own directly typed synthetic request context** inside `account-review-parser-adapters.test.ts`, reusing existing `AccountType`, `CurrencyType`, `AiVoiceParserOptions` and `ParseSmsContext`. This leaves Voice/SMS v1/v2 synthetic response factories reusable and removes the T007 missing-schema dependency without duplicating the future schema or inventing an alternate wire field.
- Source-backed legacy SMS handling: `apps/mobile/services/ai-sms-parser-response.ts` declares `isAtmWithdrawal: z.boolean().optional().default(false)` and `cardLast4: z.string().optional()`. The T005 regression accepts both absent, accepts a valid provided four-digit suffix, rejects a malformed suffix and still requires original `categorySystemName`. T007 checks SMS parser-normalized `categoryId` and the legacy default ATM value; no legacy optional key was promoted into a new required one.

**Verification still pending:** this remote GitHub author did not run Jest, Babel, tsc, ESLint or providers. Root should reapply this branch's corrected test files to the isolated verification worktree and rerun the same batched Red command recorded above. Expected T005/Edge module-resolution failure remains separately recorded; meaningful T007 behavioral Red is expected from existing Voice/SMS parser pathways but **has not yet been observed**. Scope was only 4 previously authorized test/report files; UI's T006/T008 and root integration stay untouched. This lane **FREEZES** after the corrected publication.

## T009 schema-only implementation checkpoint (2026-10-14)

**Source lease:** branch `codex/395-core-worker` confirmed at `1e39e6b8a327774e56fa6836b5fad9c9b1ea72d0`; T005/T007 test authoring is complete and the root-reported mobile batch is 37 tests (21 pass, 16 fail), with missing v2 behavior measured in actual parser entrypoints. Those parser fixes are **outside T009**. T005/Edge suites still have unexecuted behavioral assertions because canonical/Edge exports were absent.

**Bounded schema plan:**
1. Add `packages/logic/src/account-review/generated-vocabulary.ts`, a **generated runtime projection** of `packages/db/src/supabase-types.ts` public enum constants (currency/account/transaction) without runtime DB imports. Add optional `scripts/generate-account-review-vocabulary.cjs` to make regeneration deterministic and typecheck total domain coverage against generated DB types.
2. Add `packages/logic/src/account-review/schemas.ts`: closed parser/request/suggestion/Voice/SMS v2 schemas, UTF-16 evidence-span and reciprocal reference validations, strict review currency/assignment/row/group/session/command/save-intent discriminators; all public types inferred from Zod. Reuse shared canonical money/date/revision helpers and existing parsed transaction domain types. No resolver/reducer, persistence, parser adapters, Edge generator, UI or save writer.
3. Add a single early schema barrel export in `packages/logic/src/index.ts`; preserve other exporters and UI's disjoint files.
4. Within existing owned tests remove F04 input-only assertions masquerading as retention, annotate F06 canonical raw fixture return values, and strengthen meaningful T007 boundaries without implementing T012–T014. Record the proposed **typed normalized adapter result seam** in this report for later lead approval; do not fabricate a mobile result union at T009.

**Dependency edges:** T009 → T011 generated Edge/provider projection, T012–T014 Voice/SMS parser + adapter production, T016 final export parity. Root, not this GitHub-only worker, runs batched local schema Green and actual TypeScript/lint; none are claimed here. Approved UX/assets/T004 default-state CAS and old v1 parser compatibility remain unchanged.

## T009 schema-only implementation receipt — ready for independent local Green

**Authorized work:** canonical Zod schemas and type projections only. Root's latest actual mobile parser evidence remains **37 cases: 21 pass, 16 fail**; these are measured Voice/SMS v2 behavior gaps and were not addressed here. The T005/Edge prior missing-module stops were not counted as behavioral Red. No runtime check/Green result is claimed by this remote author.

### Modules and API contract

- `packages/logic/src/account-review/schemas.ts` — closed canonical T004 parser objects and review state objects with corresponding `z.infer` types: `accountReviewRequestContextSchema`, `accountReviewEvidenceSpanSchema`, `accountReviewAccountEvidenceSchema`, `accountReviewCurrencyEvidenceSchema`, `accountReviewSuggestedAccountSchema`, `accountReviewVoiceResponseV2Schema`, `accountReviewSmsResponseV2Schema`, `accountReviewCurrencySchema`, `accountReviewAssignmentSchema`, `accountReviewRowSchema`, `accountReviewGroupSchema`, `accountReviewSessionSchema`, `accountReviewCommandSchema`, and `accountReviewSaveIntentSchema`. Additional canonical raw and reason schemas/types serve these interfaces. No hooks, reducers, command handlers, sync, SQL or resolver paths were authored.
- `packages/logic/src/account-review/generated-vocabulary.ts` — generated-only runtime enum/reason arrays projected from checked-in Supabase `Constants.public.Enums` and `TransactionReviewReason`, with type-only DB imports and compile-time source-union completeness assertions. This contains no local copied union and does not import `@monyvi/db` at runtime. `scripts/generate-account-review-vocabulary.cjs` regenerates it from source; **generator not executed remotely**, so root must run it and confirm no diff.
- `packages/logic/src/index.ts` — exactly one early canonical schema barrel export, no other shared export owner touched.
- `packages/logic/src/account-review/__tests__/fixtures.ts` — F06 explicitly annotates raw/typed synthetic factory returns with inferred canonical schema types. Actual v1 return shapes remain separate from v2, and four-digit leading-zero suffixes are preserved.
- `packages/logic/src/account-review/__tests__/schemas.test.ts` — F04 removes two fixture-only assertions incorrectly labelled financial-row retention; strictly invalid advisory is tested at the schema layer, while retention is an adapter behavioral responsibility. Added focused state/row/session/command/frozen-save-intent tests: canonical amount, required category, identity/scope linkage, explicit shared disclosure, stale revisions, UUID uniqueness, and safe UTC time.
- `apps/mobile/__tests__/services/account-review-parser-adapters.test.ts` — replaces the fake success-data capacity refusal with the **actual 429 `Response` refusal envelope** from existing safeguard Jest patterns and checks exact `burst_limit` availability/capacity candidate. Existing tested real parser entrypoints remain unchanged.

### Explicit normalized adapter seam proposal (F02/F03 — not implemented in T009)

T004 freezes the **`AccountReviewRow` / `AccountReviewSession`** types but does not settle the mobile parse result transport. Existing `AiVoiceParserSuccess` and `AiParseResult` return legacy `transactions`; a recursive hunt for `currencyEvidence` anywhere inside an arbitrary result object can pass on echoed **raw provider JSON** without proving normalization. Negative v1 tests that assert only `not.toContain("omitted")` can also pass when no review state is present. These should not be counted as proof of the new normalization contract.

**Lead integration decision required before T012–T014:** expose one explicitly typed normalized review projection derived directly from the canonical `AccountReviewRow`/`AccountReviewSession` schemas alongside the preserved legacy financial rows, with a stable owner/source/request identity. Do not copy a new disconnected result union or persist raw provider bodies. Once the seam is chosen, T007 must assert **on that returned normalized row**:
1. known vs unconfirmed `currency.state/reason` including **`legacy_unknown`** for a v1/old-server response, no invented `omitted`;
2. `assignment.state` with owned scoped existing/suggested/unresolved IDs and `reviewReasons` including `currency_confirmation_needed`/`account_evidence_invalid` where applicable;
3. exact retained normalized `transaction.categoryId` and amount (not a successful raw provider parse or arbitrary nested echo);
4. evidence spans validated against *actual submitted* SMS body/sender or original Voice transcript, with foreign refs never yielding an authorized group; and
5. precisely one provider invocation, true refusal envelope, and exact `availability: {reason:"burst_limit",availableAt}` for capacity rejection.

The capacity test (#5) was strengthened now because the existing `SmsAiAvailability` type is already published. The remaining assertions depend on that typed seam and are **deferred** rather than weakened into vacuous or invented-result tests. Some existing SMS 0-row parser failures could be mock/correlation problems; compare fixture `messageId` with the *actual submitted* ID and review the existing chunk-mapper/transport state before declaring them product defects.

### Generator and source-backed proof limitations

- Provider/raw v2 response currency can be nullable, unsupported and uncertain. Canonical currency/account/transaction type vocabularies come from the generated DB enums; no silent preferred fallback is applied by these schemas.
- `accountReviewEvidenceSpanSchema` validates UTF-16 interval geometry. Voice success can compare against the returned `original_transcript`; a standalone SMS provider response deliberately does **not** contain the submitted SMS body or sender, so exact substring verification against that private input remains a T013/T014 adapter responsibility. No claim of independent AI truth proof.
- Original SMS provider keys retain their existing optional/default rules (`isAtmWithdrawal` defaults false; `cardLast4` optional), while `categorySystemName` stays required. `transaction.categoryId` remains required in the **locally normalized review row**.
- The local `AccountReviewRow.transaction` schema represents an existing parsed transaction snapshot (including a valid JS `Date`), not a new persisted cloud transaction. T028 SMS draft codec must explicitly serialize/restore this shape under its existing ownership; this T009 commit does not implement that codec.
- **F05 remains T011-owned:** after authoring the concrete generator/Edge projection contract, add a canonical revision/hash parity marker and test the actual supported Gemini/DeepInfra provider projections, not just parser source strings or an unchecked JSON shape. Current Edge parity file still awaits T011's real generated module.
- T009 does not register `review.batch-save/v1`, `account.create-default/v1`, change `DefaultSnapshot`, grant server migration, or alter `apply_account_financial_action_v1`.
- **Must-run root local checks, not claimed:** run `node scripts/generate-account-review-vocabulary.cjs` and check an empty diff, `npm test -w @monyvi/logic -- --runInBand --runTestsByPath src/account-review/__tests__/schemas.test.ts`, `npm run typecheck -w @monyvi/logic`, and scoped format/lint. T011 generation/parity and final mobile batch are separate downstream checks. Report a real Red/Green/status only from observed runner logs.

**Ownership:** once the publication receipt confirms only authorized files on `codex/395-core-worker`, this implementation lane is frozen. Root owns local Green, dependent tasks, independent DB/security/logic review, integration and any next scope grant. No more modifications are implied by this report.

### Immutable T009 publication receipt

- **Actual implementation commit:** `cad11698b4580732e75c0bc884a119fcc7bba55c`; parent `29966958e5e2dfdc59f0b503fc2c6645b8f3dff4` (read-only plan checkpoint). Implementation commit tree: `e95136a3c539aa14cadf7a6ffb5062d4bad3bed9`.
- **Exactly eight allowed files changed:** `packages/logic/src/account-review/{schemas.ts,generated-vocabulary.ts,__tests__/fixtures.ts,__tests__/schemas.test.ts}`, `packages/logic/src/index.ts`, `scripts/generate-account-review-vocabulary.cjs`, `apps/mobile/__tests__/services/account-review-parser-adapters.test.ts`, and this report.
- **Source blob receipts:** `schemas.ts` = `da1d18ce70abec926ae666e4111591fa3ea7c5b0`; generated vocabulary = `3f0f4a7b13bc5e781f8c956931ee0d0597707926`; generator = `d94047413987f5aa28fb7014cd9a6a46dbad18a0`; schema tests = `5b9a19413de7dc2ca269ae43359720f614b3e563`; raw fixtures = `79528ee64239271a9ce5e49a289a8038aa6b05f4`; mobile T007 = `89927a256349b77c6f8e083f35741bf16510109d`; barrel = `fc6fb37ae347bb14fc3ea8704f7c57996a3f01f5`.
- **GitHub verification:** implementation HEAD and parent confirmed; comparison to the checkpoint lists exactly those eight paths, with no UI-owned files, parser production, edge adapters, sync, SQL, feature contracts, PRs/issues or Pages mutated.
- **No runtime evidence claimed:** schema behavioral Green, generator parity/empty diff, typecheck, Jest, format and ESLint remain root-local gates. F02 adapter normalized-result seam and F05 generated provider projection remain downstream approval boundaries. This final report-only publication intentionally advances the isolated branch past the implementation commit; use the live branch HEAD to retrieve this receipt.
- **Ownership final state: FROZEN / RELEASED.** No automatic continuation to T010–T015, no other writes.

## T009 TS2339 narrow correction (bounded reopened ownership)

**Source lease:** the existing worker branch `codex/395-core-worker` was refreshed and exactly matched `511a223cd4695411d8a060c8ad1ba7f1a15fbdcd` immediately before authoring. No other branch or file ownership was assumed.

**Actual root-local evidence (reported by lead):** T005 canonical schema Jest batch **54/54 PASS**. The logic TypeScript typecheck failed with **TS2339** at `packages/logic/src/account-review/schemas.ts:642:83`: `groupId` is absent on other `AccountReviewAssignment` union members because discriminant narrowing of `row.assignment` was not retained inside the nested `Array.find` callback. This is a TypeScript narrowing failure, not a behavioral validation failure.

**Exact source change:** inside `if (row.assignment.state === "suggested")`, capture `const suggestedAssignment = row.assignment;` and reference `suggestedAssignment.groupId`, `suggestedAssignment.groupRevision` and `suggestedAssignment.confirmation` for the existing group lookup and comparisons. The Zod schema, issue paths, conditions and validation semantics are unchanged. No casts, `any`, schema weakening, tests edits or new exports.

**Generator status (reported by lead):** the vocabulary generator executed locally with five vocabularies. Exact generated-output parity remains under independent inspection; this report does **not** assert an empty diff or parity PASS.

**Routing policy:** latest owner override is **Normal ChatGPT → verified FREE OpenCode → AGY Gemini/Claude → native only after prior explicit task permission from Mohamed**. Prior no-OpenCode statements in historical Wave 1 receipts are superseded. Native lanes are retired. No handoff occurred for this bounded Normal ChatGPT correction.

**Verification boundary:** the typecheck has **not been rerun or claimed PASS** by this remote author. Root should run `npm run typecheck -w @monyvi/logic` on this corrected immutable snapshot and retain the observed 54/54 Jest receipt. No emulator, provider, hosted database, deployment, PR, issue, Page, unrelated tests or source changed. Source ownership **FROZEN / RELEASED** following the single correction commit.

## T011 F05 plan/test-only checkpoint

**Lease:** worker branch checked at `0700eb3e6023ea33a91f8662515d98e644087112` before this checkpoint. Only the existing Edge contract test and this report are owned, plus two expressly approved helper-return annotations in existing T005 tests. T009 source review is independent; production remains frozen.

**Observed local baseline (lead):** schema Jest 54/54 PASS; logic TypeScript PASS; vocabulary generator ran for five vocabularies. Exact post-format generator parity remains unverified. Five T009 files failed Prettier. Lint custom-rule errors resulted from invoking ESLint without `--rulesdir scripts/eslint-rules`, not a demonstrated source error.

**Read-only inventory:** Existing Voice safeguard generation uses a verbatim copy plus byte/import-graph tests; that strategy alone is unsafe for the T009 schema module because its runtime dependencies include Zod, Decimal, financial revision helpers, amount helpers, and generated vocabulary. Gemini uses a JSON schema supplied to `responseJsonSchema`. DeepInfra accepts strict `response_format.json_schema` and has an actual injected-fetch test harness for verifying the serialized request. The canonical Zod cross-row/sourced-evidence refinements cannot be replaced with JSON Schema alone.

**Proposed T011 contract requiring lead approval:** the future generated standalone Edge module should expose canonical parser validators and `ACCOUNT_REVIEW_EDGE_GENERATOR_VERSION`, `ACCOUNT_REVIEW_CANONICAL_SHA256`, `buildAccountReviewGeminiResponseSchema()`, and `buildAccountReviewDeepInfraResponseSchema(supportedCurrencies)`. The provider projections must be built from exact T009 schemas, preserve closed v2 properties, nullable uncertainty and generated enums, and exclude server-only completion metadata from model output. A deterministic generator should hash exact ordered canonical source/dependency bytes and produce repository-Prettier-formatted ESM without copied domain unions or out-of-scope runtime imports. Proposed CLI for later authorization: `--output` writes only a caller-specified temporary artifact; `--check` validates the tracked result without mutation.

**Tests-first F05:** expand the single owned Edge contract test to inspect and exercise exported Gemini/DeepInfra provider projections, run the existing DeepInfra request serializer with injected fetch (never an actual provider call), reject malformed/no-evidence response samples via runtime Edge Zod validators, and independently verify version/hash and generator/formatter idempotence. Simulate vocabulary generation under a fresh temporary directory; current generator may correctly fail the hook-clean test until an independently granted T009 generator repair.

**Separate F06 correction:** add explicit `AccountReviewRow` and `AccountReviewSession` return annotations to the two existing T005 fixture helpers. No schema semantics change.

**Adapter seam proposal, not an implementation:** keep legacy parser financial rows and additionally provide a canonically typed `Pick<AccountReviewRow, "rowId" | "source" | "sourceRef" | "currency" | "assignment" | "reviewReasons" | "transaction">` projection, scoped by existing session/owner identity. T012–T014 and stronger T007 normalized-behavior assertions require lead approval first.

**Policy:** Normal ChatGPT → verified free OpenCode → Antigravity Gemini/Claude → native only after explicit prior task authorization; no handoff. Root owns local test execution, lint with corrected rulesdir, formatting, parity and the independent review. No production, script, Edge, package, parser, SQL or UI writes authorized here.

## T009 independent review regressions — tests-first checkpoint

**New assignment supersedes T011 planning priority.** Branch source `codex/395-core-worker@f6675745e6d7bfb897c66a269bc006ee3291c770` was revalidated unchanged before authoring. Independent UI review `ad9c3bbac355e4024b038643312269d50177aafa`, `specs/395-shared-account-review/validation/schema-review.md`, was read alongside the frozen T004 `7e27eb55c642dccef44f4b977a8712ab320ecd18`. Root confirmed the review disposition and approved **tests/report only**; no T009/T011 production correction is authorized. UI report/branch remain untouched.

### Authored T009 Red cases and positive guards

- **H1 — institutional identity:** a synthetically grounded, otherwise matched Voice and SMS suggested account rejects *different non-null* `institutionId` values. Matching non-null and genuinely unknown/null institution evidence are positive controls; null is never invented as a conflict.
- **H3 — live group graph:** positive reciprocal pending/confirmed group; negative group claiming an unrelated unresolved row, two active groups claiming one row, and an active group whose currency differs from its linked known-currency row. Positive **removed tombstone** cases preserve detached rows, previous confirmation revision and inert former membership even alongside a new live group. Do not force removed group membership active again.
- **H4 — normalized destination:** ordinary Voice and non-ATM SMS rows must have `toAssignment:null`, while a supported ATM path may have a known-currency, distinct-account existing destination. Negative ATM cases cover same source/destination, incompatible destination currency and unresolved review currency with an assigned destination. Account ownership/type eligibility beyond present snapshot fields remains T014/writer verification.
- **H2 split preserved:** a raw v2 suggestion with nullable currency and proven `currencyEvidence.state:"omitted"` is still an *advisory proposal* and remains structurally valid. It does not become a local confirmed group. The known preferred-currency resolution and uncertainty → unresolved/no active group decision belong to the normalized T014 boundary; this test must **not** ban all omitted suggestions.
- **M4/F06:** `validVoiceRow` and `validSession` now declare exact canonical inferred return types. An added **type-only compile-time conformance check** requires inferred Voice/SMS review snapshot transactions to remain assignable to existing `ParsedVoiceTransaction` and `ParsedSmsTransaction` contracts; complete synthetic Voice/SMS row acceptance remains a runtime positive control. This is not a copied transaction union.

**Predicted behavioral Red, not an execution claim:** H1 institution conflict and H3/H4 negative cases currently lack their corresponding source guards. The existing schema test suite previously passed 54/54; the new test count and failures must be established by root's next single combined batch. Positive tombstones, known-group, raw omission and ATM-destination controls should constrain the smallest subsequent production fix.

### Generator hook cleanliness and separate T011 gate

Only the existing `scripts/__tests__/account-review-edge-contract.test.ts` was edited: it now runs a *real T009 vocabulary generator* twice inside a disposable local replica of its three checked-in inputs, never writing to the real repo. Two independent tests check raw byte idempotence/tracked-content parity and Prettier-clean generated bytes using repository configuration. The latter should demonstrate the reported unformatted-generator defect without claiming the prior raw empty diff is post-hook parity. Existing six Edge parity assertions remain, but their not-yet-created Edge module is loaded only inside those test callbacks, so the new vocabulary checks are **not blocked at suite import time**. The T011 standalone generator/provider projections and full F05 tests remain planned at the earlier checkpoint; **no new Edge/provider API or implementation** is introduced here.

**Previously supplied actual evidence:** 54/54 schema Jest PASS; logic TypeScript PASS; raw generator emitted five vocabularies; all five T009 source files reported Prettier failures; existing custom ESLint rules require `--rulesdir scripts/eslint-rules`. Source reviewer identified four HIGH findings. These predate the new regression tests and are not a claim that the extended test batch ran.

**Root single affected test batch:** run `npm test -w @monyvi/logic -- --runInBand --runTestsByPath src/account-review/__tests__/schemas.test.ts` plus `npx tsx --test scripts/__tests__/account-review-edge-contract.test.ts` in the isolated verification worktree; record expected Red outcomes and typecheck including the M4 drift check. Do not count absent T011 Edge module errors as behavioral Red. After Red, root may separately authorize the smallest schema and generator-production fixes. Formatter/lint/source review remain separate acceptance gates. No per-file local reruns, provider calls, emulator, hosted changes or output assertions were performed by this remote author.

**Write boundary:** `schemas.test.ts`, `account-review-edge-contract.test.ts`, this report only. The fourth allowed file `fixtures.ts` is intentionally unchanged. User-approved T011 plan at the previous checkpoint remains just a proposal. All T009/T011 production, exports, generator code, parser, UI, SQL and workflow files are protected. **FREEZE / RELEASE ownership after this test/report commit.**
