# Contract: SMS Processing Outcomes

## Runtime Outcome Codes

```ts
type SmsProcessingOutcomeCode =
  | "local_excluded"
  | "trusted_local_match"
  | "trusted_local_rejection"
  | "saved_duplicate"
  | "ai_match"
  | "ai_no_transaction"
  | "candidate_too_large"
  | "quota_deferred"
  | "cooldown_deferred"
  | "cancelled"
  | "provider_failed"
  | "response_invalid"
  | "user_changed";
```

Only the outcomes explicitly declared durable in the scan-session contract may
participate in checkpoint advancement.

## Valid AI Negative Classification

A strike may be created only when all are true:

1. the provider request is authenticated and tied to the same user;
2. the response envelope identifies the same request;
3. completion status is `complete`;
4. the submitted identity set is known and unique;
5. every returned identity is submitted and appears once;
6. the candidate is either explicitly returned with `isTrusted: false` or is
   omitted from the complete valid transaction array.

Transport failure, cancellation, malformed JSON, invalid schema, duplicate
identity, unknown identity, truncation, safety stop, and incomplete completion
produce zero strikes.

## Strike Lifecycle

- Strike 1: synchronize; suppress ordinary full-AI retries while the message is
  in the rolling window; history rescan may retry.
- Strike 2: same behavior; next permitted history rescan may retry.
- Strike 3: set terminal permanently for this user; no future full-AI request,
  including after reinstall or after rolling-window expiry.
- Exact active trusted local templates may still produce a local result for a
  terminal fingerprint without removing or weakening the terminal AI block.

## Privacy Boundary

Synchronized outcomes may contain only user ID, canonical fingerprint, original
received timestamp, strike count, terminal state/timestamps, and standard sync
metadata. They are server-authored and pull-only on mobile; ordinary clients
have no insert/update/delete policies and the mobile sync push path excludes the
table. Logs and telemetry use aggregate counts and stable reason codes only.

A valid AI transaction clears a non-terminal negative record. A later exact
trusted local match may supersede a terminal negative classification in the
review result, but the terminal record remains and continues to block full AI.
