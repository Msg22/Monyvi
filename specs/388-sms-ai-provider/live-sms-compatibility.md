# Live SMS Compatibility Manual QA

This document covers the live Android SMS delivery path only: foreground,
background, and killed-app HeadlessJS delivery. It is intentionally separate
from the synthetic provider evaluation workflow in `live-evaluation.md`.

## Scope

T054 aligns two existing live-SMS contracts:

- Android HeadlessJS receives a bounded 120-second task budget. The configured
  DeepInfra SMS provider still owns its independent 60-second single-attempt
  deadline with zero automatic provider retries.
- A retry of the same live SMS reuses a deterministic request identity derived
  from its canonical SMS fingerprint. The live parser also pins
  `scanStartedAtMs` to the original SMS event timestamp and uses a
  fingerprint-derived candidate ID, so a foreground-to-headless retry does not
  change those serialized identity fields.

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
| Retry after provider failure | Cause a retryable provider/network failure for a live SMS, then allow the native HeadlessJS retry | The same SMS keeps the same fingerprint-derived request key, candidate ID, and original scan-start timestamp |
| Foreground to headless retry | First process a retryable attempt in foreground, then let the retry arrive through HeadlessJS for the same SMS | Delivery mode changes, but request key, candidate ID, SMS fingerprint, and `scanStartedAtMs` remain stable |
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

## Coverage matrix

| Area | Source/unit coverage | Manual/runtime requirement |
| --- | --- | --- |
| Native task budget | Config-plugin test asserts generated `TASK_TIMEOUT_MS = 120000L` while retaining 3 attempts / 10-second native retry delay | Rebuilt Android app required |
| Same-mode retry identity | Focused live-request-identity test covers repeated HeadlessJS delivery with changed wall-clock time | Device delivery timing still manual |
| Delivery-mode switch | Focused test covers foreground first attempt followed by HeadlessJS retry | Foreground/background/killed transition still manual; use the release/preview embedded-JS killed-app harness rather than force-stop |
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
- the combined native + hosted timing budget.

Until the deferred pre-push/manual device phase is performed, those runtime
properties remain **UNVERIFIED**.
