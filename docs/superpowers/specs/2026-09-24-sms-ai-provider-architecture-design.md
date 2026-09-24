# SMS AI Provider Architecture Design

**Date:** 2026-09-24  
**Status:** Approved design — implementation not started  
**Repository:** `Msg22/Monyvi`  
**Scope:** SMS AI parsing only  
**Current voice provider:** Gemini 2.5 Flash-Lite — unchanged

## 1. Goal

Replace Gemini 2.5 Flash-Lite in the SMS full-parser path with
`deepseek-ai/DeepSeek-V4-Flash-0731` served by DeepInfra, while formalizing a
provider-neutral SMS AI boundary so a future provider/model change requires a
new adapter plus configuration rather than changes throughout the SMS workflow.

The design must preserve Monyvi's existing SMS safety, validation, admission,
reconciliation, telemetry, request contract, and mobile behavior.

## 2. Why This Is Architectural Work

The current `parse-sms` Edge Function already has a useful seam:
`createParseSmsHandler` receives an injected `executeProvider` dependency and
expects the provider-neutral `SmsProviderExecutionResult`.

However, provider-specific responsibilities still live directly in
`supabase/functions/parse-sms/index.ts`, including:

- Google SDK initialization.
- `GEMINI_API_KEY` lookup.
- Gemini model selection.
- Gemini request serialization.
- Gemini structured-output configuration.
- Gemini finish-reason mapping.
- Provider retry/error handling.

This change formalizes the existing seam rather than replacing the full SMS
architecture.

## 3. Approved Decisions

1. SMS and voice are separate AI capabilities.
2. Voice continues to use Gemini 2.5 Flash-Lite.
3. SMS uses a provider-neutral `SmsAiProvider` strategy.
4. Provider selection is configuration-based.
5. The initial and only configured SMS provider is DeepInfra.
6. The initial SMS model is
   `deepseek-ai/DeepSeek-V4-Flash-0731`.
7. No automatic multi-provider fallback is added.
8. Unsupported or incomplete provider configuration fails closed.
9. Existing Monyvi SMS business rules remain provider-independent.
10. Existing Monyvi response validation remains authoritative.
11. DeepInfra prompt caching is a first-class cost optimization.
12. Prompt caching must never alter correctness, instruction priority, or
    validation rules.
13. Supported currencies are treated as effectively stable platform context.
14. Built-in Monyvi categories are treated as mostly stable platform context.
15. Future user-created custom categories are dynamic user context and must not
    destroy the reusable common prompt prefix.
16. No Gemini-vs-DeepSeek benchmark is required before this replacement because
    Monyvi is pre-production and still in trial/development.
17. No database schema or mobile API contract change is part of this work.

## 4. Non-Goals

This change does **not**:

- Modify `parse-voice`.
- Remove Gemini from Monyvi globally.
- Build a provider benchmark framework.
- Add automatic fallback from DeepInfra to Gemini, OpenRouter, Hugging Face, or
  another provider.
- Add provider health routing or model scoring.
- Implement user-created custom categories.
- Change category business rules.
- Change SMS quotas, admission rules, negative outcomes, fingerprints, consent,
  or review behavior.
- Change the mobile SMS request/response contract.
- Change database schema.
- Create a generic abstraction shared by every AI capability in Monyvi.
- Make the DeepInfra endpoint an arbitrary runtime-configurable URL.

## 5. Architecture

### 5.1 Capability-specific boundary

Use a Strategy/Adapter boundary for SMS only:

```text
parse-sms/index.ts
        |
        v
createSmsAiProvider(config)
        |
        v
SmsAiProvider
        |
        +-- DeepInfraSmsProvider   <- initial implementation
        +-- future provider       <- later, when needed
        |
        v
SmsProviderExecutionResult
        |
        v
existing handler / validation / reconciliation
```

A future provider implementation must not require modifications to:

- `createParseSmsHandler`
- SMS admission/safeguard services
- SMS negative-outcome reconciliation
- fingerprint handling
- mobile request contract
- transaction semantic validator
- voice parsing

### 5.2 Provider interface

The provider interface remains intentionally narrow:

```ts
export interface SmsAiProvider {
  execute(
    input: ExecuteSmsProviderInput
  ): Promise<SmsProviderExecutionResult>;
}
```

The exact final location/signature may reuse the existing
`ExecuteSmsProviderInput` and `SmsProviderExecutionResult` types rather than
duplicate them.

### 5.3 Provider factory

A small factory selects the provider from validated configuration:

```text
SMS_AI_PROVIDER=deepinfra
        |
        v
createSmsAiProvider(...)
        |
        +-- deepinfra -> DeepInfraSmsProvider
        +-- unknown   -> configuration error
```

The factory is not responsible for retries, prompting, validation, or business
logic.

## 6. Responsibility Boundaries

