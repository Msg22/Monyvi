# #391 Owner Manual / Honest E2E Validation Plan

**Date:** 2026-10-12  
**Status:** AUTHORING PLAN ONLY / **NOT RUN**. No device, native recording, microphone permission screen, emulator, Maestro, Deno/FFmpeg, decoder/model import, Edge benchmark or provider/Gemini execution by this lane.  
**Branch:** `codex/voice-empty-audio-guard` stacked over published Voice `f625183373e29d372b658c10b3848a217477400a`.  
**Scope:** independent SDK55 cleanup plus future, BLOCKED speech/noise validator. The root's separate `codex/voice-startup-latency` owns tap-to-record latency/route/flow/availability and cannot be mutated here. Existing research/prototype and results template remain [UNMEASURED](../../../docs/research/voice-audio-validation-spike/results.template.json).

## Evidence rules

An RNTL mocked fixture verifies lifecycle decisions, **not** actual filesystem deletion, native audio, silence classification, permission UI or Edge resource usage. Do not mark a planned Maestro step as executed. Every owner observation needs setup, OS/device/build, isolated account/test key safely redacted, scenario ID, native/log evidence without user content, expected/observed behavior, timestamp, and a status `PASS`, `FAIL` or `BLOCKED/NOT RUN`. Keep private recordings, utterances, PCM, transcripts, account IDs, financial data, tokens and provider payloads out of the repository and logs. Licensed benchmark fixture metadata, hashes and release rights are local-only evidence.

The three existing #389 safe Voice Maestro scripts never tap live microphone/OS permission or call a provider; do not silently broaden them. This document **authors** scenarios only, not new executable YAML or screenshots.

## Track A — Recorder temporary-audio cleanup (after TDD, owner verification)

| ID | Scenario and expected manual observation | Deterministic source-test owner | Current status |
| --- | --- | --- | --- |
| M391-01 | Healthy native capture → Stop/Submit review completed → source-owned temporary recording is released/deleted when cleanup owns it. Confirm no `voice.recorder.tempAudioDeleteFailed` deprecation warning, and no residual user-audio temp file. No provider invocation required to isolate filesystem behavior. | `apps/mobile/__tests__/hooks/useVoiceRecorder.filesystem.test.ts` (planned) | NOT RUN |
| M391-02 | Record → Discard before submit; missing or previously deleted file is harmless, repeated Discard performs no extra deletion, and the UI returns to idle. | Planned adapter test + existing recorder suites | NOT RUN |
| M391-03 | Force **native Stop rejection** and, separately, Stop returning null URI after a known partial file; native recorder releases promptly, URI was captured before release, filesystem deletion eventually succeeds once, with existing generic recovery and no invented completed file. | Recorder failure-generation fixture (existing) + planned FS test | NOT RUN |
| M391-04 | Delay local FS info/delete in an authorized controlled build; start replacement only after pending old cleanup, no second native Stop/release, stale generation cannot affect new capture, old URI not leaked. | Planned async adapter test | NOT RUN |
| M391-05 | Cancel/back/unmount/account change during preparation, finalization and deletion; old resources/URI do not reappear, actor/private data and Manual access remain safe. | Existing recorder/flow positive controls; owner native proof | NOT RUN |
| M391-06 | Simulate genuine permissions/storage/FS I/O failure; observe privacy-safe warning/error, not silent success. Do not expose URI/audio/user content in diagnostic text. | Planned FS-error test | NOT RUN |
| M391-07 | Real supported Expo SDK55 `expo-file-system/legacy` API on Android and, if available, iOS; ensure both methods resolve without deprecated root-method runtime throw, preserving async behavior. | Root exact-version import/TS contract + owner native | NOT RUN |

**Owner boundary:** The approved import fix is not a promise that every Android/iOS storage failure is fixable; genuine deletion errors must still be logged safely. Native recording, mic permission and actual on-disk confirmation require owner access.

## Track B — Speechless-audio / server validation (BLOCKED; do not claim tested)

