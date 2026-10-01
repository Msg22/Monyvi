# Tasks: Configurable SMS AI Provider

**Input**: Design documents from `/specs/388-sms-ai-provider/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/parse-sms.openapi.yaml`, `quickstart.md`

**Tests**: Required by the approved implementation plan. Follow Red → Green for provider/config/prompt/factory work; routine tests must make zero real DeepInfra/Gemini SMS full-parser calls.

**Organization**: Tasks are grouped by user story. US1 and US2 are both P1. US1 proves the concrete DeepInfra provider can satisfy Monyvi's existing SMS contract; US2 completes the configuration/factory wiring that makes the production switch maintainable. US3 proves the cost/caching behavior without making correctness depend on cache hits.

## Phase 1: Setup

**Purpose**: Prepare exact Edge/runtime dependency resolution and one focused test entry point without changing SMS behavior.

- [x] T001 [P] Add exact `zod` mapping `npm:zod@4.4.3` to `supabase/functions/parse-sms/deno.json` while preserving the existing Edge/Supabase mappings.
- [x] T002 [P] Add the same exact `zod` mapping `npm:zod@4.4.3` to `supabase/functions/deno.json` for shared-module/IDE resolution without removing Google GenAI from the shared map.
- [x] T003 [P] Add a deterministic `test:sms-ai-provider` script with an explicit list of the feature's shared test files to `package.json`; the script must never call a live AI provider.

**Checkpoint**: Zod resolves identically in Node/shared tests and the parse-sms Deno runtime, and a focused provider test command exists.

---

## Phase 2: Foundational Provider Boundary

**Purpose**: Establish provider-neutral types, fail-closed configuration, and provider-independent prompt/schema construction required by every story.

**⚠️ CRITICAL**: Complete this phase before any user-story implementation.

- [x] T004 [P] Write failing configuration tests for explicit provider/model/approved-model-list/service-tier/API-key parsing, including missing `SMS_AI_SERVICE_TIER`, blank values, unsupported provider/tier, blank model, missing/malformed `SMS_AI_APPROVED_MODELS`, unapproved model selection, and missing DeepInfra API key in `supabase/functions/_shared/sms-ai/sms-ai-provider-config.test.ts`; no required value may silently default.
- [x] T005 [P] Write failing prompt/schema equivalence tests in `supabase/functions/_shared/sms-ai/sms-ai-prompt.test.ts` proving current Monyvi rules, supported-currency context, built-in category definitions, transaction required fields, and valid empty-transaction shape are preserved, with future custom-category context ordered after the stable built-in/currency prefix; also add a regression in `supabase/functions/_shared/sms-input-estimator.test.ts` proving prompt, categories, response schema, and SMS candidate content are each counted exactly once.
- [x] T006 Define the raw provider Strategy contract plus normalized Monyvi result types in `supabase/functions/_shared/sms-ai/sms-ai-provider.ts`: adapters return completion status + raw content/operational metadata, while `SmsProviderExecutionResult` remains the handler-facing normalized contract; update/re-export compatible types from `supabase/functions/_shared/parse-sms-handler.ts`.
- [x] T007 Implement typed fail-closed environment parsing for explicitly required `SMS_AI_PROVIDER`, `SMS_AI_MODEL`, `SMS_AI_APPROVED_MODELS`, `SMS_AI_SERVICE_TIER`, and `DEEPINFRA_API_KEY` in `supabase/functions/_shared/sms-ai/sms-ai-provider-config.ts` until `supabase/functions/_shared/sms-ai/sms-ai-provider-config.test.ts` is Green; missing/blank/malformed values must not default, and the model selection must exactly match the hosted allowlist.
- [x] T008 Implement provider-independent prompt/schema construction in `supabase/functions/_shared/sms-ai/sms-ai-prompt.ts` until `supabase/functions/_shared/sms-ai/sms-ai-prompt.test.ts` is Green: stable Monyvi rules + unchanged supported-currency context + built-in category definitions first, future custom-category context second, SMS content last, with strict response JSON Schema; keep SMS business rules out of provider adapters.
- [x] T009 Add/adjust response-semantics regression coverage in `supabase/functions/_shared/parse-sms-handler.test.ts` to prove the handler accepts a normalized injected provider result, accepts a legitimate complete `transactions: []` result, rejects schema-invalid normalized results, and exposes no provider-specific fields in the public response; keep future-adapter replaceability coverage reserved for T017.
- [x] T010 Run the foundational Red/Green suites in `supabase/functions/_shared/sms-ai/sms-ai-provider-config.test.ts`, `supabase/functions/_shared/sms-ai/sms-ai-prompt.test.ts`, and `supabase/functions/_shared/parse-sms-handler.test.ts`; do not begin US1 until these files are Green.