### 6.1 Monyvi-owned, provider-independent responsibilities

These remain outside the DeepInfra adapter:

- SMS transaction qualification rules.
- Promotion / OTP / security-message exclusions.
- Special-case parsing rules.
- `isTrusted` semantics.
- Category-selection semantics.
- Supported-currency policy.
- Built-in category catalogue.
- Future custom-category interpretation rules.
- SMS user-prompt construction.
- Transaction output contract.
- Semantic transaction validation.
- Hard exclusions.
- consent checks.
- request admission / quotas / cooldowns.
- fingerprints and idempotency.
- negative-outcome reconciliation.
- operational telemetry.
- user-facing result shape.

### 6.2 DeepInfra adapter responsibilities

The DeepInfra adapter owns only provider mechanics:

- DeepInfra authentication.
- Fixed official API endpoint.
- configured model ID.
- configured service tier.
- OpenAI-compatible request serialization.
- DeepInfra structured-output request syntax.
- prompt-cache metadata.
- HTTP timeout/cancellation.
- provider-specific error interpretation.
- retryability classification.
- provider finish/completion mapping.
- response-envelope runtime validation.
- extraction of assistant JSON.
- usage/cost/cache metadata when available.

The adapter must not know Monyvi category business rules beyond consuming the
prepared prompt/schema/context supplied to it.

## 7. Configuration Contract

### 7.1 Hosted/runtime configuration

Initial runtime values:

```text
SMS_AI_PROVIDER=deepinfra
SMS_AI_MODEL=deepseek-ai/DeepSeek-V4-Flash-0731
SMS_AI_SERVICE_TIER=default
DEEPINFRA_API_KEY=<secret>
```

Allowed initial values:

- `SMS_AI_PROVIDER`: `deepinfra`
- `SMS_AI_SERVICE_TIER`: `default`, `priority`, or `flex`

The initial deployment uses `default` for SMS because SMS parsing is not an
interactive voice path and cost is the primary reason for the migration.

### 7.2 Fail-closed behavior

Configuration parsing must be centralized and typed.

The function must fail as a dependency/configuration error when:

- `SMS_AI_PROVIDER` is missing.
- provider value is unsupported.
- `SMS_AI_MODEL` is missing/blank.
- service tier is unsupported.
- the required provider API key is missing.

There is no silent fallback to Gemini.

### 7.3 Secrets vs configuration

Conceptually:

**Secret**

- `DEEPINFRA_API_KEY`

**Non-secret runtime configuration**

- `SMS_AI_PROVIDER`
- `SMS_AI_MODEL`
- `SMS_AI_SERVICE_TIER`

Supabase exposes both to the Edge Function via `Deno.env.get(...)`, but the
API key must never be committed or logged.

### 7.4 Supabase deployment

Local environment values are not automatically copied into hosted Supabase.

Local development uses an ignored environment file such as:

```text
supabase/functions/.env
```

A checked-in example may document variable names without secrets.

Hosted values must be set in the Supabase project's Edge Function
secrets/environment configuration. Deployment of function source code and
deployment of environment values are separate concerns.

Changing hosted secrets/configuration does not require embedding those values in
the function bundle.

## 8. Prompt Caching Design

### 8.1 Objective

DeepSeek/DeepInfra input caching is used to reduce repeated input-token cost.

Caching is an optimization only. Correctness must not depend on a cache hit.

### 8.2 Stable-prefix principle

Requests should maximize the reusable common prefix:

```text
COMMON / STABLE PREFIX
==================================================
Monyvi SMS parser identity
transaction qualification rules
non-transaction/exclusion rules
special-case rules
isTrusted semantics
counterparty rules
category-selection instructions
supported currencies
built-in category catalogue
instructions for future custom categories
output/response instructions
==================================================

USER-SPECIFIC CONTEXT
==================================================
future custom categories for this user
==================================================

REQUEST-SPECIFIC CONTENT
==================================================
message IDs
senders
SMS bodies
received dates
==================================================
```

Request-specific SMS content must never be placed before the reusable common
instructions solely for convenience.

### 8.3 Supported currencies

Supported currencies are not expected to change often and may never change.

They may therefore live in the common reusable prompt/context.

A future supported-currency change is treated as a prompt/context revision; it
is not worth degrading validation or request clarity to keep an old cache entry
alive.

### 8.4 Built-in categories

The built-in Monyvi category hierarchy is mostly stable and belongs in the
common reusable prefix.

The provider adapter must not merge or reorder categories differently per
request when there is no business reason to do so.

### 8.5 Future custom categories

A future feature will allow users to define custom categories.

Custom categories are dynamic user context and therefore belong **after** the
common platform prefix and **before** the SMS batch.

Conceptually:

```text
[stable Monyvi rules]
[stable currencies]
[stable built-in categories]
------------------------------ reusable common prefix
[user custom categories]
[current SMS batch]
```

