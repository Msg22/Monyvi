# Research: Launch SMS Scan Safeguards

## Decision 1: One versioned policy, evaluated in pure code

**Decision**: Define a readonly, versioned launch policy in `packages/logic` and
use it for mobile boundaries and deterministic QA. Mirror only server-enforced
constants in an Edge-owned policy module, with contract tests proving parity.

**Rationale**: Mobile and Edge runtimes cannot safely import one source module
without coupling deployment targets, but duplicated untested numbers would
drift. A shared contract fixture verifies both policy representations.

**Rejected**: Hardcode limits independently in routes, services, and functions.

## Decision 2: Fingerprints remain authoritative; checkpoints only reduce reads

**Decision**: Store an installation-local, user-keyed checkpoint in validated
AsyncStorage. Include the processing-policy version and invalidate the cursor
when cutoff, local exclusion, trusted-catalog, fingerprint, or durable-state
semantics change. Effective incremental start is
`max(scanStartedAt - 30 days, checkpoint - 5 minutes)`. Every message read from
that range is still fingerprint checked.

**Rationale**: Device inboxes differ across devices and reinstallations. A
synchronized checkpoint could hide unseen local messages. AsyncStorage matches
existing device-local metadata patterns and avoids adding a local-only table to
the automatic sync table list.

**Rejected**: Replace fingerprint checks with a timestamp cursor; synchronize
the cursor through Supabase; or use device SMS IDs.

## Decision 3: Advance only across a contiguous durable boundary

**Decision**: Represent each considered message as a timestamp, stable
fingerprint tie-breaker, and durable-state result. Advance the checkpoint only
through the newest contiguous prefix for which every eligible message has a
durable known state. Parsed suggestions held only in memory, quota deferrals,
failures, cancellations, and invalid responses stop advancement.

**Rationale**: Advancing to the newest success would skip earlier unresolved
messages on the next incremental scan.

**Rejected**: Store the newest inbox timestamp or newest parsed result.

## Decision 4: Synchronize only AI-negative strike metadata

**Decision**: Add `sms_ai_negative_outcomes` as a server-authored, user-owned,
pull-only sync table containing canonical fingerprint, bounded strike count,
original received timestamp, terminal flag/timestamp, and sync metadata. Revoke
ordinary client insert/update/delete access and exclude the table from mobile
push. Never store sender, body, amount, currency, merchant, category,
account/card data, or provider response.

**Rationale**: The third strike must survive reinstall and apply across devices;
privacy-safe fingerprint metadata is the minimum synchronized state.

**Rejected**: Keep strikes only on-device; persist raw SMS; or store full AI
responses.

## Decision 5: Oversized outcomes remain installation-local

**Decision**: Store a bounded map of `candidate_too_large` fingerprint and
original message timestamp in validated user-keyed AsyncStorage. Suppress it
only while the message remains in the rolling window and prune expired entries.

**Rationale**: This state prevents repeated impossible work on one device but
does not need cross-device synchronization.

**Rejected**: Treat oversize as a permanent AI-negative strike or truncate the
message.

## Decision 6: Server usage ledgers are operational, not synchronized app data

**Decision**: Add server-only `sms_ai_work_requests` and `sms_ai_usage_events`
tables. Exclude them from Watermelon migration generation and expose no client
CRUD policies. Revoke admission/mutation RPC execution from `anon` and
`authenticated`; trusted Edge code calls them with the service role only after
verifying the caller JWT and consent. RPCs atomically admit/reserve, mark
provider-started/consumed, release definitely-not-started reservations, and
return idempotent prior decisions.

**Rationale**: Cost enforcement must be authoritative under concurrency and
modified clients. Operational records are not user-facing data.

**Rejected**: Client-side counters, in-memory Edge counters, or direct client
inserts into usage tables.

## Decision 7: Reservation and provider-start are separate transitions

**Decision**: After auth, consent, and request validation, atomically reserve
capacity. A five-minute lease bounds reservations that never reach provider
start. Immediately before provider execution, atomically mark the request
started and consume candidate/burst capacity. Release explicitly only when the
Edge handler can prove provider execution never began; the server may reclaim an
expired still-reserved lease because provider start is an atomic prerequisite to
calling Gemini. Stable request identity makes retries idempotent.

**Rationale**: Failures after provider start may still incur cost. Concurrency
must not oversubscribe allowance, and retries must not double-charge.

**Rejected**: Count only successful responses or count before validation.

## Decision 7A: Idempotency does not persist financial provider responses

**Decision**: Reuse one request key for transport retries of the same active
chunk. If the server already reached provider start or completion, a replay does
not call Gemini or add usage. Because this feature does not persist parsed
financial responses, a replay whose original response was lost returns an
explicit `already_processed_result_unavailable` decision; the candidate remains
unresolved and may be attempted later under a new permitted scan/request.