**Checkpoint**: Provider mechanics can be implemented without changing handler, safeguard, mobile, or voice contracts.

---

## Phase 3: User Story 1 — Keep SMS Import Working While Changing the AI Service (Priority: P1) 🎯 Provider Slice

**Goal**: Make DeepInfra/DeepSeek satisfy the existing Monyvi SMS provider contract with strict validation and bounded failure handling.

**Independent Test**: Inject the DeepInfra adapter with a mocked Fetch boundary into the existing SMS handler and verify valid purchase/empty results succeed while malformed, truncated, invalid, and exhausted-provider cases follow the existing safe result/refusal behavior.

### Tests for User Story 1

- [x] T011 [US1] Write failing raw-adapter request/envelope tests in `supabase/functions/_shared/sms-ai/providers/deepinfra-sms-provider.test.ts` covering the fixed DeepInfra endpoint, configured model, Standard tier omission, explicit priority mapping, `reasoning_effort: "none"`, `max_tokens: 8192`, strict `json_schema` serialization, raw content return, and Zod validation of the external DeepInfra envelope without applying Monyvi transaction semantics inside the adapter; Flex is intentionally rejected by configuration before request admission/provider-start accounting and is not an adapter-supported tier.
- [x] T012 [US1] Extend the failing provider tests in `supabase/functions/_shared/sms-ai/providers/deepinfra-sms-provider.test.ts` for 25-second attempt timeout, 2s/4s/8s bounded retries on 408/429/5xx/network/timeout, immediate failure on 400/401/403/404, retry exhaustion, malformed envelope/content, and finish-reason mapping `stop -> complete`, `length -> truncated`, explicit safety/content stop -> `safety_stopped`, unknown -> `failed`.
- [ ] T013 [P] [US1] Write a failing handler + provider-neutral executor + DeepInfra-adapter integration suite with mocked Fetch in `supabase/functions/_shared/sms-ai/parse-sms-deepinfra.integration.test.ts` covering valid purchase, valid empty batch, unsupported currency/category, malformed provider JSON, truncated completion, and provider-unavailable outcomes; include a transient-retry case proving multiple mocked DeepInfra attempts still cause exactly one `markProviderStarted` for the logical admitted request and no real provider call. Deferred slice: mocked full-path provider exhaustion → GitHub issue #352.

### Implementation for User Story 1

- [x] T014 [US1] Implement the raw `DeepInfraSmsProvider` with injected/mockable Fetch, timeout cancellation, retry classification, provider request-envelope serialization, strict external-envelope Zod validation, completion normalization, raw content return, and privacy-safe error handling in `supabase/functions/_shared/sms-ai/providers/deepinfra-sms-provider.ts`; do not call `parseSmsProviderTransactions` or own Monyvi financial semantics here.
- [x] T015 [US1] Implement `executeSmsAiProvider` in `supabase/functions/_shared/sms-ai/sms-ai-provider-executor.ts` to build the provider-neutral prompt/schema request, parse the adapter's raw JSON content, apply existing `parseSmsProviderTransactions` semantic validation, and construct `SmsProviderExecutionResult`; bring `supabase/functions/_shared/sms-ai/providers/deepinfra-sms-provider.test.ts` and `supabase/functions/_shared/sms-ai/parse-sms-deepinfra.integration.test.ts` to Green so malformed/partial output cannot yield an accepted financial suggestion.

**Checkpoint**: DeepInfra/DeepSeek is a complete, independently testable implementation of the existing SMS provider contract, but production provider selection is not yet switched until US2.

