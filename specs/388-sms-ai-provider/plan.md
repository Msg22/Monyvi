# Implementation Plan: Configurable SMS AI Provider

**Branch**: `388-sms-ai-provider` | **Date**: 2026-09-26 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/388-sms-ai-provider/spec.md`

**Note**: This plan is produced through the repository's `speckit.plan` workflow. It stops before task generation or production implementation.

## Summary

Replace the SMS full-parser's Gemini-specific provider code with a configuration-selected SMS provider boundary whose initial implementation calls DeepInfra's `deepseek-ai/DeepSeek-V4-Flash-0731` model. Reuse the existing provider-neutral handler contract, preserve every current SMS safeguard/client/result invariant, enforce strict structured output plus Monyvi's existing semantic validator, and arrange prompts for DeepInfra's automatic prefix caching. Voice remains on Gemini and is not changed.

The implementation uses Strategy + Adapter + Factory + Dependency Injection:

- the existing SMS handler depends only on `SmsProviderExecutionResult`;
- a typed factory resolves the configured raw SMS provider adapter;
- a provider-neutral Monyvi executor owns prompt/schema construction, JSON parsing, and authoritative financial semantic validation;
- a DeepInfra adapter owns only provider HTTP/auth/request-envelope serialization, timeout/retry, external-envelope validation, and completion normalization;
- Monyvi owns prompts, response schema, financial validation, safeguards, reconciliation, and telemetry.

No database migration or mobile API-contract change is required.

## Technical Context

**Language/Version**: TypeScript ~5.9.2 in strict mode; Deno-based Supabase Edge Functions  
**Primary Dependencies**: `@supabase/supabase-js@^2.49.1`, Zod 4.4.3, native Fetch/AbortController, existing SMS shared modules; DeepInfra OpenAI-compatible Chat Completions API (no new provider SDK)  
**Storage**: N/A  
**Testing**: Node `tsx --test` for shared Edge modules, existing SMS safeguard/parser suites, mocked provider fetch fixtures, `deno check`, scoped lint/format checks, representative manual SMS QA  
**Target Platform**: Supabase Edge Functions (Deno) serving the existing Android/iOS Monyvi client  
**Project Type**: Mobile + serverless API monorepo; this feature changes the server-side SMS full-parser provider boundary plus provider-specific documentation/comments  
**Performance Goals**: Preserve the existing maximum 50-candidate request and complete normal SMS chunks within the current Edge Function budget; bound each provider attempt to 25 seconds; retain the existing 2s/4s/8s retry delays; use Standard tier initially; avoid reasoning-token overhead  
**Constraints**: >=30% projected provider cost reduction at equal token counts before cache savings; fail closed on invalid configuration/output; no automatic provider fallback; no raw SMS/prompt/provider-error-body logging; cache hits are optional and must not affect correctness; voice unchanged  
**Scale/Scope**: One initial SMS provider/model; <=50 messages/request, <=64 supported currencies structurally, <=32,000 estimated input tokens/request, existing 200-unit rolling/day SMS safeguard policy unchanged

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Constitution principle / hard rule | Status | Plan evidence |
| --- | --- | --- |
| I. Offline-First Data Architecture | PASS | SMS AI import is already an explicitly online parsing capability. This change adds no user-facing storage dependency and does not change WatermelonDB authority for persisted financial data. |
| II. Documented Business Logic | PASS WITH REQUIRED DOC SYNC | The provider change introduces no new financial rule, but existing SMS safeguard QA text names Gemini. The plan updates that wording to "configured SMS AI provider" before production implementation; the Voice Entry business decision remains Gemini-specific. |
| III. Type Safety | PASS | Provider config uses explicit readonly types; DeepInfra envelopes are runtime-validated with Zod 4.4.3; inner financial payload still passes the existing semantic validator; no `any` or non-null assertions are required. |
| IV. Service-Layer Separation | PASS | Strategy/Adapter/Factory keeps provider mechanics out of the handler. Existing handler owns orchestration; existing validators own financial response validation. |
| V. Premium UI / Theming | PASS / NOT TOUCHED | No user-facing UI or mockup changes are in scope. |
| VI. Monorepo Package Boundaries | PASS | Work remains in `supabase/functions`, existing mobile service comments, docs, and tests. No new reverse package dependencies. |
| VII. Local-First Migrations | PASS / NOT APPLICABLE | No schema/DDL change. |
| VIII. Authenticated Scope & Sync Correctness | PASS | Existing auth, consent, canonical fingerprints, user-scoped safeguards, reservations, negative outcomes, and reconciliation remain unchanged and execute before/after provider execution as today. |
| External API runtime validation | PASS | Zod validates the DeepInfra response envelope; existing `parseSmsProviderTransactions` validates the financial payload. |
| Implementation-aligned documentation | PASS | Plan includes business-decision and stale Gemini-comment cleanup without changing the separate voice provider. |
| SOLID / composition / DI | PASS | Existing injected `executeProvider` seam is formalized; handler depends on capability contract rather than concrete DeepInfra implementation. |
| Privacy / secrets | PASS | DeepInfra token remains hosted server secret; provider URL is fixed in code; logs exclude SMS/prompt/error bodies. |

**Gate result**: PASS. No constitutional violation requires a Complexity Tracking exception.

### Post-design re-check

Phase 1 introduces no persistent schema, new mobile API, user-flow, or UI surface. The runtime objects in [data-model.md](./data-model.md) remain server-side/provider-boundary types, and [contracts/parse-sms.openapi.yaml](./contracts/parse-sms.openapi.yaml) explicitly preserves the current public request/response contract. Constitution gate remains PASS.

## Phase 0: Research Decisions

Full rationale is in [research.md](./research.md).

Key decisions:

1. DeepInfra direct + `deepseek-ai/DeepSeek-V4-Flash-0731`, Standard tier.
2. Native `fetch` adapter instead of a new OpenAI SDK dependency.
3. Typed SMS-specific Strategy/Adapter plus configuration factory.
4. Fixed DeepInfra endpoint; provider/model/service tier + API key are all explicit required hosted/local configuration and are resolved before request admission.
5. Strict DeepInfra JSON Schema output plus provider-neutral Monyvi semantic validation outside the DeepInfra adapter.
6. `reasoning_effort: "none"`.
7. Automatic prefix caching only; no explicit `prompt_cache_key` or retention TTL in this release.
8. Existing 3-retry/2s-4s-8s shape retained with a 25-second per-attempt timeout.
9. DeepInfra response envelope validated with exact Zod 4.4.3.
10. No schema/client/voice changes.

No unresolved planning questions remain.

## Phase 1: Design

### Provider composition

```text
parse-sms/index.ts
        |
        +-- existing auth / consent / safeguards / reconciliation
        |
        v
