# Data Model: Configurable SMS AI Provider

**Feature**: 388-sms-ai-provider  
**Date**: 2026-09-26

This feature adds **no persistent database schema**. The model below describes runtime configuration and provider-boundary objects only.

## 1. SMS AI Provider Configuration

Represents validated server-side runtime configuration.

### Fields

| Field | Type | Rules |
| --- | --- | --- |
| `provider` | `"deepinfra"` initially | Required; unsupported values fail closed |
| `model` | non-empty string | Required; must exactly match one hosted allowlist entry |
| `serviceTier` | `"default" \| "priority"` | Explicitly required; no missing-value default. `default` omits provider request field; `flex` is unsupported and rejected before request admission |
| `apiKey` | secret string | Required for DeepInfra; never logged/serialized to clients |

`SMS_AI_APPROVED_MODELS` is hosted environment input only (explicit comma-separated allowlist). It is validated during composition but is not part of the returned provider configuration.

### Source

- `SMS_AI_PROVIDER`
- `SMS_AI_MODEL`
- `SMS_AI_APPROVED_MODELS`
- `SMS_AI_SERVICE_TIER`
- `DEEPINFRA_API_KEY`

### Validation

Configuration is parsed once during module/provider composition before the per-request handler can reserve or mark provider usage. Missing, blank, incomplete, malformed, or unsupported values prevent provider execution and request admission. Only `default` and `priority` are supported service tiers; `flex` fails configuration before admission/provider-start accounting. A future model is approved by hosted config change only (append its ID to the allowlist); no code change is required.

## 2. Raw SMS AI Provider Strategy

A capability-specific provider adapter contract. It owns provider transport/envelope mechanics but not Monyvi financial semantics.

~~~ts
interface SmsAiProvider {
  execute(request: SmsAiProviderRequest): Promise<SmsAiProviderRawResult>;
}

interface SmsAiProviderRawResult {
  readonly completionStatus:
    | "complete"
    | "truncated"
    | "safety_stopped"
    | "failed";
  readonly content: string;
  readonly operationalMetadata?: SmsAiProviderOperationalMetadata;
}
~~~

`SmsAiProviderRequest` contains provider-independent prompt messages and strict response-schema material prepared by Monyvi.

## 3. Provider-Neutral Monyvi Executor

The executor bridges the raw adapter to the existing handler contract.

~~~ts
async function executeSmsAiProvider(
  provider: SmsAiProvider,
  input: ExecuteSmsProviderInput
): Promise<SmsProviderExecutionResult>;
~~~

Responsibilities:

- build stable/dynamic Monyvi prompt context and strict response schema;
- call the raw provider adapter;
- parse the returned inner JSON;
- apply existing `parseSmsProviderTransactions` semantic validation;
- construct `SmsProviderExecutionResult`.

### Invariant

The handler depends on `SmsProviderExecutionResult`, while provider adapters never own or bypass Monyvi semantic transaction validation.

## 4. SMS Parsing Prompt Context

Logical provider-independent prompt material.

| Part | Stability | Content |
| --- | --- | --- |
| Stable system rules | stable/versioned | Monyvi transaction qualification, exclusions, trust rules, field extraction rules, category-selection instructions |
| Stable supported-currency context | mostly stable | unchanged globally supported currency codes; also enforced by response schema |
| Built-in category context | stable/versioned | code-owned built-in category definitions ordered before custom categories |
| User-specific custom-category context | dynamic/optional | future custom categories only; empty/not present in the current release |
| User prompt | request-specific | candidate message IDs, sender, received date, SMS body |
| Response schema | derived | Monyvi transaction shape + request-supported currency/category constraints |

### Ordering invariant

Stable system rules, unchanged supported-currency context, and built-in category definitions MUST precede future user-specific custom-category context and SMS content so automatic provider prefix caching can reuse the shared portion even when custom categories differ.

### Privacy invariant

Raw SMS data, user IDs, account IDs, and secrets MUST NOT be placed in any shared cache identity. Feature 388 sends no explicit `prompt_cache_key` or `prompt_cache_options`; reuse relies only on automatic prefix matching.

## 5. DeepInfra Chat Completion Envelope

External provider response validated at runtime before use.

### Relevant fields

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | diagnostic only |
| `model` | string | diagnostic/verification |
| `choices` | array | must contain the completion choice used by the adapter |
| `choices[].finish_reason` | string/null | normalized into Monyvi completion status |
| `choices[].message.content` | string/null | JSON text; parsed only after envelope validation |
| `service_tier` | string/optional | safe operational metadata |
| `usage.prompt_tokens` | number/optional | aggregate telemetry |
| `usage.completion_tokens` | number/optional | aggregate telemetry |
| `usage.prompt_tokens_details.cached_tokens` | number/optional | cache observability |
| `usage.estimated_cost` | number/optional | aggregate operational cost metadata |

### Validation

- External DeepInfra envelope: Zod 4.4.3 inside the adapter.
- Inner content: JSON parse in the provider-neutral Monyvi executor.
- Transaction payload: existing `parseSmsProviderTransactions` in the provider-neutral Monyvi executor.

A failure at any stage must not yield partial accepted transactions.

## 6. Existing Monyvi Provider Result

No shape change:

~~~ts
interface SmsProviderExecutionResult {
  readonly completionStatus:
    | "complete"
    | "truncated"
    | "safety_stopped"
    | "failed";
  readonly isResponseSchemaValid: boolean;
  readonly transactions: readonly ParseSmsProviderTransaction[];
}
~~~

Existing transaction fields remain unchanged:

- `messageId`
- `amount`
- `currency`
- `type`
- `counterparty`
- `date`
- `categorySystemName`
- optional `isAtmWithdrawal`
- optional `cardLast4`
- `confidenceScore`
- `isTrusted`

## 7. Runtime State Flow

~~~text
request admitted by existing SMS safeguards
        |
        v
validated SMS provider configuration
(module composition; before request admission/accounting)
        |
        v
provider-neutral executor builds stable/dynamic prompt + response schema
        |
        v
DeepInfra raw adapter
        |
        +-- transient failure -> bounded internal retry
        |
        +-- non-retryable failure -> provider error
        |
        v
Zod-validated external provider envelope
        |
        v
normalized completion status + raw content
        |
        +-- non-complete -> existing handler failure path
        |
        v
provider-neutral Monyvi executor parses inner JSON
        |
        v
existing semantic transaction validator
        |
        +-- invalid -> response_invalid
        |
        v
existing SmsProviderExecutionResult -> reconciliation/completion flow
~~~

## 8. Persistent Storage Impact

None.

The feature MUST NOT add or change:

- PostgreSQL tables or columns;
- WatermelonDB tables or schema;
- SMS usage ledgers;
- negative-outcome schema;
- mobile review-draft schema.

## 9. Future Custom Categories

This feature does not implement custom categories, but the runtime prompt boundary must preserve a stable built-in category prefix and allow a separate user-specific custom-category tail before SMS content.

Future category identity must not be assumed to equal a mutable display name. The custom-category feature owns its final identity/output contract.
