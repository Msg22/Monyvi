# Research: Configurable SMS AI Provider

**Feature**: 388-sms-ai-provider  
**Date**: 2026-09-26  
**Status**: Complete — no unresolved planning clarifications

## R-001: Initial SMS provider and model

**Decision**: Use DeepInfra directly with `deepseek-ai/DeepSeek-V4-Flash-0731` as the initial SMS full-parser provider/model.

**Rationale**:

- The product owner already approved this provider/model for direct SMS replacement.
- DeepInfra exposes the model through an OpenAI-compatible chat-completions endpoint.
- The model supports strict JSON-schema structured output and prompt caching.
- Current published Standard pricing is $0.06 / 1M input tokens, $0.18 / 1M output tokens, and $0.015 / 1M cached input tokens.
- Gemini 2.5 Flash-Lite text pricing is currently $0.10 / 1M input and $0.40 / 1M output. At equal SMS token counts, DeepSeek Standard is 40% cheaper on input and 55% cheaper on output before any cache discount, satisfying the specification's >=30% projected reduction target.

**Alternatives considered**:

- Keep Gemini for SMS: rejected because this feature exists specifically to reduce SMS AI cost and make provider changes easier.
- OpenRouter/Hugging Face gateway: broader routing but unnecessary extra indirection for the first provider.
- Automatic fallback to Gemini: explicitly out of scope for the pre-production migration.

**Sources**:

- DeepInfra model/API: https://deepinfra.com/deepseek-ai/DeepSeek-V4-Flash-0731/api
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing

## R-002: Provider integration mechanism

**Decision**: Implement the DeepInfra adapter with the standard Fetch API rather than adding an OpenAI client SDK dependency to `parse-sms`.

**Rationale**:

- The provider surface needed by Monyvi is narrow: one chat-completions POST with structured output, service tier, reasoning setting, and cache metadata.
- Native `fetch` is already available in Supabase Edge Functions and gives direct control over timeout/cancellation, HTTP status classification, and privacy-safe error handling.
- The adapter remains replaceable behind the existing provider-neutral handler seam.
- Avoids introducing an SDK whose abstraction is broader than this feature requires.

**Alternatives considered**:

- OpenAI SDK pointed at DeepInfra: valid and supported, but adds a provider-client dependency where native fetch is sufficient.
- Put HTTP logic in `parse-sms/index.ts`: rejected because it would preserve the provider coupling this feature is intended to remove.

## R-003: Provider architecture

**Decision**: Formalize the existing injected `executeProvider` seam as an SMS-specific Strategy/Adapter boundary with a small configuration-driven factory.

**Rationale**:

- `createParseSmsHandler` is already provider-neutral and consumes `SmsProviderExecutionResult`.
- Provider-specific authentication, request serialization, response-envelope validation, finish-reason mapping, and retry classification can move behind one adapter without changing safeguards, reconciliation, mobile contracts, or voice.
- A capability-specific interface avoids an over-generalized all-AI abstraction.

**Alternatives considered**:

- Generic `AiProvider` shared by voice/SMS: rejected because audio-native voice and text-only SMS have materially different contracts and failure modes.
- Hardcode DeepInfra in `parse-sms/index.ts`: rejected because future provider replacement would again require editing orchestration code.

## R-004: Runtime configuration

**Decision**: Read and validate these hosted/local values centrally:

- `SMS_AI_PROVIDER=deepinfra`
- `SMS_AI_MODEL=deepseek-ai/DeepSeek-V4-Flash-0731`
- `SMS_AI_SERVICE_TIER=default`
- `DEEPINFRA_API_KEY=<secret>`

The DeepInfra API endpoint remains a code constant, not runtime configuration.

**Rationale**:

- Provider/model/tier can change without scattering branching logic.
- The API key remains server-only.
- Fixing the endpoint in code prevents a configuration mistake from redirecting financial SMS content to an arbitrary host.
- Missing/invalid configuration can fail closed before sending user content.

**Alternatives considered**:

- Config file bundled with the function: rejected because hosted changes would require source redeployment and secrets must remain separate.
- Configurable endpoint URL: rejected on privacy/security grounds.

## R-005: Service tier

**Decision**: Use Standard scheduling initially. Represent `default | priority | flex` in configuration, but omit `service_tier` from the DeepInfra request when configured as `default`.

**Rationale**:

