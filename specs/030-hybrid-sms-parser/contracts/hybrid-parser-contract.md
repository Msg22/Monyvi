# Contract: Hybrid SMS Parser Orchestration

## Input

The orchestrator receives filtered SMS candidates, the existing parse context,
an optional progress callback, and an optional abort signal.

## Routing

1. Verify the existing AI transaction-feature consent gate.
2. Resolve every candidate with the active trusted production catalog.
3. Preserve trusted transaction matches as review-only local suggestions.
4. Preserve trusted rejection matches as resolved non-transactions.
5. Send only no-match, ambiguous, malformed, unsupported, disabled-pattern, or
   catalog-error candidates to AI.
6. Combine local and AI results by fingerprint.

Development `local-primary` and fixture modes remain explicit alternatives and
must not share production candidate patterns.

## Output

The result contains:

- reviewable transactions;
- transient unresolved candidates for batch retry;
- `hasError` and `isRetryable` compatibility flags;
- privacy-safe diagnostics and hybrid summary.

Every input candidate has one final routing outcome. At most one review item may
exist per fingerprint. A local exact match has precedence because that candidate
was never sent to AI; any defensive cross-source duplicate is discarded by
fingerprint and reported only as a safe count.

## Partial failure

AI chunk failure does not erase local matches or successful AI chunks. Retryable
failed candidates are returned as unresolved. Non-retryable failures remain
unresolved but do not offer retry unless their reason later becomes retryable.

## Cancellation

Abort is checked before local matching, before each AI chunk, before
combination, and before delivering progress/results. Once acknowledged, no later
callback or result mutation is allowed.

## Privacy

Diagnostics may contain catalog version, pattern IDs, counts, parser-source
codes, reason codes, and duration. They may not contain raw/sanitized message
text, sender, amount, balance, account/card data, merchant/person, reference,
phone, date/time, or AI response bodies.
