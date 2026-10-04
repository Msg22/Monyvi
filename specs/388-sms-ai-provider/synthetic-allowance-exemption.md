# T051 — Synthetic SMS Evaluation Allowance Exemption

**Status:** Source implemented / UNVERIFIED  
**Approved:** 2026-10-02  
**Canonical runtime source pin:** `76fbd782a2a5951261653184621db4c89ea0c962`

## Decision

Normal production SMS parsing keeps its persistent safeguard lifecycle and
rolling/burst/scan/history allowance rules. The development synthetic evaluator
uses a separate staging-only endpoint, `sms-provider-evaluation`, so synthetic
trial traffic does not consume or mutate production SMS allowance/history/
negative-outcome records.

This is not a client-controlled quota bypass and does not alter `parse-sms`. The
dedicated endpoint independently requires:

- exact server `SUPABASE_URL` = `https://yulbcndyssdjicbpmlrk.supabase.co`;
- POST plus a valid authenticated JWT;
- active server-side AI-processing consent;
- a bounded request body and normal full-parser per-request unit/payload/token
  caps;
- canonical synthetic messages only.

The synthetic endpoint deliberately replaces persistent production admission,
rolling-window, provider-start burst, scan/history and negative-outcome
persistence with a request-local ephemeral evaluation lifecycle. It therefore
does **not** claim those persistent production controls apply to this endpoint.
Production `parse-sms` remains unchanged.

## Canonical corpus provenance

The endpoint runtime contains byte-identical private copies from immutable
`76fbd782a2a5951261653184621db4c89ea0c962`:

- `packages/logic/src/sms-provider-evaluation/corpus.ts` ->
  `supabase/functions/sms-provider-evaluation/runtime/sms-provider-evaluation/corpus.ts`
- `packages/logic/src/sms-provider-evaluation/types.ts` ->
  `supabase/functions/sms-provider-evaluation/runtime/sms-provider-evaluation/types.ts`
- `packages/logic/src/parsers/egyptian-bank-registry.ts` ->
  `supabase/functions/sms-provider-evaluation/runtime/parsers/egyptian-bank-registry.ts`

They are runtime copies only, not a second editable fixture source. The endpoint
rebuilds the corpus from `runId` + `anchorMs` using the canonical Edge SMS
fingerprint implementation and requires every submitted message to match the
canonical case exactly by ID, sender, body, date and fingerprint. Duplicate IDs
or duplicate fingerprints are rejected. Unknown or arbitrary inbox messages are
rejected.

## Frontend body contract

The development mobile service must call only:

`sms-provider-evaluation`

with no fallback to production `parse-sms`.

The request JSON is the existing parse-sms body plus one required strict object:

```json
{
  "requestKey": "sms-eval:<runId>:batch-001",
  "scanSessionId": "sms-eval:<runId>",
  "scanKind": "incremental",
  "scanStartedAt": "<ISO timestamp exactly matching anchorMs>",
  "messages": [
    {
      "id": "<canonical synthetic case id>",
      "sender": "<canonical synthetic sender>",
      "body": "<canonical synthetic body>",
      "date": "<canonical synthetic ISO date>",
      "smsFingerprint": "<canonical 64-char lowercase SHA-256>"
    }
  ],
  "categories": "<current category context>",
  "supportedCurrencies": ["EGP", "USD"],
  "syntheticEvaluation": {
    "runId": "<canonical evaluation run id>",
    "anchorMs": 0
  }
}
```

`anchorMs` above is a JSON number containing the exact run anchor in epoch
milliseconds; `0` is illustrative only. `scanStartedAt` must equal
`new Date(anchorMs).toISOString()`.

The server strips `syntheticEvaluation` before constructing the internal
parse-sms-compatible request. It preserves the authorization header and original
request abort signal.

## Runtime boundaries

The endpoint reads actual body bytes with `policy.fullParser.maxPayloadBytes` as
the hard cap; it does not trust `Content-Length`. Cheap metadata/message-count
validation runs before JWT lookup, consent lookup and corpus construction. Full
canonical-corpus validation runs before provider execution.

The existing `createParseSmsHandler` remains authoritative for the normal
per-request parser boundaries: capability enablement, unit cap, payload/token
estimation, hard exclusions, text-quality checks, provider prompt/schema,
semantic validation and T050 request cancellation. The provider/executor path is
the same current DeepInfra path inherited from T050: one 60-second provider
attempt and zero automatic retries.

Lifecycle adapters are request-local:

- `reserveWork`: validates ordinary admission input structurally, then returns
  an ephemeral UUID acceptance without DB writes;
- `markProviderStarted`: request-local started decision, no usage write;
- `completeWork` / `releaseWork`: request-local identity checks only;
- `getProcessingOutcomes`: empty in-memory history;
- `reconcileOutcomes`: uses the normal provider-completion identity
  reconciliation in memory but persists no positive/negative outcomes.

Consequently this endpoint does not mutate `sms_ai_usage_events`,
`sms_ai_requests`, `sms_ai_negative_outcomes`, transaction/transfer records, or
other financial records. Authentication and consent reads remain required.

## Preserved batching decisions

T051 does not change evaluator batching. Integration must preserve:

- mobile synthetic evaluation: **15 messages per batch**, up to 10 concurrent
  batches (T053; CLI/safeguard-QA sequential behavior unchanged);
- shared/CLI evaluator: **5 messages per batch**, sequential.

## Deferred verification / manual review

No item below is verified in this source-only wave:

| Scenario                                 | Required evidence                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Non-staging runtime                      | Endpoint fails closed before auth/corpus/provider work                               |
| Oversized raw body                       | Actual streamed bytes exceed max payload -> rejected without trusting Content-Length |
| Cheap malformed metadata/count           | Rejected before JWT/consent/corpus construction                                      |
| Signed out / invalid JWT                 | Rejected; no provider execution                                                      |
| Consent revoked                          | Rejected; no provider execution                                                      |
| Unknown/arbitrary SMS                    | Exact canonical validation rejects it                                                |
| Tampered ID/sender/body/date/fingerprint | Rejected                                                                             |
| Duplicate ID/fingerprint                 | Rejected                                                                             |
| Canonical partial batch                  | Accepted when each submitted case belongs to the rebuilt corpus                      |
| Per-request caps                         | Existing handler unit/payload/token validation still applies                         |
| Allowance exemption                      | No production usage/request/history/negative-outcome mutation                        |
| Cancellation                             | Original request signal reaches T050 handler/provider path                           |
| Provider policy                          | One 60-second attempt; zero automatic retry                                          |
| Normal response                          | Existing parse-sms response envelope remains consumable by current scorer            |
| Production parser                        | `parse-sms` source and behavior remain unchanged                                     |
| Mobile/CLI sizes                         | 15 mobile and 5 CLI remain unchanged                                                 |
| Hosted staging                           | Deployment/gateway behavior independently observed by lead                           |

Per the approved trial waiver, no tests, lint, typecheck, formatting, CI,
device, provider calls, deployment or runtime checks were written or run here.
