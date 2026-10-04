# Live SMS Compatibility Manual QA

This document covers the live Android SMS delivery path only: foreground,
background native delivery, and killed-app HeadlessJS delivery. It is separate
from the synthetic provider evaluation workflow in `live-evaluation.md` and does
not cover production batch-concurrency work.

## Current source status

The source work is split across coordinated lanes and must not be described as
fully integrated or runtime-verified yet:

- **Backend accepted at source level**: the `parse-sms` handler grants
  `retryRequestMode: fresh` only for explicitly approved provider-error outcomes
  after their provider-error ledger completion is confirmed. If that completion
  cannot be confirmed, the handler fails closed with HTTP 503
  `dependency_unavailable` and no fresh directive.
- **Paired client fresh classification implemented in the independent
  T053/T054CLIENT lane and source-accepted**: only the explicit HTTP 502
  provider-error shapes with known reasons plus `retryRequestMode: fresh` are
  eligible to become fresh paid retry requests. Arbitrary HTTP 5xx responses do
  not authorize fresh identity.
- **Durable live retry-key source implemented and independently
  source-accepted**: `8a47cbfa5191aed14ac1b24ce3e92a4bf762c71a` contains the
  T054 mobile store correction on top of the live-processor/store work. JSON
  corruption cleanup remains isolated, schema/user mismatch cleanup remains
  intact, and failures while persisting TTL-pruned valid state now propagate
  without deleting or rebuilding still-valid sibling retry identities.
- **Paired shared-classifier/concurrency source is implemented and
  source-accepted in its independent lane.** Main/source integration is
  currently ongoing; that status is not equivalent to deployed or runtime-
  verified behavior.
- Cross-lane source integration completion, test execution, Android runtime
  validation, and device/network timing remain **UNVERIFIED** and are deferred
  to the later pre-push/manual phase.

No source lane should be called Green solely from this document, and
source-accepted integration must not be described as deployed or runtime
verified.

## Technical contract

Android HeadlessJS has a bounded 120-second task budget. The configured
DeepInfra SMS provider keeps its independent 60-second single-attempt deadline
with zero automatic provider retries. The native Android retry policy remains
configured with a retry count of **3** and a **10-second delay**; this document
does not reinterpret that platform setting as a claim about a specific total
number of attempts.

The 120-second native budget is not an end-to-end deadline guarantee. It
provides headroom around the server provider deadline for Android/JS startup,
authentication, consent checks, admission/accounting, response processing,
retry-key persistence, and notification handling.

For request identity:

- An **ambiguous transport/result-loss retry** reuses the current request key so
  the server ledger cannot start duplicate provider work.
- A **server-confirmed retryable provider failure** may authorize
  `retryRequestMode: fresh` only after the corresponding
  `completed_with_provider_error` ledger transition is confirmed. That fresh
  retry uses a new request identity and may consume another normal allowance
  unit/provider call.
- If the provider-error completion write cannot be confirmed, the server returns
  HTTP 503 `dependency_unavailable` with **no** fresh directive.
- Caller cancellation, ambiguous provider-start state, reconciliation failure,
  and generic/unknown failures do not authorize a fresh paid retry.

## Durable mobile retry metadata

The approved mobile store persists only bounded retry identity metadata:

- authenticated user ID;
- canonical SMS fingerprint;
- current request key;
- expiry/update timestamps needed for bounded cleanup.

It does **not** persist raw SMS body, categories, provider output, parsed
transactions, or other financial payload merely to enable retry.

The current source design uses:

- **24-hour TTL**;
- at most **64 active entries per user**;
- per-user storage isolation;
- owner checks before/after persistence awaits;
- serialized read/modify/write access for the user store;
- malformed-state cleanup and expired-entry pruning;
- process-restart reuse of the surviving current request key.

The accepted store correction preserves valid active entries when a prune write
itself fails: that storage failure propagates and stops before another paid
parser/provider call rather than deleting or rebuilding the store.

## Source paths

Backend source contract on this T054 branch:

- `supabase/functions/_shared/parse-sms-handler.ts`
- `supabase/functions/_shared/parse-sms-handler.test.ts`
- `docs/business/business-decisions.md`
- this file, `specs/388-sms-ai-provider/live-sms-compatibility.md`

T054 mobile retry source on the independent mobile branch:

- `apps/mobile/services/sms-live-processor.ts`
- `apps/mobile/services/sms-live-retry-request-store.ts`
- `apps/mobile/__tests__/services/sms-live-request-identity.test.ts`
- `apps/mobile/__tests__/services/sms-live-retry-request-store.test.ts`

