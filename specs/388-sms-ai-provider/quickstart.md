# Quickstart: Configurable SMS AI Provider

**Feature**: 388-sms-ai-provider

This document describes the planned developer/QA setup. Commands that depend on feature implementation become executable after the corresponding tasks are implemented.

## 1. Local configuration

Keep real secrets in the ignored local Edge Function environment file.

~~~text
DEEPINFRA_API_KEY=<local development token>
SMS_AI_PROVIDER=deepinfra
SMS_AI_MODEL=deepseek-ai/DeepSeek-V4-Flash-0731
SMS_AI_SERVICE_TIER=default
~~~

Do not configure a provider endpoint URL. The approved DeepInfra endpoint is fixed by the adapter.

Do not remove `GEMINI_API_KEY` globally: voice and SMS category enrichment still use Gemini.

## 2. Hosted Supabase configuration

Hosted Edge Functions do not automatically receive values from the local `.env`.

Set the SMS provider values in the target Supabase project's hosted secrets/environment before deploying `parse-sms`.

Example:

~~~powershell
npx supabase secrets set DEEPINFRA_API_KEY="<secret>" SMS_AI_PROVIDER="deepinfra" SMS_AI_MODEL="deepseek-ai/DeepSeek-V4-Flash-0731" SMS_AI_SERVICE_TIER="default" --project-ref yulbcndyssdjicbpmlrk
~~~

Never commit the real DeepInfra token.

## 3. Routine deterministic verification

Routine automated tests must mock/inject the provider boundary and make **zero real DeepInfra calls**.

Planned focused command:

~~~powershell
npm run test:sms-ai-provider
~~~

Existing handler/safeguard checks remain required:

~~~powershell
npx tsx --test supabase/functions/_shared/parse-sms-handler.test.ts
npm run test:sms-safeguards
npm run test:sms-parser-special-cases
npm run test:sms-hard-exclusions
~~~

Edge type/syntax verification:

~~~powershell
deno check supabase/functions/parse-sms/index.ts
~~~

Run repository lint/format checks on the changed files before review.

## 4. Provider contract cases

Focused provider tests must cover:

1. valid Standard-tier DeepSeek result;
2. valid `transactions: []`;
3. strict JSON-schema request shape;
4. `reasoning_effort: "none"`;
5. configured model propagation;
6. default tier omits `service_tier`;
7. priority/flex configuration maps correctly when explicitly selected;
8. HTTP 408/429/5xx/network/timeout retry;
9. HTTP 400/401/403/404 no retry;
10. retry exhaustion;
11. malformed provider envelope;
12. missing completion content;
13. malformed inner JSON;
14. `length` -> truncated;
15. unknown finish reason -> failed;
16. semantically invalid transaction -> existing validator rejection;
17. missing/unsupported provider configuration fails before fetch;
18. API key absent fails before fetch.

## 5. Prompt-cache verification

DeepInfra prompt caching is best-effort and must never be a correctness dependency.

For an explicit development-only verification:

1. send two requests using identical stable Monyvi parser instructions;
2. vary only the dynamic category/SMS tail as needed;
3. inspect provider usage metadata for `prompt_tokens_details.cached_tokens`;
4. confirm no raw SMS/prompt text is logged;
5. confirm both cached and uncached responses pass the same Monyvi semantic validation.

A cache miss is not a functional failure.

Do **not** use `prompt_cache_options` retention TTL for DeepSeek V4 Flash 0731 unless DeepInfra later documents support for this model.

## 6. Representative manual QA

Use safe development/test SMS examples covering at least:

| Scenario | Expected |
| --- | --- |
| Card/POS purchase | one EXPENSE suggestion |
| InstaPay/outgoing transfer | correct EXPENSE direction |
| Incoming transfer/salary | correct INCOME direction |
| ATM withdrawal | EXPENSE + ATM flag |
| Foreign-currency transaction | exact supported currency |
| Promotion/offer with amount | no trusted transaction |
| OTP/security message | excluded/no transaction |
| Valid non-transaction batch | successful empty result |
| Invalid provider-shaped fixture | no partial financial result |
| Provider transient failure | bounded retry, then existing retryable failure behavior |

Also verify that voice entry still follows the existing Gemini path.

## 7. Cost check

Before merge/release, use current published prices to confirm the specification's >=30% projected reduction at equal token counts.

At planning time:

- DeepSeek Standard: $0.06 / 1M input, $0.18 / 1M output.
- Gemini 2.5 Flash-Lite text: $0.10 / 1M input, $0.40 / 1M output.

Prompt-cache discounts are additional upside and are not required to satisfy the base cost criterion.

## 8. Deployment

After all implementation verification passes:

~~~powershell
npm run fn:deploy:parse-sms
~~~

No `parse-voice` deployment is required for this feature.

## 9. Rollback

This feature intentionally has no runtime automatic fallback provider.

If the pre-production deployment must be rolled back, redeploy the last known-good `parse-sms` revision rather than silently routing requests to Gemini.