The future custom-category feature must use stable identifiers rather than
treating mutable display names as durable database identity. The exact custom
category response contract is deferred to that feature's own approved design.

This SMS-provider work must not introduce an abstraction that assumes every
category will forever be identified only by a built-in `system_name`.

### 8.6 Cache key/version

Use a stable, versioned prompt-cache family key.

The preferred design is to derive the key from a code-owned prompt revision
constant rather than requiring an operator to remember to change an environment
variable whenever prompt semantics change.

Example:

```ts
const SMS_PROMPT_REVISION = "v1";
const SMS_PROMPT_CACHE_KEY =
  `monyvi:sms-parser:${SMS_PROMPT_REVISION}`;
```

A material change to reusable prompt semantics increments the revision.

The cache key must not contain:

- user ID
- message ID
- SMS text
- sender
- financial values
- account identifiers
- secrets

### 8.7 Cache observability

When DeepInfra returns usage/cache metadata, the adapter may expose safe
aggregate operational data to Monyvi telemetry.

Do not log raw SMS content or prompt text merely to diagnose cache behavior.

Implementation QA should confirm that repeated equivalent requests can receive
cached-input billing/usage when supported by the provider, but a cache miss must
produce the same functional result.

## 9. Prompt and Schema Composition

Prompt construction remains a Monyvi responsibility.

The provider receives a prepared request context composed in this order:

1. stable system instructions;
2. stable/semi-static platform context;
3. future user-specific custom-category context;
4. request-specific SMS batch.

The response schema remains dynamic where required for correctness, including
currency/category constraints.

Do not weaken dynamic validation merely to increase cache reuse.

## 10. Structured Output and Validation

DeepInfra must be requested to return structured JSON compatible with the
existing Monyvi transaction contract.

The existing semantic validator remains authoritative for:

- non-empty/valid message IDs;
- finite positive amounts within the existing bound;
- supported currency;
- `EXPENSE` / `INCOME`;
- counterparty shape;
- parseable date;
- allowed category;
- confidence range;
- `isTrusted`;
- optional ATM flag;
- optional four-digit card suffix.

Provider-side JSON/schema enforcement is defense in depth, not a replacement
for application-side validation.

External DeepInfra response envelopes must be runtime-validated using Zod in
accordance with the Monyvi constitution before values are trusted.

## 11. Completion and Error Mapping

Provider-specific status values must be normalized to the existing
`SmsProviderExecutionResult` completion contract.

At minimum:

- normal stop -> `complete`
- token/output limit -> `truncated`
- provider content/safety stop when applicable -> `safety_stopped`
- malformed/unknown terminal state -> `failed`

A valid empty transaction array is a successful model result and must not be
retried merely because no transaction was found.

Malformed JSON or semantically invalid output must never be accepted as a
partial financial result.

## 12. Retry and Timeout Policy

Retry policy must distinguish transport/provider availability from model
business output.

Retryable examples:

- HTTP 429
- transient 5xx
- network interruption
- provider timeout where retry remains within the Edge Function's deadline

Non-retryable examples:

- authentication failure
- authorization failure
- malformed request/configuration
- unsupported provider/model configuration

Retries remain bounded exponential backoff and must respect cancellation and
the Edge Function execution budget.

The implementation should avoid duplicating retry policy across future
provider adapters when the behavior is genuinely common, while keeping
provider-specific retry classification inside the provider adapter.

## 13. Security and Privacy

- `DEEPINFRA_API_KEY` is server-side only.
- Raw provider credentials are never logged.
- Raw SMS content must not be added to new provider/cache diagnostic logs.
- The provider endpoint is fixed in code to the official DeepInfra API host; an
  environment variable cannot redirect financial SMS data to an arbitrary
  destination.
- Existing active AI consent checks remain unchanged.
- Existing SMS usage/safeguard accounting remains unchanged.
- Existing server-only aggregate telemetry rules remain unchanged.

## 14. Existing SMS Safety Architecture Must Remain Intact

The provider migration must preserve the existing order and behavior of:

1. authentication;
2. active AI consent;
3. request validation;
4. canonical fingerprint verification;
5. rolling-window / scan-start rules;
6. local hard exclusions;
7. processing-outcome checks;
8. safeguard admission/reservation;
9. provider-start accounting;
10. AI provider execution;
11. semantic transaction validation;
12. completion/release accounting;
13. negative-outcome reconciliation;
14. operational response telemetry.

The provider adapter must not bypass or duplicate those stages.

## 15. Testing Strategy

This project intentionally does not build a Gemini-vs-DeepSeek model benchmark.

Implementation verification focuses on architecture and correctness:

### Configuration/factory

