# #395 Core Wave 1 — T005/T007 test-only handoff

**Status: TEST AUTHORING COMPLETE; WRITES FROZEN AFTER PUBLICATION.** This is a bounded tests-first receipt, not a production change, Red/Green execution result, deployment claim, or ownership of the root feature branch.

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