The paired shared-parser/client classification is owned by the independent
T053/T054CLIENT lane and must be integrated without broadening fresh retry from
the explicit server-authorized shapes above.

## Android rebuild requirement

`apps/mobile/plugins/withSmsBroadcastReceiver.js` generates native Kotlin
source. A Metro reload or ordinary JavaScript refresh does **not** apply the
HeadlessJS timeout change. Manual validation of the 120-second task budget
requires rebuilding and installing the Android application so generated
`SmsHeadlessTaskService.kt` contains the new timeout.

Killed-app validation must use the existing supported release/preview
embedded-JS harness. Background the app, kill its process without Android
force-stop, then inject/receive the real SMS as used by the existing live-SMS
journey. Android force-stop is not a valid killed-app test because a
force-stopped package will not receive normal SMS broadcasts until the app is
opened again.

## Manual scenario matrix

| Scenario                          | Setup / action                                                                                                                                         | Required observation                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foreground receive                | Keep the rebuilt app foregrounded with live detection and AI consent enabled, then receive a supported financial SMS                                   | SMS reaches the shared live processor once; valid handling preserves fingerprint deduplication                                                                                                                              |
| Background receive                | Background the rebuilt app without killing its process, then receive a supported financial SMS                                                         | Background/native delivery reaches the same live processor without duplicate financial handling                                                                                                                             |
| Killed-app receive                | Use the release/preview embedded-JS harness; background the app, kill the process without force-stopping the package, then inject/receive the real SMS | HeadlessJS starts from the native receiver path and processes the SMS; Android force-stop is explicitly unsupported                                                                                                         |
| Ambiguous transport retry         | Lose/interrupt the client response so there is no explicit server-confirmed fresh directive                                                            | The next retry reuses the same persisted current request key, candidate fingerprint/ID, and original `scanStartedAtMs`; it must not create a second provider start for the same ledger identity                             |
| Confirmed provider failure        | Receive one of the explicitly classified server provider-error responses with `retryRequestMode: fresh` after confirmed ledger completion              | Client rotates to the explicit canonical fresh request key and persists it before the next paid dispatch; another normally-accounted provider call is allowed                                                               |
| Completion cannot be confirmed    | Force the provider-error ledger completion dependency to remain unconfirmed                                                                            | Server returns HTTP 503 `dependency_unavailable`, no fresh directive is consumed, and client must not rotate to a new paid request identity                                                                                 |
| Same-mode Headless retry          | Trigger a retryable attempt and let the subsequent retry also arrive via HeadlessJS                                                                    | Current durable key survives JS/runtime restart and is reused unless an explicit fresh authorization rotated it                                                                                                             |
| Foreground → Headless retry       | First attempt arrives foreground, subsequent retry arrives through HeadlessJS                                                                          | Delivery mode change alone does not change ambiguous retry identity; confirmed fresh authorization rotates only through the paired explicit contract                                                                        |
| Malformed durable store           | Seed malformed retry-store metadata for the current user                                                                                               | Malformed state is rejected/cleaned without exposing foreign state or raw SMS payload; next safe identity creation follows the normal guarded path                                                                          |
| Expired durable key               | Seed an entry older than the 24-hour TTL                                                                                                               | Expired key is not reused and bounded cleanup removes it                                                                                                                                                                    |
| Multiple active SMS               | Keep valid retry identities for multiple SMS fingerprints for the same user                                                                            | Each fingerprint retains its own current key; per-user updates are serialized and the store remains bounded to 64 entries                                                                                                   |
| Prune-write storage failure       | Have multiple active SMS entries plus an expired entry, then make persistence of the pruned valid store fail                                           | Operation fails closed before paid parser/provider dispatch; still-valid sibling retry identities must not be deleted or silently rebuilt away. Source correction is accepted at `8a47cbfa5191aed14ac1b24ce3e92a4bf762c71a` |
| Account switch/sign-out           | Switch account or sign out while load/save/rotation is in flight                                                                                       | Old-user work returns stale-user behavior and cannot load, rotate, clear, or dispatch using the new user's retry state                                                                                                      |
| Consent revoked                   | Revoke AI consent before or during live processing                                                                                                     | Existing consent controls stop parsing and clear the applicable retry state without starting fresh provider work                                                                                                            |
| Duplicate delivery / notification | Deliver the same already-saved or already-processed SMS again and repeat notification confirmation where applicable                                    | Fingerprint deduplication prevents duplicate transaction/transfer effects and repeated notification action remains idempotent                                                                                               |
| Distinct SMS                      | Deliver another SMS with a different canonical fingerprint                                                                                             | It uses an independent request identity and does not overwrite the first SMS's active retry key                                                                                                                             |