---

## Phase 4: User Story 2 — Change the SMS Provider Without Rewriting the SMS Workflow (Priority: P1) 🎯 Deployable MVP

**Goal**: Select the active SMS provider/model from validated configuration and wire it into `parse-sms` without changing the mobile contract, safeguards, reconciliation, or voice.

**Independent Test**: Start composition with valid DeepInfra configuration and verify the configured adapter is resolved; repeat with missing/unsupported configuration and verify failure occurs before any provider Fetch; inject a test-only fake provider into the handler and verify no handler/business-contract changes are required.

### Tests for User Story 2

- [x] T016 [US2] Write failing factory/composition tests for valid DeepInfra selection, unsupported provider rejection, dependency injection of a mock Fetch/logger, propagation of explicitly validated model/service-tier configuration, and missing/blank config failure before any request handler can reserve or mark provider usage in `supabase/functions/_shared/sms-ai/sms-ai-provider-factory.test.ts`.
- [x] T017 [P] [US2] Add a focused future-adapter replaceability regression to `supabase/functions/_shared/parse-sms-handler.test.ts` using a test-only provider-neutral executor result to prove a future raw adapter can be substituted without changing safeguards, reconciliation, semantic-validation ownership, or the public result shape; avoid duplicating T009's response-semantics assertions.

### Implementation for User Story 2

- [x] T018 [US2] Implement `createSmsAiProvider` as the single configuration-to-raw-adapter factory in `supabase/functions/_shared/sms-ai/sms-ai-provider-factory.ts`, supporting only `deepinfra` initially and failing closed for any unsupported provider.
- [x] T019 [US2] Replace Gemini-specific initialization, retry/completion helpers, prompt/schema ownership, and hardcoded model usage in `supabase/functions/parse-sms/index.ts` with module-initialized `readSmsAiProviderConfig`, `createSmsAiProvider`, and `executeSmsAiProvider`, then inject the normalized executor through `createParseSmsHandler({ executeProvider })`; resolve configuration before the request handler is constructed so invalid config cannot reserve/consume SMS allowance or mark provider start, while auth/consent/safeguards/fingerprints/negative outcomes/reconciliation/telemetry ordering remains unchanged.
- [x] T020 [US2] Remove `@google/genai` from `supabase/functions/parse-sms/deno.json` after `parse-sms/index.ts` no longer imports it; keep `@google/genai` intact in `supabase/functions/deno.json`, `supabase/functions/parse-voice/deno.json`, and `supabase/functions/enrich-sms-categories/deno.json`.
- [x] T021 [P] [US2] Replace stale Gemini-specific SMS full-parser comments/rate-limit wording with provider-neutral language in `apps/mobile/services/ai-sms-parser-service.ts` without changing runtime behavior or the mobile request/response contract.
- [x] T022 [US2] Bring `supabase/functions/_shared/sms-ai/sms-ai-provider-factory.test.ts`, `supabase/functions/_shared/parse-sms-handler.test.ts`, and `supabase/functions/parse-sms/index.ts` checks to Green, then run `deno check supabase/functions/parse-sms/index.ts` and verify the feature diff contains no behavioral edits to `supabase/functions/parse-voice/index.ts`.

**Checkpoint**: US1 + US2 form the deployable P1 MVP: SMS uses configured DeepInfra/DeepSeek, while the client/safeguard/voice contracts remain unchanged.

---

## Phase 5: User Story 3 — Reduce Recurring SMS AI Cost Without Weakening Correctness (Priority: P2)

**Goal**: Maximize DeepInfra automatic prefix-cache eligibility and expose privacy-safe cache/cost metadata without making SMS correctness depend on cache state.

**Independent Test**: Build two requests with different category/SMS tails and prove their first stable system message is identical; simulate cache-hit and cache-miss usage metadata and verify both produce identical validated Monyvi results while logs contain only aggregate metadata.

### Tests for User Story 3

