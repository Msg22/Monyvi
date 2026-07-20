# Contract: SMS AI Usage Enforcement

## Capabilities

- `sms_full_parse`: unit is one unresolved SMS candidate.
- `sms_category_enrichment`: unit is one normalized unique merchant admitted in
  the current scan/request.

Batch and live callers share each capability's user-wide state. Voice is not a
capability in this contract.

## Admission Request

```ts
interface SmsAiAdmissionRequest {
  readonly requestKey: string;
  readonly scanSessionId?: string;
  readonly scanKind: "initial" | "incremental" | "history" | "live";
  readonly capability: "sms_full_parse" | "sms_category_enrichment";
  readonly unitCount: number;
  readonly payloadBytes: number;
  readonly estimatedInputTokens: number;
  readonly candidateFingerprints?: readonly string[];
}
```

Fingerprints are permitted only for terminal-outcome checks and must never be
logged. Merchant text, raw SMS, and financial values are forbidden in the
ledger.

## Admission Response

```ts
type SmsAiAdmissionDecision =
  | {
      readonly status: "reserved";
      readonly workRequestId: string;
      readonly admittedUnits: number;
      readonly remainingUnits: number;
    }
  | {
      readonly status: "refused";
      readonly reason: string;
      readonly availableAt?: string;
      readonly remainingUnits: number;
    }
  | {
      readonly status: "replay";
      readonly workRequestId: string;
      readonly priorStatus: string;
      readonly priorDecision: string;
    };
```

## Atomicity And Timing

- Admission occurs only after auth, consent, and complete request validation.
- Concurrent admissions lock/evaluate the same user and capability atomically.
- Reserved capacity prevents oversubscription.
- A still-reserved request uses a five-minute lease. Expired reservations may be
  reclaimed only because provider-start is an atomic prerequisite to the
  provider call.
- `provider_started` is recorded immediately before the provider call and
  creates the rolling usage/burst event exactly once.
- Internal retries made by the provider adapter belong to that same admitted
  work request. They create no additional user units or burst events; aggregate
  provider-attempt telemetry may count them separately without payload data.
- Provider timeout, error, malformed output, empty complete output, or
  post-start cancellation remains consumed.
- A reservation may be released only when provider start definitely did not
  occur.
- Idempotent replay returns prior state and creates no second reservation, usage
  event, burst event, cooldown start, or provider call. If the original response
  was lost after provider start, return `already_processed_result_unavailable`;
  do not cache financial output in the work ledger. The affected candidate
  remains unresolved and may be submitted later only with a fresh request
  identity under the normal limits.

## Authorization Boundary

- Edge code first verifies the caller JWT and active AI consent.
- Ledger/outcome RPCs are revoked from `anon` and `authenticated` and callable
  only by the service role used inside trusted Edge Functions.
- The verified caller user ID is the only user ID passed to the RPC; request
  payload ownership claims are ignored.
- The server also enforces the 200-unit batch scan total for one user/session. A
  modified client can choose another session ID, so the user-wide rolling and
  burst limits remain the hard financial boundary.

## Availability

For rolling usage refusal, return the earliest server time at which at least one
unit expires. If history cooldown or another known time blocker ends later,
return the later timestamp. Client renders a localized absolute time, never a
live countdown.

## History Cooldown

The first provider-starting `sms_full_parse` request from a history scan starts
the 24-hour cooldown. Local-only history scans and cancellation before provider
start do not. Incremental/live work remains governed by normal allowances.

## Failure Policy

Unavailable/malformed policy, ledger, or RPC state refuses new provider work.
Previously accepted results and local parsing remain available.