- selects DeepInfra from valid config;
- rejects missing/unsupported provider;
- rejects missing model;
- rejects unsupported tier;
- rejects missing API key;
- never silently falls back to Gemini.

### DeepInfra adapter

- sends configured model and service tier;
- sends stable cache key;
- sends system/user content in approved order;
- requests structured JSON;
- maps successful completion;
- maps truncation/failure;
- runtime-validates provider envelope;
- parses valid transaction JSON;
- rejects malformed JSON;
- preserves valid empty transaction arrays;
- classifies retryable and non-retryable failures;
- respects bounded retry/timeout/cancellation behavior.

### Domain integration

- existing `parseSmsProviderTransactions` rejects unsupported currencies;
- rejects invented categories;
- rejects invalid amounts/dates/confidence/card suffix;
- accepts valid DeepSeek-shaped results;
- existing safeguards and reconciliation remain provider-agnostic;
- existing mobile request/response contract remains unchanged.

### Cache behavior

- cache-key revision is stable for identical prompt revision;
- changing prompt revision changes the cache key;
- dynamic SMS/user data is never embedded in the cache key;
- cache metadata is safe to log only in aggregate;
- cache miss and hit are functionally equivalent.

### Regression boundary

- `parse-voice` remains Gemini-based and is not modified.

## 16. Suggested File Shape

Final names may be adjusted to match repository conventions, but responsibilities
should remain equivalent:

```text
supabase/functions/_shared/sms-ai/
  sms-ai-provider.ts
  sms-ai-provider-config.ts
  sms-ai-provider-factory.ts
  sms-ai-prompt.ts
  providers/
    deepinfra-sms-provider.ts

  *.test.ts
```

`supabase/functions/parse-sms/index.ts` should become composition/wiring rather
than the home of a concrete provider implementation.

Do not move unrelated safeguard/domain code solely to make the directory look
uniform.

## 17. Migration Sequence

1. Extract/define the provider-neutral SMS provider contract using existing
   handler types where possible.
2. Centralize and validate SMS provider configuration.
3. Isolate stable prompt composition and prompt revision/cache key.
4. Implement DeepInfra/DeepSeek adapter with Zod-validated provider envelope.
5. Preserve existing domain validator and handler behavior.
6. Rewire `parse-sms` composition to resolve the configured provider.
7. Remove SMS-specific Google SDK/provider code from `parse-sms`.
8. Keep `parse-voice` and its Gemini configuration untouched.
9. Add/update local environment example documentation.
10. Document the hosted Supabase environment values required before QA/deploy.
11. Verify focused tests and existing SMS safeguard tests.
12. Perform manual development QA with representative SMS inputs.

## 18. Maintainability Acceptance Criterion

A future SMS provider change is considered architecturally easy only if it can
be completed by:

1. implementing a new `SmsAiProvider` adapter;
2. adding the provider to the validated factory/configuration;
3. setting provider/model/credential configuration;
4. deploying;

without requiring changes to the SMS handler, mobile contract, safeguards,
reconciliation, transaction validator, or voice code, except where a future
provider cannot satisfy the established provider contract.

## 19. Design Rationale

> **Architecture & Design Rationale**
>
> - **Patterns Used:** Strategy + Adapter + Factory + Dependency Injection.
> - **Why:** SMS parsing needs one stable Monyvi capability contract while
>   provider APIs, authentication, request formats, finish reasons, and pricing
>   change independently.
> - **SOLID Check:** Single Responsibility keeps provider mechanics out of the
>   domain handler; Open/Closed allows new providers through adapters; Dependency
>   Inversion keeps the handler dependent on `SmsAiProvider`, not DeepInfra.
> - **Caching:** A stable-prefix prompt layout and versioned cache key reduce
>   repeated input cost without weakening dynamic category/currency validation.
> - **YAGNI:** One active provider, no generic all-AI abstraction, no automatic
>   fallback, no benchmark subsystem, and no custom-category implementation in
>   this migration.

## 20. Governance / Business Rules

This design has been checked against Monyvi Constitution 1.7.0 and current
repository guidance.

The provider migration does not introduce a new financial calculation or user
workflow rule. However, `docs/business/business-decisions.md` currently
contains SMS safeguard-QA wording that explicitly names the Gemini provider and
requires routine QA to prove zero production Gemini calls. That wording would
become stale when SMS moves to a configurable provider.

Before production implementation begins, the provider-specific SMS QA wording
must be updated to be provider-neutral while preserving the existing safety
intent: fixture/provider substitution is allowed only inside the deterministic
QA profile, routine QA must make zero calls to the production-configured SMS AI
provider, and routine QA must consume zero production allowance. The separate
Voice Entry section remains explicitly Gemini 2.5 Flash-Lite and must not be
changed by this SMS migration.

If implementation discovery finds any additional business-rule change is
necessary, work must stop and that decision must be approved/documented before
the production change proceeds.