- [x] T023 [US3] Extend `supabase/functions/_shared/sms-ai/sms-ai-prompt.test.ts` with failing cache-layout/isolation tests proving stable Monyvi rules, unchanged supported-currency context, and built-in categories are byte-identical and ordered first across users; future custom-category context is a separate dynamic tail before SMS content; request SMS content is last; and feature 388 emits no explicit `prompt_cache_key` or `prompt_cache_options`.
- [x] T024 [US3] Extend `supabase/functions/_shared/sms-ai/providers/deepinfra-sms-provider.test.ts` with failing automatic-cache observability/privacy tests for `usage.prompt_tokens_details.cached_tokens`, prompt/completion token counts, actual service tier, and estimated cost while asserting the request sends neither `prompt_cache_key` nor `prompt_cache_options` and logs never contain raw SMS body, full prompt text, credentials, or provider error bodies.

### Implementation for User Story 3

- [x] T025 [US3] Refine `supabase/functions/_shared/sms-ai/sms-ai-prompt.ts` and request assembly in `supabase/functions/_shared/sms-ai/sms-ai-provider-executor.ts` so the request order is stable rules + unchanged supported currencies + built-in categories -> future user-specific custom-category context -> SMS batch, preserving instruction authority and existing transaction/schema semantics.
- [x] T026 [US3] Add privacy-safe aggregate DeepInfra usage/cache telemetry to `supabase/functions/_shared/sms-ai/providers/deepinfra-sms-provider.ts`; rely only on automatic prefix caching, send neither `prompt_cache_key` nor `prompt_cache_options`, and do not make a cache hit a success criterion.
- [x] T027 [US3] Bring caching/telemetry cases in `supabase/functions/_shared/sms-ai/sms-ai-prompt.test.ts` and `supabase/functions/_shared/sms-ai/providers/deepinfra-sms-provider.test.ts` to Green, proving cache-hit and cache-miss fixtures yield equivalent validated provider results.

**Checkpoint**: The stable prefix is cache-friendly and observable, but financial correctness is identical when no cache is available.

---

## Phase 6: Polish, Regression, Manual QA & Pre-Production Rollout

**Purpose**: Finish cross-cutting documentation, verification, cost checks, and hosted pre-production configuration after all desired stories are Green.

- [x] T028 [P] Verify `docs/business/business-decisions.md` retains the provider-neutral SMS safeguard QA wording from planning while the separate Voice Entry section still states Gemini 2.5 Flash-Lite; correct only stale SMS-provider wording if implementation introduced any.
- [x] T029 [P] Update `specs/388-sms-ai-provider/quickstart.md` if final file names/commands differ from implementation, including exact local/hosted variables, deterministic test commands, cache verification, deployment, and rollback steps.
- [x] T030 Run the focused provider suite via the `test:sms-ai-provider` script in `package.json` plus `supabase/functions/_shared/parse-sms-handler.test.ts` and `supabase/functions/_shared/sms-input-estimator.test.ts`, then run existing SMS safeguard/special-case/hard-exclusion suites referenced by `specs/388-sms-ai-provider/quickstart.md`; all routine tests must consume zero real provider allowance.
- [x] T031 Run scoped TypeScript/Deno/lint/format/diff verification for `supabase/functions/_shared/sms-ai/`, `supabase/functions/parse-sms/index.ts`, `supabase/functions/parse-sms/deno.json`, `supabase/functions/deno.json`, `apps/mobile/services/ai-sms-parser-service.ts`, and `package.json`; resolve only failures attributable to feature 388.
- [ ] T032 Perform the representative manual SMS matrix in `specs/388-sms-ai-provider/quickstart.md` for purchase, outgoing/incoming transfer, salary, ATM, foreign currency, promotion, OTP/security, legitimate empty result, invalid provider fixture, and transient failure; record any mismatch before deployment.
- [ ] T033 Perform one explicit development-only DeepInfra automatic-cache/cost verification following `specs/388-sms-ai-provider/quickstart.md`: inspect `cached_tokens`/usage metadata on repeated requests with identical rules/currencies/built-in-category prefix and differing custom-category/SMS tails, confirm no explicit cache key/options are sent, and confirm current published Standard pricing still satisfies SC-003 without counting cache savings; do not convert this into a Gemini-vs-DeepSeek quality benchmark.
- [ ] T034 Configure hosted Supabase values and deploy only `parse-sms` according to `specs/388-sms-ai-provider/quickstart.md`, then smoke-test the unchanged public contract in `specs/388-sms-ai-provider/contracts/parse-sms.openapi.yaml`; do not deploy or modify `parse-voice` as part of feature 388.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 — Setup**: No dependencies; T001–T003 may run in parallel.
- **Phase 2 — Foundational**: Depends on Phase 1. T004/T005 can start in parallel; T007 depends on T004, T008 depends on T005, and T009 depends on T006.
- **Phase 3 — US1**: Depends on all foundational tasks. T011 must precede T012 because both edit the same provider test file; T013 can run in parallel with T011/T012; T014 starts only after the Red raw-adapter tests exist; T015 depends on T014 and T013 because it implements the provider-neutral semantic executor.
- **Phase 4 — US2**: Depends on US1's concrete adapter + provider-neutral executor. T016 and T017 can start in parallel; T018 depends on T016; T019 depends on T018 and US1 T015; T020 follows T019.
- **Phase 5 — US3**: Depends on US1 request construction. T023 and T024 can begin in parallel because they edit different test files; T025 follows T023; T026 follows T024 and T025.
- **Phase 6 — Polish/Rollout**: Depends on every story selected for release. Deployment T034 is last.