- DeepInfra documents omission as Standard scheduling/pricing.
- Priority adds a 50% surcharge and is not justified for background-ish SMS chunk parsing.
- Flex is 20% cheaper but may wait up to 10 minutes under capacity pressure, which does not fit the existing user-driven SMS import flow.
- Keeping the tier typed/configurable preserves an operational switch without a code rewrite.

**Alternatives considered**:

- Priority by default: unnecessary cost.
- Flex by default: unacceptable worst-case queue latency for this flow.

**Source**: https://deepinfra.com/docs/chat/overview

## R-006: Structured output

**Decision**: Request strict JSON Schema output from DeepInfra and continue treating `parseSmsProviderTransactions` as the authoritative semantic validator.

**Rationale**:

- DeepInfra explicitly supports `response_format.type = "json_schema"` with `strict: true` for this model.
- Provider-side schema enforcement reduces shape errors but does not prove business validity.
- Existing Monyvi validation still enforces amount, currency, direction, date, category, confidence, trust, ATM flag, and card-suffix rules.
- A valid `transactions: []` response remains a successful parse.

**Alternatives considered**:

- `json_object` mode: weaker shape guarantees.
- Trust provider schema without local validation: rejected for financial safety.

**Source**: https://deepinfra.com/docs/chat/structured-outputs

## R-007: Reasoning mode

**Decision**: Send `reasoning_effort: "none"` for SMS extraction.

**Rationale**:

- DeepInfra documents reasoning tokens as billable output and recommends disabled/low reasoning for simple and cost-sensitive workloads.
- SMS extraction already has a detailed deterministic prompt and strict response schema.
- Disabling chain-of-thought reduces latency/cost without changing Monyvi's application validation.

**Alternatives considered**:

- Low/medium reasoning: can be revisited only if real SMS QA demonstrates a material extraction need.
- Default/high reasoning: unnecessary for the first release.

**Source**: https://deepinfra.com/docs/chat/reasoning

## R-008: Prompt caching

**Decision**: Rely primarily on DeepInfra's automatic prefix caching by making the stable Monyvi parser instructions the first request content. Do not use explicit cache retention TTL for this model. A code-owned prompt-family key may be sent only if implementation verification shows it improves cache reuse safely; it must contain no user/request data.

**Rationale**:

- DeepInfra automatically reuses identical prompt prefixes and reports `usage.prompt_tokens_details.cached_tokens`.
- Stable content must be placed first; dynamic category context and SMS messages follow it.
- Explicit 5-minute/1-hour retention currently lists other supported models, not DeepSeek V4 Flash 0731, so this plan must not depend on `prompt_cache_options`.
- Correctness must be identical on cache hit and cache miss.
- A prompt semantic change naturally changes the prefix; any explicit family key, if used, will be versioned in code (for example `monyvi:sms-parser:v1`).

**Prompt order**:

1. stable Monyvi SMS parsing rules;
2. dynamic category context (kept as system-level context);
3. request-specific SMS batch.

Supported currencies remain enforced through the response schema and application validator. Future custom categories can vary in step 2 without moving user-specific data into the stable prefix.

**Alternatives considered**:

- Put dynamic SMS/category data before the system rules: rejected because it destroys prefix reuse.
- Explicit retention TTL: unsupported for the selected model today.
- Cache key containing user ID/request ID: rejected because it reduces shared reuse and unnecessarily couples cache identity to user data.

**Sources**:

- https://deepinfra.com/docs/chat/prompt-caching
- https://deepinfra.com/docs/chat/prompt-cache-retention

## R-009: Retry and timeout policy

**Decision**: Preserve the existing four-attempt shape (initial attempt + 3 retries) and 2s/4s/8s exponential delays. Each provider attempt is bounded by a 25-second timeout. Retry only transient transport/provider failures.

**Retryable**:

- HTTP 408
- HTTP 429
- HTTP 5xx
- network interruption
- request timeout

**Non-retryable**:

- HTTP 400
- HTTP 401
- HTTP 403
- HTTP 404
- missing/invalid configuration

**Rationale**:

- Four 25-second attempts plus 14 seconds of backoff remain comfortably below the existing approximate Supabase Edge Function wall-time budget.
- Current retry semantics already consume provider-start capacity only once at the safeguard boundary; this change must not alter accounting.
- There is no automatic alternate provider, so DeepInfra `fail_fast` is not useful by default; bounded timeout is the latency guard.