## Backend fresh-retry response contract

The fresh directive is an explicit server allowlist, never a generic status-code
retry rule:

| Server outcome                                                                                                | Response contract                                                                            |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Provider request throws after provider start and provider-error ledger completion is confirmed                | HTTP 502, `reason: provider_failed`, `retryRequestMode: fresh`                               |
| Provider output fails normalized response-schema validation and provider-error ledger completion is confirmed | HTTP 502, `reason: response_invalid`, `retryRequestMode: fresh`                              |
| Provider returns `truncated`, `safety_stopped`, or `failed` and provider-error ledger completion is confirmed | Preserve existing HTTP 200 completion/fingerprint envelope and add `retryRequestMode: fresh` |
| Any approved provider-error completion cannot be confirmed after the bounded completion retries               | HTTP 503, `reason: dependency_unavailable`, **no** fresh directive                           |
| Caller cancellation after provider start                                                                      | Existing cancellation response, **no** fresh directive                                       |
| Ambiguous provider-start result                                                                               | Existing dependency-unavailable/replay-protection response, **no** fresh directive           |
| Outcome reconciliation failure                                                                                | Existing dependency-unavailable response, **no** fresh directive                             |
| Arbitrary/unknown HTTP 5xx                                                                                    | Not sufficient to authorize a fresh request identity                                         |

The paired client must consume only those explicit canonical fresh shapes.
Ambiguous requests retain the current durable key.

## Coverage and remaining manual-only gaps

| Area                                  | Current source coverage/status                                                                                                    | Why manual/runtime evidence is still required                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Native task budget                    | Config-plugin source/test pins generated `TASK_TIMEOUT_MS = 120000L` and preserves retry count 3 / 10-second delay                | Native Kotlin must be regenerated by rebuilding the Android app; Metro cannot validate it        |
| Backend confirmed-fresh gating        | Backend source/tests define confirmed completion vs 503/no-fresh behavior                                                         | Hosted Edge/network behavior was not executed in this wave                                       |
| Client 502/fresh classification       | Independent paired client source is implemented and source-accepted                                                               | Cross-lane integration plus actual Edge response handling has not been executed here             |
| Durable key across restart            | Store/live-processor source including the prune-write correction is source-accepted at `8a47cbfa5191aed14ac1b24ce3e92a4bf762c71a` | Source acceptance cannot prove Android process death/restart persistence or HeadlessJS lifecycle |
| Malformed/expired/bounded store       | Source/tests cover malformed cleanup, 24-hour expiry, 64-entry bound, owner isolation, and fail-closed prune persistence          | Actual device AsyncStorage behavior remains unverified                                           |
| Multi-SMS serialized persistence      | Source uses per-user serialized storage mutation and accepted prune-write failure preservation                                    | Cross-lane integration is ongoing; runtime concurrency still needs confirmation                  |
| Foreground/background/killed delivery | Existing live receiver/HeadlessJS paths and manual journeys exist                                                                 | OS lifecycle and SMS broadcast delivery cannot be honestly reproduced by ordinary fixture tests  |
| Provider/network timeout timing       | Source has native 120s budget and provider 60s/zero automatic retries                                                             | Fixture tests cannot measure real mobile→Supabase→provider timing or hosted cancellation         |
| Notification dedup/idempotence        | Existing fingerprint and notification-action protections remain in scope                                                          | Real Android notification delivery/action behavior still requires manual device evidence         |
| Account/consent races                 | Existing source guards plus new store owner guards cover source behavior                                                          | Real auth changes during native/background delivery remain runtime-unverified                    |

## Verification status

No test execution, lint, TypeScript, formatter, build, provider request, DB
exercise, deployment, or device verification is claimed by this document update.

In particular, the following remain **UNVERIFIED** until the coordinated source
integration is accepted and the deferred pre-push/manual phase is performed:

- actual 120-second HeadlessJS service lifetime;
- foreground/background/killed-app OS delivery transitions;
- killed-app process-restart retry-key persistence;
- real mobile-to-Supabase network timing;
- hosted Edge cancellation/timing behavior;
- DeepInfra compute/billing termination after transport abort;
- end-to-end confirmed-provider-failure fresh-key rotation;
- multi-active-SMS retry-store behavior under real device storage/concurrency
  despite accepted source handling; and
- notification/action deduplication on a rebuilt Android runtime.