| ID | Fixture family / observed expectation | Required proof | Current status |
| --- | --- | --- | --- |
| M391-08 | Missing/zero-byte, random bytes, truncated AAC `ftyp`, malformed/unsupported audio track | Actual submitted bytes, proposed bounded parser and deterministic response; no Gemini/provider unit | BLOCKED — validator/contract |
| M391-09 | M4A/AAC digital silence at 5, 15, 30s | Real PCM decode and calibrated no-speech outcome, provider mock 0, known reservation release | BLOCKED — synthetic files missing |
| M391-10 | Fan/traffic proxies at 5, 15, 30s | Decoded sound evidence and distinct false-positive measurement, not merely RMS/size | BLOCKED — synthetic files missing |
| M391-11 | Licensed quiet Egyptian Arabic at 5, 15, 30s | Proven valid speech not falsely rejected (include short simple utterances and faint talkers) | BLOCKED — licensed bytes missing |
| M391-12 | Licensed quiet English at 5, 15, 30s | Same high-recall proof and labeled provenance | BLOCKED — licensed bytes missing |
| M391-13 | Licensed Arabic/English code-switch at 5, 15, 30s | Same proof; local dialect and mixed words retained | BLOCKED — licensed bytes missing |
| M391-14 | Speech over room, breathing, handling, traffic/fan; noise-only real samples; varied speakers/phone distances | Measure FNR first, FPR and ambiguous VAD cases by class, with owner-approved rule | BLOCKED — real licensed samples |
| M391-15 | Valid speech unrelated to financial transactions | Speech detector only establishes speech; current Gemini/parser remains responsible for financial semantics | BLOCKED — decoder and test contract |
| M391-16 | Validator cannot initialize/decode or exceeds budget | No phantom provider start; appropriate approved fail-closed/retry outcome and SQL reservation state | BLOCKED — resource/response gate |
| M391-17 | Released-terminal same-key replay and parallel two requests on an accepted unexpired reservation | No claim of refundable same-key retry; no unapproved duplicate CPU work or phantom usage; test agreed lease response | BLOCKED — replay/concurrency policy |
| M391-18 | Real app 30s **local active** capture, paused wall excluded; external longer upload and AAC padding | Do not infer a server policy from local cap; duration rule and tolerance must be expressly reconciled | BLOCKED — server duration decision |
| M391-19 | Authenticated consent revoked, quota limit, cancellation/account switch during submit | Preserve fail-closed actor/request identity, 35-day replay semantics and Manual fallback | BLOCKED — contract and owner test |

**Minimum corpus and metrics:** The committed fixtures template has **19 missing assets** (9 synthetic negatives, 9 licensed quiet speech positives, 1 invalid-byte control). Use additional representative licensed noise-only/short-speech/speech-over-noise controls. Record actual artifacts' SHA-256/license/source, per-language FNR/FPR, cold/warm decoder+model init/decode/inference CPU/wall, **true** peak memory, model/ORT/decoder sizes and real Edge bundle/CPU headroom. No arbitrary VAD confidence/minimum-speech or encoder-padding values are approved. Local process CPU or sparse RSS samples cannot count as true Edge CPU/peak.

**Runtime STOP rule:** Existing executor explicitly blocks `deno.exe` and FFmpeg; do not retry, shell-wrap, alter allowlists, install substitutes, run hosted workloads or call Gemini. An independently authorized eligible executor and licensed corpus are required. Failed build/import or missing proof keeps all server outcomes **BLOCKED**.

## Separate owner Starting-latency observation (not owned by #391 branch)

The owner reports about 3s in Starting. Source-based ordering is consent → fresh server allowance → one microphone permission read → pending cleanup → native audio mode/prepare → `record()`. The existing 300ms stabilization follows `record()` and `onStarted`, not a fixed pre-record wait. **No actual stage timings have been measured**; the startup worker alone owns route/flow/availability and instrumentation changes. Owner may collect redacted monotonic cold/warm stages, but no 1–2s guarantee or #391 edit to those paths is authorized.

## Release and sign-off evidence

- Root: accepted meaningful SDK55 filesystem RED, source-only minimal import change, focused GREEN/TS/lint, independent check of preserved lifecycle; **not executed in this planning leaf**.
- Root/owner: authorized decoder/VAD feasibility, licensed corpus, acceptance thresholds, actual Edge measurements, response/replay policy; **all outstanding**.
- Owner: native/device/OS, retained-audio file cleanup, quiet Arabic/English/code-switch listening/quality, safe Manual fallback, screenshots if new UI approved; **NOT RUN**.
- Root: one final combined quality batch and any branch push/PR/issue update; no publication or hosted deployment authorized or claimed by this checklist.

The statuses above remain **NOT RUN/BLOCKED** until linked actual evidence is supplied. No private audio or secret may be attached to this plan.