**Alternatives considered**:

- Unbounded provider queueing/retries: rejected.
- Retry all 4xx errors: rejected because auth/config/request errors will not recover through retry.
- `fail_fast=true`: useful for failover systems, but this release has no fallback provider.

## R-010: Completion mapping

**Decision**: Normalize provider completion into the existing Monyvi completion contract:

- `stop` -> `complete`
- `length` -> `truncated`
- provider content/safety stop, when explicitly reported -> `safety_stopped`
- unknown/missing terminal reason -> `failed`

**Rationale**:

- Existing handler behavior already distinguishes complete, truncated, safety-stopped, and failed outcomes.
- Only a complete, schema-valid result may progress to negative-outcome reconciliation.
- Unknown provider states must fail closed.

## R-011: External response validation

**Decision**: Validate the DeepInfra chat-completion envelope with Zod 4.4.3 before reading choices, finish reason, content, service tier, or usage metadata.

**Rationale**:

- The Monyvi Constitution requires runtime validation of external API responses.
- DeepInfra is an external boundary even when it advertises OpenAI-compatible JSON.
- Existing transaction validation operates on the inner Monyvi payload, so both envelope validation and semantic validation are needed.

**Dependency plan**:

- Map bare `zod` to exact `npm:zod@4.4.3` in `supabase/functions/parse-sms/deno.json`.
- Keep the shared `supabase/functions/deno.json` mapping aligned for IDE/shared-module resolution.
- Remove `@google/genai` only from `parse-sms/deno.json`; voice and category enrichment continue using it.

## R-012: Maximum output

**Decision**: Use a named `max_tokens` cap of 8,192 for the provider request.

**Rationale**:

- A request can contain up to 50 SMS candidates; the output must allow many transaction objects without truncating valid batches.
- DeepInfra bills generated tokens, not the configured ceiling.
- 8,192 provides substantial headroom while preventing runaway generation.

**Alternatives considered**:

- 512 tokens: too small for the maximum batch.
- Provider maximum: unnecessarily loose.

## R-013: Telemetry and privacy

**Decision**: Preserve existing privacy-safe operational logging. Provider diagnostics may include non-content metadata such as status, normalized error code, actual service tier, token counts, cached token counts, and estimated cost, but never raw SMS bodies, prompt text, credentials, or provider error bodies that may echo user content.

**Rationale**:

- Current mobile and Edge code deliberately avoid logging upstream response bodies because providers may echo SMS content.
- Cache/cost effectiveness can be measured using aggregate usage metadata without logging financial content.

## R-014: Testing approach

**Decision**: Use deterministic provider-adapter fixtures/mocked fetch rather than real DeepInfra calls in routine tests. Keep existing handler/safeguard tests authoritative and add focused provider/config/prompt tests.

**Required verification**:

- provider/config factory fail-closed behavior;
- exact request structure, strict JSON schema, disabled reasoning, configured model/tier;
- retry classification and exhaustion;
- malformed external envelope/JSON/semantic result rejection;
- valid empty transaction array;
- completion mapping;
- stable-prefix ordering;
- cache hit/miss functional equivalence (cache billing metadata is observed, not required for correctness);
- existing SMS handler/safeguard tests;
- `deno check supabase/functions/parse-sms/index.ts`;
- representative manual SMS QA.

**Alternatives considered**:

- Gemini-vs-DeepSeek benchmark/shadow traffic: explicitly out of scope.
- Routine tests against production DeepInfra: rejected because deterministic QA must consume zero production AI calls/allowance.

## R-015: Persistent data and public API

**Decision**: No database schema, mobile request shape, or public response shape changes.

**Rationale**:

- Provider configuration is hosted environment state.
- Existing safeguard/outcome tables and request identity already satisfy this migration.
- The mobile client should not know which provider serves SMS parsing.

## R-016: Documentation cleanup

**Decision**: Update provider-specific SMS wording to provider-neutral wording as part of this feature while leaving the Voice Entry section explicitly Gemini-based.

**Known stale references**:

- `docs/business/business-decisions.md` deterministic SMS safeguard QA currently names Gemini.
- `apps/mobile/services/ai-sms-parser-service.ts` comments mention Gemini and Gemini-specific rate limits.

**Rationale**:

- These are implementation/documentation facts, not intended business constraints.
- Leaving them stale would make future provider swaps misleading and violate implementation-aligned documentation requirements.