readSmsAiProviderConfig()  # module initialization; before request admission
        |
        v
createSmsAiProvider()
        |
        v
SmsAiProvider raw adapter
        |
        +-- DeepInfraSmsProvider
                |
                +-- fixed DeepInfra endpoint
                +-- provider request-envelope serialization
                +-- reasoning disabled
                +-- Standard/priority/flex mapping
                +-- timeout/retry classification
                +-- Zod external-envelope validation
                +-- completion normalization
                +-- raw content string
        |
        v
executeSmsAiProvider()  # provider-neutral Monyvi executor
        |
        +-- build stable/dynamic prompt + strict response schema
        +-- parse inner JSON
        +-- existing parseSmsProviderTransactions()
        |
        v
SmsProviderExecutionResult
```

### Prompt composition

Provider-independent prompt construction is split so stable material remains the common prefix:

```text
message 1 (system)
  stable Monyvi rules
  transaction/exclusion/trust rules
  supported-currency context when unchanged
  built-in category definitions
        |
        | automatic prefix-cache opportunity
        v
message 2 (system, optional/dynamic)
  future user-specific custom categories only
        |
        v
message 3 (user)
  current SMS batch
```

Supported currencies remain enforced in the strict response schema and authoritative Monyvi validator. The current full category context must be normalized so code-owned built-ins stay before any future custom-category additions; custom categories are not part of the stable shared prefix.

### Structured-output contract

The current response-schema builder is moved/treated as provider-neutral Monyvi schema material. The provider-neutral executor supplies it to the DeepInfra adapter, which serializes it using:

```text
response_format.type = json_schema
json_schema.strict = true
```

The DeepInfra adapter never calls or owns `parseSmsProviderTransactions`; the provider-neutral Monyvi executor parses the returned JSON and applies `parseSmsProviderTransactions` before constructing `SmsProviderExecutionResult`.

### Provider completion/error contract

```text
HTTP/network layer
  408 / 429 / 5xx / network / timeout -> retry
  400 / 401 / 403 / 404              -> fail immediately