### User Story Dependencies

- **US1 (P1)**: Independently proves DeepInfra implements the Monyvi SMS provider contract using mocked network integration.
- **US2 (P1)**: Depends on the US1 DeepInfra adapter because it selects/wires that concrete adapter. Together US1+US2 are the deployable MVP.
- **US3 (P2)**: Depends on US1 request construction but does not change US1/US2 correctness; it adds cache-friendly ordering and aggregate observability.

### Within Each Story

- Red tests MUST be committed/written before the corresponding Green implementation.
- Provider request/envelope behavior is proven before production composition is switched.
- External DeepInfra envelope validation happens inside the raw adapter before inner JSON parsing.
- Inner JSON parsing and existing Monyvi semantic validation remain in the provider-neutral executor after provider structured output.
- Production wiring is complete before provider-specific import-map cleanup.
- Cache/cost optimization happens only after P1 provider correctness is Green.

---

## 2026-10-01 Approved Mixed-Row Follow-up

The product owner explicitly superseded whole-batch semantic rejection for a
structurally valid complete provider response.

- [ ] T035 SOURCE-REVIEW-BLOCKED: narrow English/Arabic OTP/security-only
      pre-provider exclusions with shared/Edge parity and completed-payment
      escape behavior require the separate backend writer's confirmed follow-up.
      The UI lane does not reopen or integrate backend corrections.
- [x] T036 Tighten the stable full-parser prompt so emitted rows represent only
      completed positive-amount transactions and never OTP/fake/zero-amount
      placeholders.
- [x] T037 Partition provider transaction validation per entry, preserving valid
      unique submitted peers while carrying rejected identity evidence internally.
- [x] T038 Keep rejected/duplicate/uncertain candidates unresolved with fresh
      retry identity and exclude them from durable negative-outcome
      reconciliation; unknown returned identity disables omission-negative
      inference for uncertain submitted candidates. Provider-started usage
      accounting remains consumed.
- [x] T039 Preserve the public parse-sms response fields; represent candidate-
      level rejected work through `unresolvedFingerprints` and optional
      `retryRequestMode: fresh`.
- [ ] T040 Deferred by explicit product-owner trial instruction: add deterministic
      regression tests for mixed valid+zero-amount OTP output, all-invalid rows,
      duplicate/unknown/missing identities, invalid category/currency/date,
      negative-cache pollution, valid prior-negative clearing, prompt/OTP
      filtering, and mobile mixed-200 preservation; then run focused tests,
      strict TypeScript, lint, formatting, and device/manual verification before
      release readiness is claimed.

## 2026-10-02 Approved Development-Only Synthetic Evaluation UI

The lead maps SMS-EVAL-UI-001 as T041–T047. Source implementation does not mark
these tasks verified/completed; checkbox state remains open until the mapped
verification/integration owner supplies evidence.

