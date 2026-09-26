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
| `model` | non-empty string | Required; initial value `deepseek-ai/DeepSeek-V4-Flash-0731` |
| `serviceTier` | `"default" \| "priority" \| "flex"` | Required after defaulting; `default` omits provider request field |
| `apiKey` | secret string | Required for DeepInfra; never logged/serialized to clients |

### Source

- `SMS_AI_PROVIDER`
- `SMS_AI_MODEL`
- `SMS_AI_SERVICE_TIER`
- `DEEPINFRA_API_KEY`

### Validation

Configuration is parsed once at composition/provider creation. Invalid or incomplete values prevent provider execution.

## 2. SMS AI Provider Strategy

A capability-specific runtime contract.

~~~ts
interface SmsAiProvider {
  execute(input: ExecuteSmsProviderInput): Promise<SmsProviderExecutionResult>;
}
~~~

The implementation may reuse the repository's existing `ExecuteSmsProviderInput` and `SmsProviderExecutionResult` types instead of duplicating them.

### Invariant

The handler depends on this contract, not on DeepInfra-specific request/response types.

## 3. SMS Parsing Prompt Context

Logical provider-independent prompt material.

| Part | Stability | Content |
| --- | --- | --- |
| Stable system rules | stable/versioned | Monyvi transaction qualification, exclusions, trust rules, field extraction rules, category-selection instructions |
| Category context | request/user dependent | current accessible category tree; future custom categories may vary per user |
| Supported currencies | mostly stable | current allowed currency codes; also enforced by response schema |
| User prompt | request-specific | candidate message IDs, sender, received date, SMS body |
| Response schema | derived | Monyvi transaction shape + request-supported currency/category constraints |

### Ordering invariant

Stable system rules MUST precede dynamic category context and SMS content so provider prefix caching can reuse the shared prefix.

### Privacy invariant

Raw SMS data, user IDs, account IDs, and secrets MUST NOT be placed in any shared cache identity.

## 4. DeepInfra Chat Completion Envelope

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

- Envelope: Zod 4.4.3.
- Inner content: JSON parse.
- Transaction payload: existing `parseSmsProviderTransactions`.

A failure at any stage must not yield partial accepted transactions.

## 5. Existing Monyvi Provider Result

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

## 6. Runtime State Flow

~~~text
request admitted by existing SMS safeguards
        |
        v
validated SMS provider configuration
        |
        v
provider-neutral prompt + response schema
        |
        v
DeepInfra adapter
        |
        +-- transient failure -> bounded retry
        |
        +-- non-retryable failure -> provider error
        |
        v
Zod-validated provider envelope
        |
        v
normalized completion status
        |
        +-- non-complete -> existing handler failure path
        |
        v
JSON content parse
        |
        v
existing semantic transaction validator
        |
        +-- invalid -> response_invalid
        |
        v
existing reconciliation/completion flow
~~~

## 7. Persistent Storage Impact

None.

The feature MUST NOT add or change:

- PostgreSQL tables or columns;
- WatermelonDB tables or schema;
- SMS usage ledgers;
- negative-outcome schema;
- mobile review-draft schema.

## 8. Future Custom Categories

This feature does not implement custom categories, but the runtime prompt boundary must allow category context to become user-specific.

Future category identity must not be assumed to equal a mutable display name. The custom-category feature owns its final identity/output contract.