provider finish reason
  stop    -> complete
  length  -> truncated
  explicit content/safety stop -> safety_stopped
  unknown -> failed

complete envelope/content
  -> JSON parse
  -> Monyvi semantic validator
  -> existing handler completion/reconciliation
```

### Caching

DeepInfra's automatic prefix caching is the only caching mechanism used in this release. Stable Monyvi rules, unchanged supported-currency context, and built-in category definitions come first; future user-specific custom categories follow; SMS content remains last. Cache usage is observable through privacy-safe usage metadata.

No feature behavior depends on a cache hit. The implementation MUST NOT send `prompt_cache_key` or `prompt_cache_options` in feature 388. A future explicit-cache-key/retention decision requires separate evidence and planning.

### Configuration

```text
DEEPINFRA_API_KEY=<secret>
SMS_AI_PROVIDER=deepinfra
SMS_AI_MODEL=deepseek-ai/DeepSeek-V4-Flash-0731
SMS_AI_SERVICE_TIER=default
```

All four values are required and validated during module/provider composition before the per-request SMS handler can reserve or mark provider usage. Missing, blank, or unsupported configuration fails closed before request admission. `default` means omit DeepInfra's `service_tier` request field. Priority and Flex remain valid typed operational choices but are not the initial setting.

### Dependency resolution

- Root already pins `zod: 4.4.3`.
- `supabase/functions/parse-sms/deno.json` will map `zod` to `npm:zod@4.4.3`.
- Shared `supabase/functions/deno.json` will add the same exact Zod mapping for shared/IDE resolution.
- `@google/genai` is removed from **parse-sms's** Deno import map only.
- Shared/global Google GenAI mapping remains because `parse-voice` and `enrich-sms-categories` still use Gemini.

### Public contract

[contracts/parse-sms.openapi.yaml](./contracts/parse-sms.openapi.yaml) records the existing `parse-sms` mobile/Edge contract. Provider/model/cache/service-tier metadata remains internal and is not added to the mobile response.

### Persistent data

[data-model.md](./data-model.md) confirms there is no database migration. All new "entities" are typed runtime objects only.

### Developer/QA path

[quickstart.md](./quickstart.md) defines:

- local/hosted environment setup;
- deterministic no-real-provider automated testing;
- provider error/structured-output/cache cases;
- existing safeguard regression commands;
- manual representative SMS QA;
- deployment and rollback.

## Project Structure

### Documentation (this feature)

```text
specs/388-sms-ai-provider/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
└── contracts/
    └── parse-sms.openapi.yaml
