# Live SMS Compatibility Manual QA

This document covers the live Android SMS delivery path only: foreground,
background, and killed-app HeadlessJS delivery. It is intentionally separate
from the synthetic provider evaluation workflow in `live-evaluation.md`.

## Scope

T054 aligns two existing live-SMS contracts:

- Android HeadlessJS receives a bounded 120-second task budget. The configured
  DeepInfra SMS provider still owns its independent 60-second single-attempt
  deadline with zero automatic provider retries.
- An ambiguous retry of the same live SMS reuses its current deterministic
  request identity so the server ledger cannot start duplicate provider work.
  The live parser also pins `scanStartedAtMs` to the original SMS event
  timestamp and uses a fingerprint-derived candidate ID, so a
  foreground-to-headless ambiguous replay does not change those serialized
  identity fields.
- A server-confirmed retryable provider error may authorize one fresh request
  identity through `retryRequestMode: fresh` only after provider-error ledger
  completion is confirmed. A fresh native retry may consume another normal
  allowance unit/provider call. The paired mobile persistence/rotation handoff
  is approved but is **not implemented by this backend correction wave**.

The 120-second native budget is not an end-to-end deadline guarantee. It
provides headroom around the server-side provider deadline for Android/JS
startup, authentication, consent checks, safeguard admission, response
processing, and notification handling.

## Android build requirement

`withSmsBroadcastReceiver.js` generates native Kotlin source. A Metro reload or
ordinary JavaScript refresh does **not** apply the HeadlessJS timeout change.
Manual validation of the 120-second task budget requires rebuilding and
installing the Android application so the generated
`SmsHeadlessTaskService.kt` contains the new timeout.

## Manual scenarios

| Scenario | Setup / action | Expected observation |
| --- | --- | --- |
| Foreground receive | Keep the app foregrounded with live detection and AI consent enabled, then receive a supported financial SMS | SMS is processed once through the live parser path and any valid result is handled normally |
| Background receive | Put the app in the background without killing the process, then receive a supported financial SMS | Background/native delivery reaches the shared live processor without duplicate financial handling |
| Killed-app receive | Use the existing supported killed-app harness: background the rebuilt release/preview app, kill its process without force-stopping the package, then inject/receive the real SMS as documented by the live-SMS Maestro journey | Android starts the HeadlessJS service and the SMS reaches the shared live processor within the rebuilt app; Android force-stop is unsupported for this scenario because a force-stopped package will not receive normal SMS broadcasts until the app is opened again |
| Ambiguous transport retry | Interrupt or lose the client response without a server-confirmed provider-error response, then allow the native HeadlessJS retry | The same current request key is replayed so the server ledger cannot start duplicate provider work; candidate ID, fingerprint, and original `scanStartedAtMs` remain stable |
| Confirmed provider-failure retry | Receive an explicit retryable provider-error response, then exercise the paired native retry flow after the mobile successor lands | Backend grants `retryRequestMode: fresh` only after durable provider-error completion; the successor must persist/rotate the current request key before native retry. This end-to-end behavior is not yet implemented or verified in this backend-only wave |
| Foreground to headless retry | First attempt in foreground, then deliver the same SMS through HeadlessJS | Ambiguous replay keeps the current identity across the delivery-mode switch. A confirmed provider failure requires the pending fresh-key mobile handoff rather than blindly replaying the completed key |
| Duplicate delivery | Deliver the same already-saved/locally-deduplicated SMS again | No second transaction/transfer or duplicate live notification workflow is created |
| Consent revoked | Revoke AI consent before or during live processing | Parsing stops through the existing consent controls; live detection is disabled according to the existing flow |
| Account switch/sign-out | Switch account or sign out while live processing is in flight | Work from the initiating account is discarded and is not surfaced or saved under the new/current account |
| Distinct SMS | Deliver a different SMS with a different canonical fingerprint | It receives a different live request key and candidate ID |

## Stable-request boundary

For the same SMS, T054 stabilizes the fields owned by the live path:
`requestKey`, candidate `message.id`, and `scanStartedAtMs`.