- [ ] T041 Shared runtime-safe corpus/scorer reuse: canonical synthetic templates,
      expectations and final scorer live under
      `packages/logic/src/sms-provider-evaluation/`; CLI production wrappers
      consume that source and mobile injects the canonical runtime fingerprint.
      Source implementation present; verification deferred.
- [ ] T042 Guarded mobile evaluation service + hook: exact staging
      `yulbcndyssdjicbpmlrk`, current authenticated user, normal AI consent and
      safeguards, sequential batches of five, fresh run/batch identities,
      synchronous duplicate-start lock, user pinning before every request/retry,
      cancel/back/blur/unmount/logout/account-change cancellation, partial result
      preservation while mounted, and no automatic retry/resume. Source
      implementation present; verification deferred.
- [ ] T043 Development Settings entry + private results route: existing-style
      Development tools row, `__DEV__` + exact-staging + authenticated
      visibility, independent route/service refusal, and no network on
      entry/focus. Source implementation present; verification deferred.
- [ ] T044 Results overview/inline comparisons/running/cancelled/fatal/i18n/
      responsive states: one PageHeader route, All/Issues, FlatList, runtime
      counts, canonical matched/mismatched/not-evaluated summary, expandable full
      synthetic message/expected/final fields, no raw-output accuracy claim,
      dark/RTL/enlarged-text/safe-area/accessibility behavior. Source
      implementation present; verification deferred.
- [ ] T045 Approved mockup/spec/manual-QA documentation: preserve
      `mockups/sms-results-page.svg` + binding, record 2026-10-02 approval,
      update the former no-UI scope notes, and document the deferred QA/manual
      plan. Source documentation present; verification deferred.
- [ ] T046 FUTURE LOCAL OWNER: import the authoritative approved PNG with
      sha256 `b071fb29955520dbc0fc856d238ec144c482cebe36efe451596308555448beeb`,
      reconcile later backend integration without overwriting either lane, and
      preserve the approved SVG/binding. Not owned by this remote UI worker.
- [ ] T047 DEFERRED BY PRODUCT OWNER FOR CURRENT TRIAL: add/run the UI
      unit/integration/E2E coverage, focused existing evaluator regression,
      TypeScript, lint, format, CI, physical/emulator device QA, EN/AR/RTL,
      compact/tablet/orientation/enlarged-text checks, and side-by-side/overlay
      visual comparison against the approved PNG. Do not claim these checks from
      source inspection.

**Dependencies**: T041 -> T042 -> T043/T044; T045 accompanies final source.
T046 and T047 are successor work and must not be marked satisfied by this lane.

---

## Parallel Opportunities

### Setup

```text
T001 parse-sms Deno Zod mapping
T002 shared Deno Zod mapping
T003 package test script
```

All three touch different files and can run concurrently.

### User Story 1

```text
Track A:
  T011 -> T012 -> T014
  DeepInfra raw contract/failure tests -> raw adapter

Track B:
  T013
  Handler + mocked DeepInfra integration Red coverage

Join:
  T015
  Provider-neutral JSON + semantic-validation executor
```

### User Story 2

```text
Track A:
  T016 -> T018 -> T019 -> T020
  Factory Red -> factory -> production wiring -> import cleanup

Track B:
  T017
  Future-provider handler compatibility regression

Track C:
  T021
  Provider-neutral mobile comments

Join:
  T022
```

### User Story 3

```text
Track A:
  T023 -> T025
  Stable-prefix Red coverage -> prompt/request ordering

Track B:
  T024
  Usage/cache privacy Red coverage

Join:
  T026 -> T027
```

---

## Implementation Strategy

### Deployable MVP

Because both first stories are P1 and production selection needs the concrete adapter plus factory wiring:

1. Complete Phase 1.
2. Complete Phase 2.
3. Complete US1 and prove DeepInfra correctness with mocked integration.
4. Complete US2 and switch the production SMS composition to configuration-based DeepInfra.
5. Run the relevant Phase 6 regression/manual QA gates.
6. At this point the **US1 + US2** P1 MVP can be reviewed/deployed independently of caching optimization.

### Incremental Delivery

