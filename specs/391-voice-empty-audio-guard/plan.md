# Implementation Plan: #391 Voice Empty-Audio Guard and Telemetry

**Branch**: `codex/voice-empty-audio-guard` | **Date**: 2026-10-12 | **Spec**:
[spec.md](./spec.md)<br> **Input**:
[issue #391](https://github.com/Msg22/Monyvi/issues/391),
[existing authoritative source/constraints](../389-voice-usage-limits/spec.md).<br>
**Planning authority**: Root's feature configuration
`SPECIFY_FEATURE=391-voice-empty-audio-guard` and
`SPECIFY_FEATURE_DIRECTORY=specs/391-voice-empty-audio-guard`.<br> **Status**:
US1 cleanup EXECUTED (TDD RED → import-only legacy → focused GREEN, root final
batch PASS); server decoder/VAD design explicitly ABANDONED and SUPERSEDED per
user decision. Approved direction is conservative on-device metering as a
pre-upload cost optimization (reject only clearly silent recordings with
sufficient valid capture measurements; uncertain/missing measurements pass to
server; zero recording upload, parse-voice submission, reservation, or
provider-start attributable to a locally rejected recording). Normal auth,
entitlement refresh, and sync can still make network requests. Current
authorized #391 implementation covers mobile conservative metering + server
cache-hit telemetry source, tests, and documentation, while avoiding hosted
deployment, database migrations, provider config, startup redesign, latency
safeguards, and emulators. Metering and cache telemetry implementation and
deterministic verification are complete; threshold calibration and physical
device testing remain NOT RUN. Implementation may land as a draft with the
physical release gate open. Prototype files are deleted. Server API contracts
remain completely unchanged; server duration follow-up is out of scope and not
addressed.

## Summary

Deliver **four separable slices**:

1. **Slice A — Cleanup Adapter (EXECUTED)**: Corrected Expo SDK 55
   temporary-audio cleanup using the supported async `expo-file-system/legacy`
   import, after meaningful throwing-root versus working-legacy RED tests.
   Preserves native release-before-FS cleanup, known URI capture, missing-file
   idempotence, once-only disposal, and generation/restart barriers. Root final
   GREEN batch (72 tests / 3 suites / 3.809s) verified.

2. **Slice B — Server Detector Retirement (SUPERSEDED & RETIRED)**: Server-side
   WASM decoding and Silero ONNX speech detection pipeline is explicitly
   ABANDONED. Edge Runtime shared memory isolate incompatibility, complexity,
   and positive Egyptian speech corpus requirements are retired. Prototype files
   in `scripts/voice-audio-validation-spike/` and
   `docs/research/voice-audio-validation-spike/` have been deleted.

3. **Slice C — Conservative On-Device Metering (IMPLEMENTED; DETERMINISTIC
   CHECKS PASS)**: Approved client-side cost optimization in `apps/mobile`.
   Rejects only recordings meeting strict candidate near-silence criteria with
   complete valid capture coverage. Passes on missing or uncertain measurements.
   - Candidate threshold: `METERING_SILENCE_THRESHOLD_DBFS = -70.0 dBFS`.
     Evaluated strictly as `sample < -70.0 dBFS`; exact equality at `-70.0 dBFS`
     (`sample >= -70.0 dBFS`) passes to server.
   - Deterministic coverage constants: minimum active duration
     `METERING_MIN_ACTIVE_DURATION_MS = 1500 ms` (paused time excluded), minimum
     valid count `METERING_MIN_VALID_SAMPLES = 10`, max active gap
     `METERING_MAX_ACTIVE_GAP_MS = 250 ms`, max leading uncovered span
     `METERING_MAX_LEADING_UNCOVERED_MS = 200 ms`, and max trailing uncovered
     span `METERING_MAX_TRAILING_UNCOVERED_MS = 200 ms`.
   - Valid sample range: finite double in `(-160.0, 0.0]`.
   - Strict floor/sentinel fail-open invariant: native Android
     `AudioRecorder.kt` maps both `maxAmplitude == 0` and caught native
     exceptions (`IllegalStateException`, `RuntimeException`) to the exact
     sentinel value `-160.0 dBFS`. Density or count of `-160.0 dBFS` samples
     does NOT prove silence. Any observation of `sample <= -160.0 dBFS` poisons
     that capture generation and MUST fail open to the server, regardless of
     count or duration. Pure floor captures always fail open.
   - Platform native status preconditions: Android `AudioRecorder.kt` omits
     `mediaServicesDidReset` entirely from its status bundle, while iOS
     `AudioRecorder.swift` supplies it. The Android adapter accepts normal
     omission of `mediaServicesDidReset` (rejecting only if explicitly `true` or
     malformed); iOS requires `mediaServicesDidReset === false`. Both platforms
     require `canRecord === true`, `isRecording === true`, and finite positive
     `durationMillis > 0`. Unsupported platforms fail open.
   - Sampling clock and finalization: poll once per existing 100ms tick using
     active captured duration (paused time excluded). Redundant immediate
     `getStatus` reads that drain Android `maxAmplitude` are forbidden. Final
     metering snapshot FREEZES existing samples before native recorder release
     WITHOUT extra final query (does not mandate an extra final getStatus call
     that drains Android maxAmplitude); cap-completed recordings (at 30 seconds)
     and manual Submits evaluate the exact same finalized snapshot.
   - Metering makes no claim of distinguishing faint speech from ambient noise
     or confirming semantic silence.
   - On local rejection, the client aborts submission before upload, invoking
     zero recording upload, zero parse-voice submission, zero quota reservation,
     and zero provider-start marking. Normal auth, entitlement refresh, and sync
     network calls remain unaffected.
   - Approved existing copy:
     `"We couldn’t hear anything. Please try recording again."` (Arabic:
     `"لم نتمكن من سماع أي شيء. يرجى محاولة التسجيل مرة أخرى."`).

4. **Slice D — Gemini Cache-Hit Telemetry (IMPLEMENTED; DETERMINISTIC CHECKS
   PASS)**: Observe Gemini 2.5 Flash Lite `response.usageMetadata` in
   `parse-voice` after each returned provider attempt before reading text or
   parsing JSON (including empty, malformed, or retried responses). Log event
   `voice_ai_gemini_usage` with model `gemini-2.5-flash-lite`, 0-indexed
   attempt, `promptTokenCount`, `cachedContentTokenCount`,
   `candidatesTokenCount`, `totalTokenCount`, `cacheObservedHit`, and
   `cachedInputRatio`.
   - Nullable metrics: Token counts are non-negative safe integers or `null`.
     `cacheObservedHit` and `cachedInputRatio` are nullable.
   - Validation rules: valid pair requires
     `0 <= cachedContentTokenCount <= promptTokenCount`.
   - Malformed `cachedContentTokenCount > promptTokenCount` MUST NOT become a
     hit, is not counted as a hit, and ratio is recorded as `null`.
   - `cacheObservedHit`: `true` iff `cachedContentTokenCount > 0` within a valid
     pair. Missing or undefined cached count is recorded as `null` / `unknown`
     (NOT assumed false or zero).
   - `cachedInputRatio`: `cachedContentTokenCount / promptTokenCount` strictly
     when `promptTokenCount > 0` and
     `cachedContentTokenCount <= promptTokenCount`; otherwise `null`. Ratio
     denominator includes only paired valid positive prompt count and valid
     `<= prompt` cached count; excludes unknown cached count.
   - Observation timing & sink resilience: Every returned attempt logged before
     text parse; transport throws yield no event; sink/logger failures may drop
     observation without retry.
   - Supabase project log filtering & metrics: In Supabase project Logs Edge
     Functions `parse-voice`, filter event `voice_ai_gemini_usage`.
     - Hit rate: `sum(true) / (sum(true) + sum(false))`, unknowns excluded.
     - Weighted input fraction: `sum(cached) / sum(prompt)` over valid positive
       pairs only.
     - Known metadata coverage: `totalknown / total_observed_returned_attempts`
       reported separately, where denominator is observed structured
       `voice_ai_gemini_usage` events (total observed returned attempts), not
       unknowable actual returned responses when sink drops logs; missing log
       events or sink failures cannot be inferred as misses or perfect coverage.
   - Safe token aggregates only: zero logging of raw audio, prompts,
     transcripts, categories, accounts, user IDs, or request identities; zero
     SQL/table/new explicit cache/deployment changes.
   - Token fraction is an efficiency metric, not guaranteed USD savings under
     pricing tiers.
   - Deterministic checks PASS; physical devices, live Gemini calls, and real
     PostgreSQL integration remain NOT RUN.

## Technical Context

| Concern         | Verified boundary / disposition                                                                                                                                   | Source                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Runtime         | React Native 0.83.6, Expo `~55.0.27`, `expo-file-system ~55.0.23`, `expo-audio ~55.0.15`                                                                          | `apps/mobile/package.json` @ Voice `f625183…`                                         |
| Cleanup         | Migrated to `expo-file-system/legacy`; `cleanupRecorderResources()` coordinates release before async deletion, stale generations and retry                        | Published `e288d12026bd7076682a6d89b6446bc13c228cab`                                  |
| Server API      | `POST /functions/v1/parse-voice` UNCHANGED; structural zero-byte check preserved; no new server validation or error contracts                                     | `supabase/functions/parse-voice/index.ts`, `contracts/parse-voice-quota.openapi.yaml` |
| Accounting      | SQL 087 contracts UNCHANGED; client silence bypass causes zero recording upload or reservation, consuming zero quota/allowance                                    | `supabase/migrations/087_voice_ai_usage_limits.sql`                                   |
| Local capture   | 30,000ms active cap; client `durationMs < 1500` guard preserved; server duration follow-up is out of scope and not addressed                                      | #389 FR-045/FR-046                                                                    |
| Server detector | SUPERSEDED & RETIRED: Symphonia WASM, Silero ONNX, and Edge Runtime isolate shared-memory blockers retired; prototype files deleted                               | Pinned feasibility findings superseded; scripts deleted                               |
| Client metering | Approved direction: conservative metering in mobile app; candidate threshold -70 dBFS; fail-open on missing/uncertain/sentinels; IMPLEMENTED / deterministic PASS | User decision 2026-10-12                                                              |
| Cache telemetry | Approved direction: non-throwing usageMetadata logging in parse-voice; safe nulls; privacy minimized; IMPLEMENTED / deterministic PASS                            | User decision 2026-10-12                                                              |

## Constitution Check

| Principle                                    | Plan disposition                                                                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline-first and authenticated/user scope   | PASS: Local cleanup is fully on-device; client silence bypass saves local battery and network without altering authenticated server scope.                                                            |
| Documented business logic                    | PASS: Server contracts from #389 preserved unchanged; user decision abandoning server detection recorded; server duration follow-up noted as unaddressed.                                             |
| Type safety and runtime validation           | PASS: Strict TypeScript maintained; no `any` or unsafe assertions.                                                                                                                                    |
| Service-layer separation                     | PASS: Recorder owns local cleanup; pure calculations/classifier in `packages/logic`, platform adapter in `apps/mobile/services`, React refs/lifecycle in `apps/mobile/hooks` without mixing concerns. |
| No premature visual deviation                | PASS: No UI modifications made in this slice; approved copy recorded; translation/integration deferred.                                                                                               |
| Security/privacy and sync                    | PASS: No raw media or audio metrics persisted or logged; zero external provider calls attributable to locally rejected recordings.                                                                    |
| Mandatory RED → GREEN and independent review | PASS: Cleanup slice RED→GREEN EXECUTED (72 tests / 3 suites PASS); future metering TDD will follow strict tests-first rules.                                                                          |

**Cleanup execution checkpoint (2026-10-12):** Test-only RED
`392a26f7bd6acdb94e2efe54d1587866d713d2b0` (10 fail / 1 pass / 11 total, 7.836s)
→ import-only production `84696d745bb8e0fdb37b079a6c76e75af18e7db6` → async mock
reconciliation `7ad8ed5295f05a6f844f82ec2b2727af206fa906` → ESLint repair
included in published `e288d12026bd7076682a6d89b6446bc13c228cab` → root final
GREEN **72 tests / 3 suites / 3.809s** (filesystem, original, r2 recorder
suites) with mobile `tsc`, changed ESLint autofix, formatting, i18n/privacy and
diff PASS, plus a root independent minimal-source review PASS.

## Architecture and Scope

### A. Cleanup Adapter (EXECUTED)

Control flow:

1. Native audio finalizes; recorder stores URI including partial URI
   pre-release.
2. `cleanupRecorderResources` awaits any in-flight start/stop, captures known
   URI, **releases native recorder before filesystem work**, and serializes
   retries with `cleanupPromiseRef`.
3. Supported async `expo-file-system/legacy` `getInfoAsync` and `deleteAsync`
   perform idempotent deletion without runtime throws.

### B. Server Speech Detector (SUPERSEDED & RETIRED)

Server-side decoding and Silero ONNX VAD are abandoned. The prototype harness in
`scripts/voice-audio-validation-spike/` and research templates in
`docs/research/voice-audio-validation-spike/` are deleted. All previous
benchmark findings and Edge Runtime isolate shared-memory blockers are
superseded. Server endpoints in `supabase/functions/parse-voice/` remain
completely unchanged.

### C. Conservative On-Device Metering (IMPLEMENTED; DETERMINISTIC CHECKS PASS)

Future sequence upon implementation:
`Audio capture with metering → evaluate measurements → [insufficient/missing metrics OR non-silent audio: proceed to upload/parse-voice] / [sufficient valid metrics proving clear silence: abort locally with friendly copy, zero recording upload, zero reservation, zero provider cost]`.

Key invariants:

- **Cost optimization only**: Not authoritative speech proof or background-noise
  filtering; makes no claim of semantic silence.
- **Inherent amplitude limitations**: Loudness-only metering cannot
  unconditionally distinguish quiet speech from noise. Amplitude overlap must be
  accounted for by conservative threshold calibration and validation of
  representative quiet, short, and noisy speech on physical devices before
  shipping.
- **Candidate policy**:
  - Threshold `METERING_SILENCE_THRESHOLD_DBFS = -70.0 dBFS` (evaluated strictly
    as `sample < -70.0 dBFS`; any sample at or above `-70.0 dBFS`, including
    exact equality at `-70.0 dBFS`, passes to the server).
  - Minimum active duration `METERING_MIN_ACTIVE_DURATION_MS = 1500 ms` (paused
    wall time excluded).
  - Minimum valid sample count `METERING_MIN_VALID_SAMPLES = 10`.
  - Maximum allowed active time gap `METERING_MAX_ACTIVE_GAP_MS = 250 ms`.
  - Maximum leading uncovered span `METERING_MAX_LEADING_UNCOVERED_MS = 200 ms`.
  - Maximum trailing uncovered span
    `METERING_MAX_TRAILING_UNCOVERED_MS = 200 ms`.
  - Valid sample range: finite double in `(-160.0, 0.0]`.
- **Floor/sentinel fail-open invariant**: On Android, native `getStatus()` maps
  both `maxAmplitude == 0` and caught native exceptions
  (`IllegalStateException`, `RuntimeException`) to `-160.0 dBFS`. Density or
  count of `-160.0 dBFS` samples does NOT prove silence. Any observation of
  `sample <= -160.0 dBFS` poisons that capture generation and MUST fail open to
  the server, regardless of count or duration. Pure floor captures always fail
  open.
- **Platform status preconditions**: Android `AudioRecorder.kt` omits
  `mediaServicesDidReset` from its status bundle, while iOS
  `AudioRecorder.swift` supplies it. The Android adapter accepts normal omission
  of `mediaServicesDidReset` (rejecting only if explicitly `true` or malformed);
  iOS requires `mediaServicesDidReset === false`. Both platforms require
  `canRecord === true`, `isRecording === true`, and finite positive
  `durationMillis > 0`. Unsupported platforms fail open.
- **Layering and Architectural Separation**:
  - `packages/logic` owns pure domain logic: `AudioMeteringClassifier` evaluates
    candidate threshold (`sample < -70.0 dBFS`), gap intervals (`<= 250 ms`),
    leading/trailing spans (`<= 200 ms`), and running summary metrics with O(1)
    counters. It returns an immutable classification decision with zero React or
    DB dependencies.
  - `apps/mobile/services` owns platform and infrastructure adapters:
    `AudioRecorderStatusAdapter` normalizes platform differences (Android normal
    omission of `mediaServicesDidReset` accepted, iOS requires `false`, unknown
    platforms pass), queries durations safely, and coordinates stop readiness.
  - `apps/mobile/hooks` owns React lifecycle and facades only:
    `useVoiceRecorder` coordinates UI intervals, subscriptions, references
    (`cleanupPromiseRef`, `meteringRef`), and cancellation. Hooks MUST NOT own
    audio metering calculations or business rules.
  - **File Budget Discipline**: `useVoiceRecorder.ts` is currently at an
    899-line baseline (< 900 lines max limit). To prevent exceeding the 900-line
    limit, new metering types, lifecycle helpers, and classifier invocations are
    extracted into focused modules
    (`apps/mobile/services/audio-metering-service.ts` or helpers) rather than
    widening the hook further.
- **Sampling cadence and freeze**: Sample once per existing 100ms timer tick
  using active captured duration. Do NOT call redundant immediate `getStatus`
  reads that drain Android `maxAmplitude` and generate artificial floor samples.
  The final metering snapshot FREEZES existing samples collected before release
  WITHOUT extra final query (does not mandate an extra final `getStatus` call
  that drains Android `maxAmplitude`). Cap-completed recordings (at 30 seconds)
  and manual Submits evaluate the exact same finalized snapshot.
- **Fail-open**: Missing, sparse, invalid, non-finite, out-of-range, or
  uncertain metering data pass to the server.
- **Zero server side-effects for silence**: Local rejection prevents recording
  upload, parse-voice submission, work reservation, and Gemini provider
  invocation. Normal auth, entitlement refresh, and sync network calls remain
  unaffected.
- **Approved existing copy**: User approved
  `"We couldn’t hear anything. Please try recording again."` (Arabic:
  `"لم نتمكن من سماع أي شيء. يرجى محاولة التسجيل مرة أخرى."`).
- **Draft landing**: Implementation may land in draft state while owner physical
  device verification remains pending.

### D. Gemini Cache-Hit Telemetry (IMPLEMENTED; DETERMINISTIC CHECKS PASS)

In `supabase/functions/parse-voice/index.ts`, inspect `response.usageMetadata`
after each returned provider attempt before reading text or parsing JSON
(including empty, malformed, or retried responses).

Log event `voice_ai_gemini_usage` with sanitized non-throwing telemetry:

- `model`: stable string (`"gemini-2.5-flash-lite"`).
- `attempt`: 0-indexed attempt index (`0, 1, ...`).
- `promptTokenCount`, `cachedContentTokenCount`, `candidatesTokenCount`,
  `totalTokenCount`: finite non-negative safe integers or `null`.
- `cacheObservedHit`: `true` iff `cachedContentTokenCount > 0` within a valid
  pair; missing is `null` / `unknown` (NOT assumed false or 0).
- `cachedInputRatio`: `cachedContentTokenCount / promptTokenCount` strictly when
  `promptTokenCount > 0` and `cachedContentTokenCount <= promptTokenCount`;
  otherwise `null`.
- Validation rules:
  - Valid pair requires `0 <= cachedContentTokenCount <= promptTokenCount`.
  - Malformed pair `cachedContentTokenCount > promptTokenCount` MUST NOT become
    a hit, does not count as a hit, and ratio is recorded as `null`.
  - Ratio denominator includes only paired valid positive prompt count and valid
    `<= prompt` cached count; excludes unknown cached count.
  - Transport throw before response: no response or metadata exists, transport
    throws yield no event (do NOT fabricate cache miss).
  - Sink resilience: logging failures or sink errors may drop observation
    without retry and must never fail or retry the provider request.
  - Resilient & Private: non-throwing, safe nulls; zero logging of raw audio,
    prompts, transcripts, categories, accounts, request keys, response IDs, or
    user IDs; zero SQL schema/table, deployment, or explicit cache changes.
- Supabase Project Log-View Measurement Guidance:
  - Query: Filter by event `voice_ai_gemini_usage` in Supabase project Logs ->
    Edge Functions -> `parse-voice`.
  - Cache Hit Rate: `sum(true) / (sum(true) + sum(false))`, unknowns/nulls
    strictly excluded from denominator.
  - Weighted Cached Input Fraction:
    `sum(cachedContentTokenCount) / sum(promptTokenCount)` evaluated strictly
    over valid positive pairs (`promptTokenCount > 0` and
    `cachedContentTokenCount <= promptTokenCount`).
  - Known Metadata Coverage:
    `total(events with known status) / total(observed returned attempts)`. The
    denominator is strictly observed structured `voice_ai_gemini_usage` log
    events (`total observed returned attempts`); if the log sink drops an event
    or transport fails, actual returned count cannot be observed from logs alone
    (missing log events / sink failures cannot be inferred as misses or perfect
    coverage).
  - Pricing Caveat: Token fraction reflects caching efficiency, not guaranteed
    linear USD savings under provider pricing tiers and policies.
- Physical & Test Boundaries:
  - Physical Android/iOS quiet, short, noisy, code-switched, and floor tests NOT
    RUN (release gate); SDK Android floor `<= -160.0 dBFS` is uncertain and
    always fails open, cannot promise all pure zero silence blocked; provisional
    `-70.0 dBFS` threshold.
  - Native audio Maestro harness unavailable: deterministic mock cases for
    unit/integration, navigation-only authored existing flow has no run on
    device, physical manual-only, no invented E2E.
  - Deterministic checks PASS; physical devices, live Gemini calls, and real
    PostgreSQL integration remain NOT RUN.

### E. Server Contracts and Duration

Existing request and accounting contracts in
`contracts/parse-voice-quota.openapi.yaml` and migration 087 remain
authoritative and unchanged in source. Mocked Edge handler and RPC regression
tests verify contract schemas and parameter mapping but do NOT execute
PostgreSQL stored procedures, RLS, 35-day replay retention, or row-level locking
concurrency. Live database integration, physical devices, and live Gemini
provider calls are NOT marked proven. Server duration enforcement follow-up is
explicitly out of scope and identified as not addressed.

## Phase 0 — Prototype Retirement (COMPLETED)

- Deleted 10 prototype and research files:
  - `scripts/voice-audio-validation-spike/.gitignore`
  - `scripts/voice-audio-validation-spike/README.md`
  - `scripts/voice-audio-validation-spike/benchmark.ts`
  - `scripts/voice-audio-validation-spike/prepare-fixtures.ts`
  - `scripts/voice-audio-validation-spike/decoder/Cargo.toml`
  - `scripts/voice-audio-validation-spike/decoder/src/lib.rs`
  - `docs/research/voice-audio-validation-spike/fixtures.template.json`
  - `docs/research/voice-audio-validation-spike/results.template.json`
  - `docs/research/voice-audio-validation-spike/feasibility-2026-10-12.md`
  - `docs/research/voice-audio-validation-spike/voice-empty-audio-guard.md`
- Marked historical synthetic/VAD benchmark findings superseded.

## Phase 1 — Cleanup TDD (EXECUTED 2026-10-12)

Results: test-only RED `392a26f7…` (10 fail / 1 pass / 11 total, 7.836s) →
import-only production `84696d74…` → async mock reconciliation `7ad8ed52…` →
root final GREEN 72 tests / 3 suites / 3.809s (filesystem, original, r2 recorder
suites); mobile tsc, ESLint autofix, formatting, i18n/privacy and diff PASS;
independent minimal-source review PASS. Owner native/device validation remains
**NOT RUN**.

## Phase 2 — Server Speech Feasibility & Contracts (SUPERSEDED)

- Server-side WASM decoder, Silero VAD, Edge Runtime isolate shared-memory
  workarounds, and positive Egyptian speech corpus requirements are RETIRED.
- Proposed server-side `no_speech` and validator error contracts are REMOVED.
- Server API contracts remain completely unchanged.

## Phase 3 — Conservative On-Device Metering (IMPLEMENTED; DETERMINISTIC CHECKS PASS)

- Define mobile metering threshold calibration against physical devices (T020
  specification completed independent of physical threshold calibration;
  physical release evidence remains NOT RUN):
  - Candidate threshold: `METERING_SILENCE_THRESHOLD_DBFS = -70.0 dBFS`.
  - Minimum active capture duration: `METERING_MIN_ACTIVE_DURATION_MS = 1500 ms`
    with dense valid samples (minimum `METERING_MIN_VALID_SAMPLES = 10`).
  - Max active gap: `METERING_MAX_ACTIVE_GAP_MS = 250 ms`.
  - Max leading/trailing uncovered spans:
    `METERING_MAX_LEADING_UNCOVERED_MS = 200 ms`,
    `METERING_MAX_TRAILING_UNCOVERED_MS = 200 ms`.
  - Valid sample range: finite double in `(-160.0, 0.0]`.
  - Strict sentinel fail-open: any observation of `sample <= -160.0 dBFS`
    poisons that capture generation and fails open to the server, regardless of
    sample count.
  - Native status preconditions: Android normal omission of
    `mediaServicesDidReset` accepted (rejecting only if explicitly `true` or
    malformed); iOS requires `mediaServicesDidReset === false`. Both require
    `canRecord === true`, `isRecording === true`, `durationMillis > 0`.
  - Single-poll cadence per 100ms timer tick; final snapshot FREEZES existing
    samples before native release WITHOUT extra final query (does not mandate an
    extra getStatus call that drains Android maxAmplitude).
- Author unit tests proving:
  - Clear silence with sufficient valid measurements is rejected locally.
  - Missing or uncertain metering samples pass to server.
  - Sentinel `-160.0 dBFS` samples poison generation and pass to server.
  - Representative quiet, short, and noisy speech within policy passes to
    server.
  - Zero recording upload, parse-voice submission, reservation, or
    provider-start attributable to a locally rejected recording.
- Tests were authored first in source; pre-production RED execution remains NOT
  RUN under the user-directed final-batch exception (T021). Final GREEN checks
  ran as one combined batch with bounded failed/affected reruns after technical
  repairs.
- Verify owner manual testing on physical iOS and Android hardware (release
  gate, not implementation block).

## Phase 4 — Gemini Cache-Hit Telemetry (IMPLEMENTED; DETERMINISTIC CHECKS PASS)

- Author unit tests in `supabase/functions/parse-voice/`:
  - Full valid metadata (`promptTokenCount`, `cachedContentTokenCount`, etc.).
  - Missing or undefined cache fields (handled as `null`).
  - Malformed pair `cached > prompt` (not counted as hit, ratio `null`).
  - Completely missing `usageMetadata` (non-throwing, logs `null`).
  - Empty or malformed model responses and retried attempts.
  - Transport throws before response (no fabricated miss).
  - Verify zero logging of raw audio, prompt text, or user IDs.
- Implement non-throwing `usageMetadata` inspection in `parse-voice` (FR-021).
- Document Supabase log-view measurement guidance (T036):
  - Event `voice_ai_gemini_usage`, model `gemini-2.5-flash-lite`, 0-indexed
    attempt.
  - Counts non-negative safe integers; nullable token counts,
    `cacheObservedHit`, and `cachedInputRatio`.
  - Valid pair required (`0 <= cachedContentTokenCount <= promptTokenCount`);
    malformed pair not counted as hit and ratio `null`.
  - Cached input ratio computed strictly when `promptTokenCount > 0` and
    `cachedContentTokenCount <= promptTokenCount`.
  - Log query via Supabase project Logs -> Edge Functions -> `parse-voice`
    filtering event `voice_ai_gemini_usage`.
  - Cache hit rate: `sum(true) / (sum(true) + sum(false))`, unknowns excluded
    from denominator.
  - Weighted cached input fraction: `sum(cached) / sum(prompt)` strictly across
    valid positive pairs.
  - Known metadata coverage:
    `total(events with known status) / total(observed returned attempts)`
    reported separately (denominator is strictly observed structured
    `voice_ai_gemini_usage` log events; missing events from sink drops cannot be
    inferred as misses or perfect coverage).
  - Every returned attempt logged before text parse; transport throws yield no
    event; sink failures drop observation without retry.
  - Safe token aggregates only; zero raw audio, prompts, transcripts, user IDs,
    or request identities in logs; zero SQL/table/cache/deployment changes.
  - Token fraction does not guarantee linear USD savings.
  - Note: Deterministic checks PASS; physical devices, live Gemini calls, and
    real PostgreSQL integration remain NOT RUN.

## Project Structure

### Canonical documentation, this feature

`specs/391-voice-empty-audio-guard/`

- `spec.md` — prioritized scenarios, FR/NFR, and gating outcomes
- `plan.md` — this updated architecture and retirement plan
- `tasks.md` — sequential tasks with explicit superseded dispositions and T033+
- `contracts/audio-validation-contract.md` — document client-only bypass,
  metering policy, and Gemini cache-hit telemetry contract
- `checklists/analysis.md` — updated semantic cross-artifact analysis
- `checklists/manual-plan.md` — owner manual evidence matrix (cleanup, metering,
  and telemetry physical/live observation marked NOT RUN; deterministic coverage
  PASS)

## Complexity Tracking

No new external dependencies, WASM crates, ONNX models, or server migrations.
Complexity is reduced by retiring the server-side detector and adopting a
conservative client-side metering cost guard and telemetry observation.

**Final validation**:
[Root deterministic verification ledger](./checklists/manual-plan.md#final-deterministic-verification--2026-10-12)
records 230 tests / 11 suites PASS; physical/live-provider/real-database checks
remain NOT RUN. Publication is pending root verification.
