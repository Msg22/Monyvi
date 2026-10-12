# #391 Audio Validation & Telemetry Contract — Documented Disposition

**Date:** 2026-10-12 | **Status:** SERVER DETECTOR RETIRED; CONSERVATIVE
CLIENT-ONLY GUARD & CACHE-HIT TELEMETRY IMPLEMENTED / DETERMINISTIC PASS;
EXISTING SERVER SCHEMAS UNCHANGED.<br> **Authority:**
[issue #391](https://github.com/Msg22/Monyvi/issues/391),
[feature 389 quota contract](../../389-voice-usage-limits/contracts/parse-voice-quota.openapi.yaml).

## Existing Server Contracts (PRESERVED UNCHANGED)

The server API `POST /functions/v1/parse-voice` remains **completely
unchanged**:

1. **Endpoint & Schemas**: Governed authoritatively by
   [`contracts/parse-voice-quota.openapi.yaml`](../../389-voice-usage-limits/contracts/parse-voice-quota.openapi.yaml).
   No new server HTTP response statuses, error codes, JSON envelopes, or
   `no_speech` / validation error schemas are introduced.
2. **Media Sniffing & Boundary Checks**: Current
   `supabase/functions/parse-voice/index.ts` inspects initial magic bytes for
   basic MIME type detection (e.g. distinguishing WebM from M4A/WAV) and rejects
   zero-byte payloads. These checks are simple MIME detection and boundary
   gates; they are **not a new validator**, nor proof of structural validity or
   speech presence. No server-side audio decoding or VAD inference is added.
3. **Usage Accounting & RPCs**: Database migration
   `087_voice_ai_usage_limits.sql` and RPC functions
   (`voice_ai_reserve_work_at`, `voice_ai_mark_provider_started`,
   `voice_ai_release_work`) remain unchanged in source, preserving 35-day replay
   identity and reservation concurrency. Mocked Edge handler/RPC unit
   regressions do NOT execute PostgreSQL retention or concurrency; live database
   integration, physical devices, and live Gemini provider calls are NOT marked
   proven.

## Server Detector Retirement

Server-side WASM decoding (Symphonia) and Silero ONNX speech detection are
**explicitly abandoned and superseded**. Proposed server-side validation error
states, server-side release RPC triggers for no-speech, and Edge Runtime
shared-memory workarounds are permanently retired. All prototype spike files in
`scripts/voice-audio-validation-spike/` and
`docs/research/voice-audio-validation-spike/` have been deleted.

## Client-Side Conservative Silence Metering Contract

Conservative on-device metering is approved strictly as a client-side cost
optimization prior to recording upload:

### 1. Inherent Metering Limitations & Core Principles

- A loudness meter measures signal amplitude / power, **not speech presence**.
  Because amplitude levels for very quiet speech and ambient room noise can
  overlap, metering cannot unconditionally distinguish faint voice from ambient
  sound, nor does it establish semantic silence.
- Metering must prioritize high recall of speech over silence rejection: reject
  **only** recordings meeting strict candidate near-silence criteria with
  complete, unbroken, valid capture coverage.

### 2. Candidate Metering Policy & Strict Validity Rules

- **Platform Native Characteristics**:
  - **Android (`expo-audio`)**: Native `AudioRecorder.kt` computes
    `20 * log10(maxAmplitude / 32767.0)`. When `maxAmplitude == 0` OR when a
    caught native exception occurs (`IllegalStateException`,
    `RuntimeException`), it falls back to the exact sentinel value
    `-160.0 dBFS`.
  - **iOS (`expo-audio`)**: Native `AudioRecorder.swift` queries
    `ref.averagePower(forChannel: 0)` which returns average power in dBFS
    (typically ranging from `-160.0 dBFS` or `-60.0 dBFS` up to `0.0 dBFS`).
- **Strict Sentinel / Floor Fail-Open Invariant**:
  - Because Android native errors and zero-amplitude return the identical floor
    sentinel `-160.0 dBFS`, sample density or frequency does NOT establish
    validity.
  - **Any observation of a floor or sentinel sample (`level <= -160.0 dBFS`)
    poisons that capture generation and MUST fail open to the server**,
    regardless of sample count or duration. Pure floor captures always fail
    open.
  - Missing, empty, or sparse metering samples MUST pass to the server.
  - Native errors, uninitialized state, or caught exceptions MUST pass to the
    server.
- **Exact Deterministic Validity & Coverage Constants**:
  - `METERING_SILENCE_THRESHOLD_DBFS = -70.0 dBFS`: Evaluated strictly as
    `sample < -70.0 dBFS`. Any sample at or above `-70.0 dBFS`
    (`sample >= -70.0 dBFS`), including **exact equality at `-70.0 dBFS`**, is
    considered potentially audible and fails open to the server.
  - `METERING_MIN_ACTIVE_DURATION_MS = 1500 ms`: Minimum active recording
    duration (preserving the existing `< 1500 ms` check; paused time excluded).
  - `METERING_MIN_VALID_SAMPLES = 10`: Minimum count of uncorrupted valid
    metering samples.
  - `METERING_MAX_ACTIVE_GAP_MS = 250 ms`: Maximum allowed active-time gap
    between consecutive valid metering samples.
  - `METERING_MAX_LEADING_UNCOVERED_MS = 200 ms`: Maximum allowed active
    duration before the first valid metering sample.
  - `METERING_MAX_TRAILING_UNCOVERED_MS = 200 ms`: Maximum allowed active
    duration after the last valid metering sample prior to finalization.
  - **Valid Sample Range**: Finite double in `(-160.0, 0.0]`.
  - **Native Recorder Status Preconditions**: Native recorder query must return
    explicit `canRecord == true`, `isRecording == true`, and finite positive
    `durationMillis > 0`. Because installed `expo-audio` Android
    `AudioRecorder.kt` omits `mediaServicesDidReset` entirely from its status
    bundle while iOS `AudioRecorder.swift` supplies it, the Android adapter
    accepts normal absence of `mediaServicesDidReset` (rejecting only if
    explicitly `true` or malformed), whereas iOS requires
    `mediaServicesDidReset === false`. Unsupported platforms fail open. Any
    caught exception or invalid reading poisons that generation to fail open.
  - **Active Tick Clock & Single Poll Cadence**: Metering ticks use active
    captured duration; paused time produces no samples and does not count toward
    active duration. Sampling runs once per existing 100ms timer tick; redundant
    immediate `getStatus` reads that drain Android `maxAmplitude` and generate
    artificial floor samples are forbidden.
  - **Finalization Freeze**: The final metering snapshot FREEZES existing
    samples collected before native recorder release (does not mandate an extra
    final `getStatus` call that drains Android `maxAmplitude`). Normal
    cap-completed recordings (at 30 seconds) and manual Submits evaluate the
    exact same finalized snapshot.
  - **Architectural Layering**: Pure threshold and coverage evaluation is
    encapsulated in `packages/logic` (`AudioMeteringClassifier`) with running
    O(1) counters and immutable classification. Native status normalization is
    in `apps/mobile/services` (`AudioRecorderStatusAdapter`). React hook
    (`useVoiceRecorder`) manages lifecycle, timer ticks, refs, and cancellation
    only without business calculations. File budget stays under 900 lines per
    file (baseline 899).
  - **Actor & Generation Isolation**: Metering snapshots are scoped strictly to
    the active recording generation. Actor switch, Discard, Reset, or new
    recording start flushes all accumulated metering history immediately.

### 3. Client Silence Bypass Contract & Accounting

- When a recording meets all strict criteria for confirmed candidate silence:
  - The client aborts submission locally before initiating any recording upload
    or server request.
  - **Zero Server Footprint**: Zero recording upload, zero `parse-voice`
    invocation, zero work reservation (`voice_ai_reserve_work_at`), zero
    provider-start marking (`voice_ai_mark_provider_started`), and zero
    daily/burst allowance consumed.
  - Routine, unrelated network operations (authentication, profile/consent
    refreshes, database sync) continue without restriction.
- **User Experience**:
  - Displays the approved friendly copy in the Voice error region:
    `"We couldn’t hear anything. Please try recording again."` (Arabic:
    `"لم نتمكن من سماع أي شيء. يرجى محاولة التسجيل مرة أخرى."`).
  - Returns to idle/ready Voice mode with fresh retry and unimpeded access to
    Manual transaction entry. No new modals, alerts, or layout redesigns.

### 4. Implementation & Release Gate Disposition

- Client-side metering is **NOT yet implemented** in this planning lane.
- Candidate threshold values are strictly provisional; mocked tests do not prove
  physical speech recall or microphone calibration. Owner physical testing on
  iOS and Android hardware remains a mandatory release gate before shipping.

## Gemini Cache-Hit Telemetry Contract

To monitor prompt and multimodal caching efficiency on Gemini 2.5 Flash Lite
without breaking existing contracts:

### 1. Observation Boundary, Event Name & Timing

- **Event Identifier**: `voice_ai_gemini_usage`.
- **Target Model**: `gemini-2.5-flash-lite`.
- In `supabase/functions/parse-voice/index.ts`, inspect `response.usageMetadata`
  immediately after each returned provider attempt from
  `ai.models.generateContent()`.
- Observation MUST occur before reading `response.text`, before parsing JSON,
  and regardless of whether the model returned empty text, malformed JSON, or a
  retryable error.
- Every returned attempt is logged before text/JSON parse.
- If a transport/network throw occurs before a response is returned, there is no
  response or metadata; transport throws yield no event (telemetry must NOT
  fabricate a cache miss).
- Sink failures or logging exceptions may drop observation without retry and
  must never throw or alter provider execution/retries.

### 2. Telemetry Fields & Validation Rules

- **Extracted Fields**:
  - `model`: Stable string (`"gemini-2.5-flash-lite"`).
  - `attempt`: 0-indexed attempt number (`0, 1, 2, ...`).
  - `promptTokenCount`: Finite non-negative safe integer or `null`.
  - `cachedContentTokenCount`: Finite non-negative safe integer or `null`.
  - `candidatesTokenCount`: Finite non-negative safe integer or `null`.
  - `totalTokenCount`: Finite non-negative safe integer or `null`.
  - `cacheObservedHit`: Boolean (`true` or `false`) or `null`.
  - `cachedInputRatio`: Finite number in `[0, 1]` or `null`.
- **Validation Rules**:
  - Counts must be non-negative safe integers (reject negative, non-integer, or
    non-finite values as `null`).
  - Valid pair requirement: Enforce
    `0 <= cachedContentTokenCount <= promptTokenCount`.
  - Malformed pair: If `cachedContentTokenCount > promptTokenCount`, the pair is
    malformed; `cacheObservedHit` must be recorded as `null` (unknown, not an
    observed miss), and `cachedInputRatio` must be recorded as `null`.
  - Hit determination: `cacheObservedHit` is `true` if and only if
    `cachedContentTokenCount > 0` within a valid pair. Missing or undefined
    `cachedContentTokenCount` MUST be recorded as `null` / `unknown`, NEVER
    assumed to be `false` or zero.
  - Ratio calculation: `cachedInputRatio` is calculated as
    `cachedContentTokenCount / promptTokenCount` strictly when
    `promptTokenCount > 0` and `cachedContentTokenCount <= promptTokenCount`;
    otherwise `null`. Ratio denominator includes only paired valid positive
    prompt count and valid `<= prompt` cached count; excludes unknown cached
    count.

### 3. Privacy & Resilience Rules

- Telemetry logging MUST be non-throwing: any inspection failure or logging
  error must be caught and ignored, never causing an attempt to fail or retry.
- **Privacy Minimization**: Telemetry MUST NEVER log audio bytes, prompt
  content, categories, accounts, transcripts, user IDs, request keys, response
  IDs, or raw response bodies.
- **No Infrastructure Mutation**: Zero SQL table/schema changes, zero
  migrations, zero new explicit cache management endpoints, and zero deployment
  configuration changes.

### 4. Supabase Project Log-View Measurement Guidance (T036)

- **Log Query & Filtering**:
  - Filter by event `voice_ai_gemini_usage` in Supabase project Logs -> Edge
    Functions -> `parse-voice`.
- **Aggregation Metrics & Formulas**:
  1. **Cache Hit Rate**:
     $$\text{Hit Rate} = \frac{\sum(\text{cacheObservedHit} = \text{true})}{\sum(\text{cacheObservedHit} = \text{true}) + \sum(\text{cacheObservedHit} = \text{false})}$$
     Unknowns/nulls are strictly excluded from the denominator.
  2. **Weighted Cached Input Fraction**:
     $$\text{Weighted Fraction} = \frac{\sum \text{cachedContentTokenCount}}{\sum \text{promptTokenCount}}$$
     Evaluated strictly over valid positive pairs where
     $\text{promptTokenCount} > 0$ and
     $\text{cachedContentTokenCount} \le \text{promptTokenCount}$.
  3. **Known Metadata Coverage**:
     $$\text{Known Coverage} = \frac{\text{total(attempts with known metadata)}}{\text{total(observed returned attempts with structured events)}}$$
     The denominator is observed structured `voice_ai_gemini_usage` events
     (total observed returned attempts), not unknowable actual returned
     responses when sink drops logs; missing log events or sink failures cannot
     be inferred as misses or perfect coverage. Reported separately to track
     observability health.
- **Cost Interpretation**:
  - Cached input token share reflects provider prompt caching utilization, but
    does NOT guarantee linear USD cost reduction under provider pricing policies
    or discount tiers.

## Duration Enforcement Disposition

Server duration and encoder padding enforcement follow-up is explicitly **out of
scope** for this approved cost-only guard and is **not addressed**. The existing
approved 30,000-ms local active capture cap from #389 remains the active
boundary.

## Verification Evidence & Boundary Notes

- **US1 Cleanup**: EXECUTED test-first (test-only RED `392a26f7…` → import-only
  production `84696d74…` → async mock reconciliation `7ad8ed52…` → root final
  GREEN 72 tests / 3 suites / 3.809s PASS).
- **US2 Server Detector**: RETIRED and superseded; prototype files deleted.
- **US2 Client Metering & Physical Release Gate**:
  - Implementation and deterministic verification COMPLETE; provisional
    `-70.0 dBFS` threshold.
  - SDK Android floor `<= -160.0 dBFS` is uncertain and always fails open;
    cannot promise all pure zero silence blocked.
  - Physical Android/iOS quiet, short, noisy, code-switched, and floor tests
    remain **NOT RUN** as a mandatory release gate.
- **Testing Constraints**:
  - User requested no emulators; tests authored first; pre-implementation RED
    NOT RUN (T021 exception). Final GREEN batch and bounded failed/affected
    reruns PASS.
  - Native audio Maestro harness unavailable: deterministic mock cases for
    unit/integration, physical manual-only, no invented E2E.
  - Navigation-only authored existing flow has no run on physical devices.
  - Mocked Edge handler/RPC regressions do NOT execute PostgreSQL
    retention/concurrency; live database integration, physical devices, and live
    Gemini provider calls are NOT marked proven.
- **Documentation Status**:
  - Telemetry contract, log-view guidance, and typechecked deterministic tests
    COMPLETE; physical/live-provider/real-database observation remains NOT RUN.

**Final validation**:
[Root deterministic verification ledger](../checklists/manual-plan.md#final-deterministic-verification--2026-10-12)
records 230 tests / 11 suites PASS; physical/live-provider/real-database checks
remain NOT RUN. Publication is pending root verification.