1. **Foundation** -> provider-neutral types/config/prompt boundaries.
2. **US1** -> DeepInfra provider implementation proven against Monyvi's existing contract.
3. **US2** -> configuration/factory production switch; maintainable future replacement.
4. **US3** -> stable-prefix cache optimization + aggregate usage observability.
5. **Polish/Rollout** -> complete regression, cost, manual QA, hosted config, deploy.

### Scope Guardrails

Do not add during feature 388:

- voice provider/usage-limit implementation (tracked separately in GitHub issue #347);
- automatic Gemini fallback;
- Gemini-vs-DeepSeek quality benchmarking/shadow traffic;
- custom category creation;
- database schema changes;
- mobile API contract changes;
- generic all-capability AI provider abstractions;
- Unrelated production UI/mockup changes. The explicitly approved
  development-only synthetic evaluation Settings/results surface is the sole
  exception.

---

## Notes

- [P] tasks operate on different files or independent test surfaces and have no incomplete dependency.
- One mockup-backed development-only UI exception is now in scope under T043–T045.
  Visual/device/accessibility verification is explicitly deferred to T047 and
  must not be inferred from source implementation.
- The canonical public API remains `specs/388-sms-ai-provider/contracts/parse-sms.openapi.yaml`.
- The authoritative implementation/QA guidance remains `specs/388-sms-ai-provider/quickstart.md`.
- Stop on any new product/financial/schema/sync decision instead of inventing behavior.

## Evidence (HEAD 920a65f2, `codex/pr349-edge`, clean tree, verified 2026-09-27)

- T015/T027/T030: `test:sms-ai-provider` 35/35 Green (incl. cache-hit/cache-miss equivalence and aggregate-only telemetry); `parse-sms-handler.test.ts` 42/42 Green; `sms-input-estimator.test.ts` 5/5 Green; `test:sms-parser-special-cases`, `test:sms-hard-exclusions`, `test:sms-safeguards` Green (exit 0, zero production provider calls).
- T022: factory/handler suites Green; feature diff vs `main` contains no edits under `supabase/functions/parse-voice/` or `enrich-sms-categories/`. Deno Green: `C:\Users\Mohamed\.deno\bin\deno.exe check --no-lock parse-sms/index.ts` (2.9.7, run from `supabase/functions`) exits 0 with no errors.
- T031 Green (corrected 2026-09-27): Deno `check --no-lock parse-sms/index.ts` exits 0; scoped `tsc --noEmit` shows zero errors in feature scope (3 remaining repo errors are outside scope: 2 metals-test `USER_ID` redeclarations, 1 `push-service.ts` readonly-index error); scoped ESLint clean (`supabase/functions/` is eslint-ignored by repo config; mobile parser service clean); `prettier --check` clean across all feature files after a formatting-only pass over the 4 feature test files (line-wrap/blank-line changes only, `test:sms-ai-provider` re-run 35/35 Green); parse-voice diff empty.
- Not witnessed: T032 (no adb device); T033 (no dev DeepInfra credential/live cache check); T034 (no deployment approval). Device E2E remains CI-skipped/manual-only — no device E2E claimed.
- T010 Red→Green: Red witnessed in separate same-drive historical checkout — config suite at 66339fb3 exits 1 (missing `./sms-ai-provider-config.ts`); prompt suite at 821da860 exits 1 (missing `./sms-ai-prompt.ts`); handler regression at 6e3cf8b0 was Green at test addition (39/39), not Red. Green at head 36b5b902: `npx tsx --test` config + prompt + handler suites together passes 59/59.
- T012 follow-up (PR #349, start 61f6e324): explicit mocked HTTP 408 retry + thrown timeout AbortError retry added to `deepinfra-sms-provider.test.ts` with deterministic injected fake sleep (no real timers/provider calls); production `deepinfra-sms-provider.ts` unchanged — new cases pass against existing retry classification and would fail on 408/timeout-retry regression. T021 follow-up: Gemini-specific comments at `ai-sms-parser-service.ts` ~131/~676 replaced with provider-neutral wording, no runtime change. T013 honest state: reopened ([ ]) — mocked full-path provider exhaustion deferred to GitHub issue #352.