The parser request body also contains current category context and supported
currencies loaded at retry time. If those values change between attempts, the
serialized request digest can still change even though the live identity fields
remain stable. T054 does not broaden scope into parser/orchestrator/context
snapshotting; such a case should be reported rather than treated as arbitrary
retry-body identity.

## Backend fresh-retry response contract

The backend directive is an explicit allowlist, not a generic HTTP retry rule:

| Server outcome | Response contract |
| --- | --- |
| Provider request throws after provider start and ledger completion is confirmed | HTTP 502, `reason: provider_failed`, `retryRequestMode: fresh` |
| Provider output fails normalized response-schema validation and ledger completion is confirmed | HTTP 502, `reason: response_invalid`, `retryRequestMode: fresh` |
| Provider returns `truncated`, `safety_stopped`, or `failed` and ledger completion is confirmed | Preserve the existing HTTP 200 completion envelope and fingerprint arrays, plus `retryRequestMode: fresh` |
| Any of those provider-error completion writes cannot be confirmed after the bounded completion retry | HTTP 503, `reason: dependency_unavailable`, with **no** fresh directive |
| Caller cancellation after provider start | Existing cancellation response, with **no** fresh directive |
| Ambiguous provider-start result | Existing dependency-unavailable response/replay protection, with **no** fresh directive |
| Outcome reconciliation failure | Existing dependency-unavailable response, with **no** fresh directive |

The mobile successor must classify fresh authorization from these exact
server-owned outcome shapes. It must not turn arbitrary HTTP 5xx responses into
fresh paid retries.

## Paired mobile successor status

The user approved persisting only the current user-scoped
SMS-fingerprint/request-key retry identity with bounded expiry across JS
restarts. That persistence and request-key rotation belong to the coordinated
mobile/shared-parser successor and are **not present in this backend wave**.

Until that successor is integrated, a native retry following a
server-confirmed provider failure still risks replaying the completed stable
request key and receiving `already_processed_result_unavailable` without a new
provider call. Therefore the confirmed-failure native retry journey must remain
**UNVERIFIED / integration-pending** rather than being reported as working.
Ambiguous transport retries continue to require reuse of the same current key.

## Coverage matrix

| Area | Source/unit coverage | Manual/runtime requirement |
| --- | --- | --- |
| Native task budget | Config-plugin test asserts generated `TASK_TIMEOUT_MS = 120000L` while retaining 3 attempts / 10-second native retry delay | Rebuilt Android app required |
| Same-mode ambiguous retry identity | Focused live-request-identity test covers repeated HeadlessJS delivery with changed wall-clock time | Device delivery timing still manual |
| Confirmed provider-error fresh directive | Backend handler source/tests define the exact confirmed-completion response contract | Mobile persisted-key rotation is integration-pending; end-to-end native retry remains **UNVERIFIED** |
| Delivery-mode switch | Focused test covers foreground first attempt followed by HeadlessJS retry using the current stable identity | Confirmed-failure fresh rotation awaits the mobile successor; foreground/background/killed transition remains manual and uses the release/preview embedded-JS harness rather than force-stop |
| Distinct identities | Focused test covers different fingerprints producing different request keys/candidate IDs | Optional device confirmation |
| Duplicate protection | Existing live-processor regression coverage | Confirm no duplicate save/notification on device |
| Consent controls | Existing live-processor regression coverage | Confirm revoke/disable behavior on device |
| Account ownership | Existing live-processor regression coverage | Confirm switch/sign-out behavior on device |
| Provider timeout/network timing | No fixture can reproduce actual Android service lifetime plus hosted network/provider timing | Must remain **UNVERIFIED** until pre-push/manual runtime validation |

## Verification status

The repository's fixture/Jest journeys can validate generated source constants,
request-shaping contracts, and control-flow regressions. They cannot honestly
measure:

- actual HeadlessJS service lifetime on Android;
- killed-app startup latency;
- real mobile-to-Supabase network timing;
- hosted Edge cancellation/timing behavior;
- DeepInfra compute/billing termination after transport abort; or
- the combined native + hosted timing budget; or
- confirmed-provider-failure request-key persistence/rotation across a JS
  restart until the paired mobile successor is integrated.

Until the paired mobile handoff and deferred pre-push/manual device phase are
performed, those runtime properties remain **UNVERIFIED**.
