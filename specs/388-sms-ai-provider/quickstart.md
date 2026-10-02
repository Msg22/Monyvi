# Quickstart: Configurable SMS AI Provider

**Feature**: 388-sms-ai-provider

This document describes the planned developer/QA setup. Commands that depend on feature implementation become executable after the corresponding tasks are implemented.

## 1. Local configuration

Create `supabase/functions/.env` for local Edge Function values. The repository-wide `.env*` ignore rule keeps this file out of Git, and Supabase CLI automatically loads it when `supabase start` starts the local stack. The repository root `.env` is a separate input used by the local launcher/`config.toml`; it does not replace `supabase/functions/.env` for function-only values. This file is server-side; do not copy `DEEPINFRA_API_KEY` into a mobile environment file or any `EXPO_PUBLIC_*` variable. Both `parse-sms` and `enrich-sms-categories` read the same five values through `Deno.env.get`.

~~~text
DEEPINFRA_API_KEY=<local development token>
SMS_AI_PROVIDER=deepinfra
SMS_AI_MODEL=deepseek-ai/DeepSeek-V4-Flash-0731
SMS_AI_APPROVED_MODELS=deepseek-ai/DeepSeek-V4-Flash-0731
SMS_AI_SERVICE_TIER=default
~~~

Restart the local stack after changing `supabase/functions/.env`:

~~~powershell
npm run supabase:start:local
~~~

If you serve this function directly instead of starting the full local stack, pass the same file explicitly:

~~~powershell
npx supabase functions serve parse-sms --env-file supabase/functions/.env
~~~

Supabase local-secret reference: https://supabase.com/docs/guides/functions/secrets

All five values above are required; missing `SMS_AI_SERVICE_TIER` does not silently default. `SMS_AI_SERVICE_TIER` supports only `default` and `priority` in this synchronous flow. `flex` is intentionally unsupported and must fail closed before request admission, provider fetch, or provider-start accounting because its spare-capacity queueing semantics are incompatible with the bounded 25-second attempt timeout. `SMS_AI_APPROVED_MODELS` is the hosted allowlist: an explicit comma-separated list of approved model IDs, distinct from the `SMS_AI_MODEL` selection. The selected model must exactly match one allowlist entry; missing, blank, malformed (empty entries, wildcards, whitespace inside an ID), or unapproved selections fail closed during config composition. Approving a future model is a config change only: append its ID to the allowlist (and select it via `SMS_AI_MODEL`) with no code change. Provider configuration is resolved before the per-request handler can reserve or mark provider usage.

Do not configure a provider endpoint URL. The approved DeepInfra endpoint is fixed by the adapter.

Do not remove `GEMINI_API_KEY` globally: voice and other remaining Gemini consumers still use it. SMS category enrichment now uses the same DeepInfra configuration above as `parse-sms`.

### Development-only provider response-output capture

Provider response-content capture is a temporary development diagnostic exception and is **off by default**. Enable it only when both values match exactly:

~~~text
SMS_AI_RUNTIME_ENV=development
SMS_AI_DEBUG_RESPONSE_OUTPUT=true
~~~

Any missing, blank, differently cased, whitespace-padded, or non-development value keeps capture disabled. When enabled, `parse-sms` writes a separate `smsAi.providerResponseOutput` Edge log event containing only `responseContent`, the validated DeepInfra assistant string from `choices[0].message.content`, before Monyvi semantic filtering. The captured output can contain transaction or other financial details, so use it only with approved development/test data and only for the shortest diagnostic window needed.

The callback does not read or add request messages/prompts, raw input SMS, API keys, auth headers, user/account IDs, fingerprints, or the complete DeepInfra envelope. However, the captured provider output is the model's returned assistant content and may itself quote or reproduce input SMS/prompt text or financial details. Existing `smsAi.providerUsage` logging remains aggregate-only. Failure of the diagnostic callback is isolated from provider execution and must not trigger provider retries or change parse results.