**Rationale**: Persisting provider output would add a new sensitive server-side
draft store outside issue #770. Calling Gemini again under one request identity
would defeat idempotency and hide cost.

**Rejected**: Cache full parsed results in usage ledgers or silently invoke the
provider again.

## Decision 8: Capability-specific shared limits

**Decision**: Use `sms_full_parse` and `sms_category_enrichment` capability
keys. Batch and live SMS share each key's rolling and burst allowance. Voice
uses no new code path or counter in this feature.

**Rationale**: The cost is created by the provider capability, not the UI entry
point.

**Rejected**: Separate batch and live quotas or reuse a global AI quota that
could reduce voice availability.

## Decision 9: Server request boundaries use Monyvi limits

**Decision**: Enforce 50 candidates and 128 KiB request bytes plus a
conservative 32,000-input-token estimate for full parsing, even if Gemini
accepts more. Use a deterministic UTF-8 byte counter and documented conservative
token estimator on mobile and Edge; the Edge result is authoritative.

**Rationale**: Provider limits can change and are not a product budget. Monyvi
needs stable, testable cost boundaries.

**Rejected**: Rely only on Gemini rejection or silently truncate input.

## Decision 10: Provider responses declare completeness

**Decision**: Extend the full-parser response contract with request identity and
a completion status. Only a structurally valid, identity-complete response may
create omission strikes. Duplicate/unknown identities, malformed JSON,
truncation, safety stops, transport failures, and cancellation create no
negative outcomes.

**Rationale**: An empty array is currently ambiguous because retry exhaustion
also returns an empty array. That cannot safely mean “not a transaction.”

**Rejected**: Infer successful completion from HTTP 200 or an empty array alone.

## Decision 11: Three strikes are atomic and server-checked

**Decision**: The server checks terminal outcomes before provider admission and
atomically increments valid omission/`isTrusted:false` strikes, capped at three.
Ordinary scans suppress after strike one; deliberate permitted history rescans
may produce strikes two and three. A terminal record blocks further full-AI work
but not a future exact trusted local match.

**Rationale**: Mobile-only checks race across devices. Atomic server checks make
the terminal invariant reliable.

**Rejected**: Trust client-provided strike counts or permanently suppress after
one response.

## Decision 12: Deterministic newest-first admission

**Decision**: Sort unresolved candidates by received timestamp descending and
canonical fingerprint ascending before applying remaining scan/user capacity.

**Rationale**: This is stable across input order and provider concurrency while
giving users the most recent financial activity first.

**Rejected**: Inbox order, random order, or chunk completion order.

## Decision 13: Cooldown is defense in depth

**Decision**: Record the 24-hour history-rescan cooldown when the first full-AI
history request starts. Keep ordinary incremental scans available. The server
enforces rolling and burst cost limits regardless of the client-provided scan
kind; the cooldown cannot be the sole financial boundary.

**Rationale**: The server cannot independently inspect the Android inbox or
prove that a client truthfully labels a history scan.

**Rejected**: Block all SMS scanning during cooldown or trust scan kind as the
only server guard.

## Decision 14: Partial results stay in the existing active review session

**Decision**: Preserve successful local and AI results in `SmsScanContext`, keep
Save enabled, and show aggregate guidance for refused/oversized work. Do not add
raw-message persistence, draft resume, or a retry queue here.

**Rationale**: Issue #770 owns persistent draft behavior. This issue guarantees
only the current active session.

**Rejected**: Duplicate issue #770 or discard successful results when one chunk
is refused.

## Decision 15: QA scenarios use production evaluators with isolated doubles

**Decision**: Define named/versioned scenario profiles with fixed clocks,
fixture inboxes, simulated provider outcomes, isolated allowance/outcome stores,
and explicit reset. Production builds reject all scenario flags and doubles.

**Rationale**: Real inboxes and Gemini cannot deterministically cover quota,
malformed response, three-strike, concurrency, or expiry boundaries.

**Rejected**: Lower production limits for a QA user or consume real Gemini quota
during routine testing.

## Decision 16: Prompt optimization is a measured follow-on inside this issue

**Decision**: Add a token-report tool that separately measures fixed
instructions, category context, response schema, and candidate payload with the
local conservative estimator. Add a separately named, explicit opt-in workflow
that uses the selected Gemini model's count-tokens service for calibration and
never runs during routine safeguard QA. Change prompt/schema wording only when a
candidate optimization reduces calibrated tokens and the approved corpus shows
no extraction, rejection, category, trust, confidence, or identity regression.

**Rationale**: Shorter prompts can reduce cost but unmeasured edits can reduce
financial parsing accuracy.

**Rejected**: Rewrite the prompt during safeguard implementation without a
before/after corpus result.