```

### Source Code (repository root)

Planned implementation paths:

```text
supabase/functions/
├── _shared/
│   ├── parse-sms-handler.ts                     # existing provider-neutral orchestration; minimal/no behavior change
│   ├── parse-sms-handler.test.ts                # existing regression contract
│   ├── sms-provider-transaction-validator.ts    # existing authoritative financial validator
│   ├── sms-input-estimator.ts                   # existing dynamic SMS user-prompt helper
│   └── sms-ai/
│       ├── sms-ai-provider.ts                   # raw Strategy contract + normalized Monyvi provider-result types
│       ├── sms-ai-provider-config.ts            # typed fail-closed environment parsing
│       ├── sms-ai-provider-config.test.ts
│       ├── sms-ai-provider-factory.ts           # configuration -> concrete raw adapter
│       ├── sms-ai-provider-factory.test.ts
│       ├── sms-ai-provider-executor.ts          # provider-neutral prompt/JSON/semantic validation -> handler result
│       ├── sms-ai-prompt.ts                     # stable built-ins/currencies + future custom tail + response schema
│       ├── sms-ai-prompt.test.ts
│       └── providers/
│           ├── deepinfra-sms-provider.ts        # HTTP, timeout/retry, external envelope, completion normalization
│           └── deepinfra-sms-provider.test.ts
├── parse-sms/
│   ├── index.ts                                 # composition/wiring; no concrete Gemini provider
│   └── deno.json                                # zod mapping; remove parse-sms Google SDK dependency
└── deno.json                                    # exact zod mapping for shared/IDE resolution

apps/mobile/services/
└── ai-sms-parser-service.ts                     # provider-neutral stale comment cleanup only

docs/business/
└── business-decisions.md                        # provider-neutral SMS safeguard QA wording

package.json                                      # focused provider test script if useful
```

**Structure Decision**: Keep the established Supabase Edge Function/shared-module layout. Introduce one focused `_shared/sms-ai/` capability directory because provider configuration, prompt construction, factory selection, and provider HTTP adaptation are cohesive server-side SMS concerns. Do not relocate safeguards, reconciliation, fingerprinting, or mobile business logic.

## Planned Implementation Sequence

This is sequencing guidance for later `speckit.tasks`; no implementation occurs in this command.

1. Add failing configuration/factory/prompt/provider tests first.
2. Add exact Zod Deno mappings required by the external-boundary validator.
3. Extract provider-independent stable prompt/schema construction with built-in/currency context before future custom-category context, without changing semantic rules or conservative input-token accounting.
4. Implement fail-closed SMS provider configuration and resolve it during module composition before request admission/provider-start accounting.
5. Implement the DeepInfra raw adapter with injected/mockable fetch, timeout, retry classification, strict structured output serialization, reasoning disabled, completion mapping, and Zod external-envelope validation.
6. Implement the provider-neutral Monyvi executor that parses the provider content and applies `parseSmsProviderTransactions`, then wire that executor through the existing `createParseSmsHandler` dependency.
7. Remove Gemini-specific code/import from `parse-sms` only.
8. Update provider-specific SMS comments/business QA wording.
9. Run focused provider tests, existing handler/safeguard/parser tests, `deno check`, lint/format/diff checks.
10. Perform representative manual QA using the quickstart matrix.
11. Configure hosted Supabase provider variables and deploy `parse-sms` only after verification.

## Verification Gates

Implementation is not complete until all are true:

- no routine automated test makes a real DeepInfra/Gemini SMS full-parser call;
- invalid provider/model/service-tier/credential config fails before request admission, network execution, reservation, or provider-start accounting;
- strict DeepInfra external-envelope validation and provider-neutral Monyvi semantic transaction validation both pass/fail as intended;
- valid empty transaction arrays are accepted;
- transient internal provider retries remain bounded while one logical admitted request records exactly one provider start;
- input-token estimation still counts stable prompt, category context, response schema, and SMS candidate content exactly once after prompt refactoring;
- existing safeguards/negative outcomes/client response semantics pass unchanged;
- automatic-cache hit and miss produce equivalent functional results;
- projected Standard-tier cost remains >=30% below Gemini text baseline at equal token counts;
- voice files and voice behavior are unchanged;
- `docs/business/business-decisions.md` no longer falsely identifies Gemini as the SMS full-parser provider in routine QA wording.

## Complexity Tracking

No constitutional violations or exceptional complexity are required.
