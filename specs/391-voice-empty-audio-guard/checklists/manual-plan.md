# #391 Owner Manual / Honest Physical Device Validation Plan

**Date:** 2026-10-12 | **Status:** AUTHORING PLAN ONLY; owner physical device
checks **NOT RUN**.<br> **Branch:** `codex/voice-empty-audio-guard`<br>
**Scope:** Independent SDK55 cleanup verification plus pending conservative
on-device metering validation. Server-side detector design is explicitly
ABANDONED and SUPERSEDED; prototype spike files have been deleted.<br>
**Execution Evidence:** Root's cleanup TDD (RED → import-only → focused GREEN,
72 tests / 3 suites / 3.809s PASS) was executed separately on 2026-10-12. No
physical device, native recording, microphone permission interaction, or live
Gemini provider call has been executed by this planning lane.

## Evidence Rules

Deterministic Jest/RNTL tests verify adapter contracts and lifecycle logic,
**not** physical hardware audio capture, native OS storage behaviors, or device
microphone properties. Every owner manual test requires:

1. Physical device, OS version, and build configuration.
2. Isolated test account (redacted; no private credentials).
3. Test scenario ID and observed behavior.
4. Privacy confirmation: no raw recordings, transcripts, PCM, or provider tokens
   in logs.
5. Status: `PASS`, `FAIL`, or `NOT RUN`.

## Track A — Recorder Temporary-Audio Cleanup (EXECUTED in TDD; Owner Verification NOT RUN)

| ID      | Scenario and Expected Manual Observation                                                                                                                                                      | Deterministic Test Owner                                 | Status  |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------- |
| M391-01 | Healthy native capture → Stop/Submit completed → temporary recording deleted once by cleanup. No `tempAudioDeleteFailed` deprecation warning.                                                 | `useVoiceRecorder.filesystem.test.ts` (392a26f7…, GREEN) | NOT RUN |
| M391-02 | Record → Discard before submit; missing or previously deleted file handled idempotently without error; UI returns to idle.                                                                    | Adapter test (392a26f7…) + existing suites (GREEN 72/3)  | NOT RUN |
| M391-03 | Native Stop rejection or Stop returning null URI after partial capture; native recorder releases promptly; URI captured pre-release; filesystem deletion succeeds once with generic recovery. | Recorder failure-generation fixture + FS test            | NOT RUN |
| M391-04 | Delayed local FS delete; replacement waits for pending cleanup; no duplicate native Stop/release; stale generation cannot affect new capture.                                                 | Async adapter test (392a26f7…)                           | NOT RUN |
| M391-05 | Cancel, back navigation, unmount, or account switch during recording; resources release cleanly; Manual access remains unimpeded.                                                             | Existing recorder/flow positive controls                 | NOT RUN |
| M391-06 | Simulated filesystem I/O error; observe privacy-safe warning without exposing URI or user data in logs.                                                                                       | FS-error test (392a26f7…)                                | NOT RUN |
| M391-07 | Physical verification on Android and iOS hardware ensuring `expo-file-system/legacy` resolves without runtime throws.                                                                         | Root import/TS contract (84696d74…, 7ad8ed52…; tsc PASS) | NOT RUN |

## Track B — Conservative On-Device Metering (SUPERSEDED Server Detector; PENDING Implementation)

_Historical server detector scenarios (Symphonia WASM, Silero ONNX VAD, Edge
shared-memory tests) are SUPERSEDED and RETIRED. The scenarios below reflect the
approved conservative client-side metering cost guard. All cases are PENDING
future implementation and marked NOT RUN._

| ID      | Scenario and Expected Observation                                                                                   | Verification Requirement                                                                                                  | Status  |
| ------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------- |
| M391-08 | Physical clear silence recording with sufficient valid metering measurements; submission aborted locally on-device. | Rejects with approved copy `"We couldn’t hear anything. Please try recording again."`; 0 upload/reservation/Gemini.       | NOT RUN |
| M391-09 | Quiet Egyptian Arabic speech with low amplitude; submission proceeds to server.                                     | Audio passes through; acknowledges amplitude overlap; validates representative faint speech does not false-reject.        | NOT RUN |
| M391-10 | Quiet English speech with low amplitude; submission proceeds to server.                                             | Audio passes through; validates representative faint speech does not false-reject.                                        | NOT RUN |
| M391-11 | Mixed Egyptian Arabic / English code-switched utterance; submission proceeds to server.                             | Audio passes through; dialect and code-switching preserved.                                                               | NOT RUN |
| M391-12 | Ambient background noise (fan proxy, room noise, street traffic) without speech; submission proceeds to server.     | Audio passes through; on-device metering makes no claim of background noise detection.                                    | NOT RUN |
| M391-13 | Missing, empty, or sparse metering samples during capture; submission proceeds to server.                           | Fails open safely; audio passes through to server.                                                                        | NOT RUN |
| M391-14 | Zero server side-effects verification: inspect network log on local silence reject.                                 | Confirm no recording upload, no parse-voice submission, no usage quota deducted; routine auth/sync network calls allowed. | NOT RUN |
| M391-15 | Server-side zero-byte structural guard: upload empty payload to `parse-voice`.                                      | Server returns existing 400 rejection; unchanged server behavior.                                                         | NOT RUN |
| M391-16 | Server duration follow-up: verify local 30-second cap remains active.                                               | Server duration follow-up is out of scope and not addressed.                                                              | NOT RUN |
| M391-17 | Authenticated consent revoked or quota limit reached during submit.                                                 | Existing server 403 and 429 envelopes handled safely.                                                                     | NOT RUN |
| M391-18 | Retried or cancelled recording allows immediate Manual transaction entry.                                           | Manual route unaffected by local silence rejection.                                                                       | NOT RUN |
| M391-19 | Privacy check: inspect diagnostic logs during silence rejection.                                                    | Zero raw audio, PCM data, or sensitive metrics written to logs.                                                           | NOT RUN |

## Release and Sign-Off Evidence

- **US1 Cleanup TDD**: EXECUTED on 2026-10-12: test-only RED `392a26f7…` (10
  fail / 1 pass / 11 total), import-only legacy fix `84696d74…`, async mock
  reconciliation `7ad8ed52…`, focused GREEN (72 tests / 3 suites / 3.809s PASS),
  and root independent minimal-source review PASS.
- **US2 Server Detector Retirement**: Completed on 2026-10-12. 10 prototype and
  legacy research files deleted. Previous benchmark findings superseded.
- **US2 Client Metering**: UNIMPLEMENTED / PENDING future TDD and physical
  device verification.
- **Owner Native Verification**: All physical device tests in Track A and Track
  B remain honestly marked **NOT RUN**.