To verify manually, enable both flags in development, run one explicit test parse, and search the Supabase `parse-sms` Logs for `smsAi.providerResponseOutput`. Confirm the event shows the returned JSON content while the aggregate usage event still contains no response or input content. Then disable capture by removing the debug flag or setting `SMS_AI_DEBUG_RESPONSE_OUTPUT=false`; production/runtime values other than exact `development` must deny capture even when the debug flag is `true`.

## 2. Hosted Supabase configuration

Hosted Edge Functions do not automatically receive values from the local `supabase/functions/.env`; configure hosted values separately.

Set the five SMS provider values in the target Supabase project's hosted secrets/environment before deploying either `parse-sms` or `enrich-sms-categories`. Hosted Edge Functions read these values through `Deno.env.get`; they do not receive the local `supabase/functions/.env` automatically.

Rollout precondition: set hosted `SMS_AI_APPROVED_MODELS` before deploying the new function code. The new code fails closed when the allowlist is missing, so deploying code first would refuse all parses until the value exists. No hosted secret is mutated by development; apply the value with the project owner before release.

Example:

~~~powershell
npx supabase secrets set DEEPINFRA_API_KEY="<secret>" SMS_AI_PROVIDER="deepinfra" SMS_AI_MODEL="deepseek-ai/DeepSeek-V4-Flash-0731" SMS_AI_APPROVED_MODELS="deepseek-ai/DeepSeek-V4-Flash-0731" SMS_AI_SERVICE_TIER="default" --project-ref yulbcndyssdjicbpmlrk
~~~

Never commit the real DeepInfra token.

### Manual approved-model config matrix

Run these against a local Edge runtime (never production) by varying only the two model variables:

| Case | `SMS_AI_MODEL` | `SMS_AI_APPROVED_MODELS` | Expected |
| --- | --- | --- | --- |
| Baseline | `deepseek-ai/DeepSeek-V4-Flash-0731` | same single ID | parses |
| Future model | new ID | baseline ID plus new ID | parses (config-only approval) |
| Unapproved selection | other ID | baseline ID | fails closed before admission |
| Missing/blank allowlist | baseline ID | missing or blank | fails closed before admission |
| Malformed allowlist | baseline ID | trailing comma, `a,,b`, `*`, or inner whitespace | fails closed before admission |

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
7. priority configuration maps correctly when explicitly selected, while flex is rejected before request admission/fetch/provider-start accounting;
8. HTTP 408/429/5xx/network/timeout retry;
9. HTTP 400/401/403/404 no retry;
10. retry exhaustion;
11. one logical admitted request records exactly one provider start even when the adapter performs multiple internal retries;
12. malformed provider envelope;
13. missing completion content;
14. malformed inner JSON;
15. `length` -> truncated;
16. unknown finish reason -> failed;
17. semantically invalid transaction -> provider-neutral existing-validator rejection outside the DeepInfra adapter;
18. missing/blank/unsupported provider, model, approved-model list, service tier, or API key fails before request admission/fetch/provider-start accounting;
19. input-token estimation counts the stable prompt, category context, response schema, and SMS candidate content exactly once after prompt refactoring.

## 5. Prompt-cache verification

DeepInfra prompt caching is best-effort and must never be a correctness dependency.

For an explicit development-only verification:

1. send two requests whose stable prefix contains identical Monyvi rules, supported-currency context, and built-in category definitions;
2. vary a future custom-category tail and/or SMS body only after that stable prefix;
3. inspect provider usage metadata for `prompt_tokens_details.cached_tokens`;
4. confirm ordinary operational logs remain free of raw SMS/prompt text; the explicitly enabled development response-output event described above may contain provider-returned echoes;
5. confirm both cached and uncached responses pass the same provider-neutral Monyvi semantic validation.

A cache miss is not a functional failure.

Feature 388 sends neither `prompt_cache_key` nor `prompt_cache_options`; automatic prefix matching is the only caching mechanism in this release.

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

For Settings SMS-window copy, verify English and Arabic with the effective client policy rather than a hardcoded number: normal policy renders 30 days; an approved development/QA policy override such as 60 renders 60 in `Sync new SMS` help, `Rescan recent messages` help, and the rescan confirmation. Confirm history-cooldown disabled/availability behavior is unchanged. This check observes the effective policy only; it does not change the repository default 30-day policy.

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
