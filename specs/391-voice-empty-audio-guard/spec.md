# Feature Specification: #391 Voice Empty-Audio Validation and Recorder Cleanup

**Feature Branch**: `codex/voice-empty-audio-guard`<br> **Date**: 2026-10-12<br>
**Status**: US1 cleanup slice EXECUTED test-first (RED → import-only legacy
import → focused GREEN, root final batch PASS); server-side decoder/Silero/ONNX
VAD pipeline explicitly ABANDONED and SUPERSEDED per user decision. Approved
direction is conservative on-device metering as a cost optimization (reject only
clearly silent recordings with sufficient valid capture measurements;
uncertain/missing measurements pass to server; zero recording upload,
parse-voice submission, reservation, or provider-start attributable to a locally
rejected recording). Normal auth, entitlement refresh, and sync can still make
network requests. Current authorized #391 implementation covers mobile
conservative metering + server cache-hit telemetry source, tests, and
documentation, while avoiding hosted deployment, database migrations, provider
config, startup redesign, latency safeguards, and emulators. Metering and cache
telemetry are IMPLEMENTED with final deterministic checks PASS; acoustic
calibration and physical testing remain NOT RUN. All 10 prototype/research files
have been deleted. Server API contracts remain completely unchanged; server
duration follow-up is out of scope and not addressed.<br> **Published source
basis**: Voice `f625183373e29d372b658c10b3848a217477400a`; cleanup fix
`e288d12026bd7076682a6d89b6446bc13c228cab`.<br> **Authority**:
[issue #391](https://github.com/Msg22/Monyvi/issues/391),
[feature 389](../389-voice-usage-limits/spec.md),
[business rules](../../docs/business/business-decisions.md). This document does
not rewrite approved 389 contracts.

## User Scenarios & Testing

### User Story 1 — Clean up temporary recordings reliably (Priority: P1; TDD EXECUTED)

The user can finish, discard, cancel or retry Voice without keeping stale raw
temporary recordings because deprecated Expo filesystem methods failed.

**Independent Test**: An Expo SDK 55 root filesystem mock throws as documented,
then the supported legacy adapter is proven to inspect/delete the exact known
URI; existing native-release and cleanup-barrier tests remain true. **Executed
(2026-10-12):** test-only RED `392a26f7…` (10 fail / 1 pass / 11 total, 7.836s)
→ import-only production `84696d74…` → async mock reconciliation `7ad8ed52…` →
root final GREEN 72 tests / 3 suites / 3.809s (filesystem, original, r2 recorder
suites) with mobile tsc, ESLint autofix, formatting, i18n/privacy and diff PASS;
independent minimal-source review PASS. Owner native/device verification remains
NOT RUN.

1. **Given** a finalized temporary recording with a known URI, **when** its
   owning flow discards, cleans after success or unmounts, **then** supported
   filesystem APIs delete it once, retaining the existing asynchronous
   release/cleanup ordering.
2. **Given** a missing or already-deleted file, **when** cleanup runs or
   repeats, **then** cleanup succeeds idempotently without attempting to delete
   an absent file.
3. **Given** a failed native Stop, missing finalized URI but known partial URI,
   or a concurrent retry, **when** cleanup starts, **then** native resources
   release before potentially slow filesystem work; the URI was captured before
   release, and the replacement waits without duplicate Stop/delete/release.
4. **Given** genuine filesystem I/O failure, **when** cleanup cannot delete,
   **then** the privacy-safe existing diagnostic remains observable; it is not
   suppressed as a fake success.

### User Story 2 — Conservative on-device silence rejection before provider start (Priority: P1; SUPERSEDED & IMPLEMENTED; DETERMINISTIC CHECKS PASS)

**Historical Server Detector Disposition**: Server-side decoder/Silero/ONNX VAD
detection is explicitly ABANDONED and SUPERSEDED. Complex server-side decoding,
WASM Edge shared-memory workarounds, and synthetic/licensed speech corpus
requirements are retired; all spike scripts and research templates are deleted.

**Approved Direction**: Conservative client-side metering in the mobile app. A
user who submits a recording meeting strict candidate near-silence criteria
should not trigger an upload, create a server reservation, call Gemini, or
consume a provider-start unit. This is strictly a pre-provider cost
optimization, not authoritative speech proof or server security.

**Inherent Metering Limitations & Policy**: A loudness-only meter measures
signal amplitude / power, not speech presence. Very quiet speech and ambient
room noise can overlap in amplitude. Therefore, on-device metering makes no
claim of distinguishing faint speech from quiet ambient room noise or confirming
semantic silence. To minimize false rejections, policy must be strictly
conservative:

- **Deterministic Coverage Constants**:
  - `METERING_SILENCE_THRESHOLD_DBFS = -70.0 dBFS`: Evaluated strictly as
    `sample < -70.0 dBFS`. Any sample at or above `-70.0 dBFS`
    (`sample >= -70.0 dBFS`), including exact equality at `-70.0 dBFS`, is
    considered potentially audible and fails open to the server.
  - `METERING_MIN_ACTIVE_DURATION_MS = 1500 ms`: Minimum active recording
    duration (paused time excluded).
  - `METERING_MIN_VALID_SAMPLES = 10`: Minimum count of uncorrupted valid
    metering samples.
  - `METERING_MAX_ACTIVE_GAP_MS = 250 ms`: Maximum allowed active time gap
    between consecutive valid metering samples.
  - `METERING_MAX_LEADING_UNCOVERED_MS = 200 ms`: Maximum allowed active
    duration before the first valid metering sample.
  - `METERING_MAX_TRAILING_UNCOVERED_MS = 200 ms`: Maximum allowed active
    duration after the last valid metering sample prior to finalization.
  - Valid sample range: finite double in `(-160.0, 0.0]`.
  - Native recorder status requirements: Native recorder must report explicit
    `canRecord == true`, `isRecording == true`, and finite positive
    `durationMillis > 0`. Because installed `expo-audio` Android
    `AudioRecorder.kt` omits `mediaServicesDidReset` entirely while iOS
    `AudioRecorder.swift` supplies it, the Android adapter accepts normal
    absence of `mediaServicesDidReset` (rejecting only if explicitly `true` or
    malformed), whereas iOS requires `mediaServicesDidReset === false`.
    Unsupported platforms fail open. Caught exceptions or invalid readings
    poison that capture generation to fail open.
- **Strict Sentinel / Floor Fail-Open Invariant**:
  - On Android, native `getStatus()` maps both `maxAmplitude = 0` and caught
    native errors (`IllegalStateException`, `RuntimeException`) to
    `-160.0 dBFS`.
  - Density or count of `-160.0 dBFS` samples does NOT establish validity.
  - Any observation of a floor or sentinel sample (`level <= -160.0 dBFS`)
    poisons that capture generation and MUST fail open to the server, regardless
    of sample count or duration. Pure floor captures always fail open.
- **Fail open**: Missing, empty, sparse, invalid, or uncertain measurements pass
  safely to the server.
- **Active clock & finalization**: Metering samples once per existing 100ms tick
  on the active capture timer; redundant immediate `getStatus` reads that drain
  Android `maxAmplitude` are forbidden. Paused time produces zero samples and
  does not count toward active duration. The final snapshot FREEZES existing
  samples collected before release (does not mandate an extra final getStatus
  call that drains Android maxAmplitude); cap-completed recordings (at 30
  seconds) and manual Submits evaluate the exact same finalized snapshot.
- **Validation**: Owner physical Android/iOS quiet, short, and noisy speech
  validation remains a mandatory release gate before shipping.

**Approved Copy & Retry UX**: The user approved the existing error-region copy:
`"We couldn’t hear anything. Please try recording again."` (Arabic:
`"لم نتمكن من سماع أي شيء. يرجى محاولة التسجيل مرة أخرى."`). The error region
shows fresh retry and unimpeded Manual mode access, with zero new modals,
dialogs, or layout changes.

**Independent Test AFTER implementation**: deterministic unit tests and physical
device verification demonstrate that:

1. Recordings meeting strict candidate near-silence criteria with complete valid
   coverage are rejected locally before recording upload or server reservation.
2. Zero recording upload, parse-voice submission, reservation, or provider-start
   charges occur attributable to a locally rejected recording.
3. Missing or uncertain metering measurements, or captures observing sentinel
   `-160.0 dBFS` readings, pass through to the server.
4. Approved current implementation pending, physical calibration release gate.

5. **Given** a recording with complete valid on-device metering coverage meeting
   strict candidate near-silence criteria (`< -70.0 dBFS`), **when** submission
   is initiated, **then** reject locally on-device without recording upload,
   parse-voice submission, reservation, or provider-start.
6. **Given** missing, zero, sparse, sentinel `-160.0 dBFS`, or uncertain
   metering samples, **when** submission is initiated, **then** pass through
   safely to the server.
7. **Given** capture audio during normal mobile operation, **when** evaluated by
   on-device metering, **then** acknowledge that loudness metrics cannot
   unconditionally distinguish quiet speech from ambient noise, requiring
   conservative thresholds calibrated against representative physical device
   recordings before shipping.
8. **Given** existing server structural validation (zero-byte files), **when**
   received by `parse-voice`, **then** existing server behavior remains
   unchanged without new server validation contracts.

### User Story 3 — Preserve user identity, safe retries, owner verification & cache tracking (Priority: P2; contract-gated)

No rejected or retried Voice request can bypass authentication/consent,
overwrite another actor's state, duplicate expensive validation without an
agreed lease policy, replay provider work improperly or block Manual mode.

**Server Contracts Unchanged**: Server contracts remain identical to approved
#389 specifications and migration 087 remains authoritative and unchanged in
source. No new server `no_speech` or validator error codes are introduced.
Mocked Edge handler and RPC regression tests verify parameter shapes and error
mappings but do NOT execute PostgreSQL stored procedures, RLS, 35-day replay
retention, or row-level locking concurrency; live database integration, physical
devices, and live Gemini provider calls are NOT marked proven. Locally rejected
inputs bypass server upload entirely. Normal auth, entitlement refresh, and sync
network calls remain unaffected. Server duration follow-up is out of scope and
not addressed.

**Gemini Cache-Hit Telemetry**: In `parse-voice`, observe Gemini 2.5 Flash Lite
`response.usageMetadata` after each returned provider attempt (before reading
text or parsing JSON, including empty, malformed, or retried responses). Log
event `voice_ai_gemini_usage` with sanitized, non-throwing telemetry: `model`
(`"gemini-2.5-flash-lite"`), 0-indexed `attempt`, `promptTokenCount`,
`cachedContentTokenCount`, `candidatesTokenCount`, `totalTokenCount`,
`cacheObservedHit`, and `cachedInputRatio`.

- Validation: Valid counts must be finite non-negative safe integers or `null`.
  Valid pair requires `0 <= cachedContentTokenCount <= promptTokenCount`.
- Malformed pair: If `cachedContentTokenCount > promptTokenCount`, do NOT count
  as a cache hit (record `null` or `false`), and record ratio as `null`.
- Cache hit determination: `cacheObservedHit` is `true` if and only if
  `cachedContentTokenCount > 0` within a valid pair. Missing cached count is
  recorded as `null`/`unknown`, NOT assumed `false` or zero.
- `cachedInputRatio`: Calculated as `cachedContentTokenCount / promptTokenCount`
  strictly when `promptTokenCount > 0` and
  `cachedContentTokenCount <= promptTokenCount`; otherwise `null`. Ratio
  denominator includes only paired valid positive prompt count and valid
  `<= prompt` cached count; excludes unknown cached count.
- Observation timing & sink resilience: Every returned attempt logged before
  text parse; transport throws yield no event/response (telemetry must NOT
  fabricate a cache miss); sink failures drop observation without retry.
- Supabase project log query & metrics: In Supabase project Logs Edge Functions
  `parse-voice`, filter event `voice_ai_gemini_usage`:
  - Hit rate: `sum(true) / (true + false)`, unknowns excluded from denominator.
  - Weighted input fraction: `sum(cached) / sum(prompt)` over valid positive
    pairs only.
  - Known metadata coverage:
    `total(events with known status) / total(observed returned attempts)`. The
    denominator is strictly observed structured `voice_ai_gemini_usage` log
    events (`total observed returned attempts`); if the log sink drops an event
    or transport fails, actual returned count cannot be observed from logs alone
    (missing log events / sink failures cannot be inferred as misses or perfect
    coverage).
- Privacy & schema boundaries: Zero logging of raw audio, prompts, transcripts,
  categories, accounts, user IDs, or request keys; zero SQL/table/new explicit
  cache/deployment changes.
- Token fraction is an efficiency metric, not guaranteed USD savings under
  provider pricing tiers.
- Physical & test boundaries: Physical Android/iOS
  quiet/short/noisy/code-switched/floor tests remain NOT RUN release gate; SDK
  Android floor `<= -160.0 dBFS` is uncertain and always fails open, cannot
  promise all pure zero silence blocked; provisional `-70.0 dBFS` threshold.
  User requested no emulator and final-batch checks; authored tests first RED
  NOT RUN. Native audio Maestro harness unavailable; navigation-only authored
  existing flow has no run on device; deterministic mock cases unit/integration,
  physical manual-only, no invented E2E. Deterministic checks PASS; physical
  devices, live Gemini calls, and real PostgreSQL integration remain NOT RUN.

1. Authenticated active-consent and server quota gates remain authoritative on
   the backend; client silence bypass prevents unnecessary reservation traffic.
2. A same-key replay after a released terminal row produces the actual existing
   `already_processed_result_unavailable` decision under existing unchanged SQL
   contracts (mocked tests do not execute PostgreSQL concurrency/retention; live
   DB integration not proven).
3. Existing client Manual access, the 30-second local active cap, cancellation,
   retained-audio same-key transport identity, and 35×24-hour replay retention
   remain completely unchanged in source.

### Edge Cases

- Pure digital or room silence meeting candidate threshold `< -70.0 dBFS` with
  complete valid capture coverage: rejected on-device; zero upload or
  reservation.
- Any sample at or above `-70.0 dBFS` (including exact equality `-70.0 dBFS`):
  passes to server.
- Pure floor / sentinel values (`<= -160.0 dBFS`): poisons generation and fails
  open to server regardless of sample count.
- Ambient noise (fan, traffic, typing), breathing, low volume: evaluated under
  conservative thresholds; passes to server unless meeting strict clear-silence
  criteria.
- Missing, empty, or sparse metering measurements, or gaps > 250 ms: fails open
  (passes to server).
- Native Stop rejects or returns null URI; a partial URI is captured
  pre-release; slow deletion, retry, Discard, Reset, unmount, account change,
  file missing, real I/O failure (handled by US1 cleanup).
- Server duration enforcement follow-up: explicitly out of scope, not addressed.
- Gemini response without `usageMetadata` or with partial token counts: safely
  treated as unknown/null without throwing or altering response/retry handling.
- Transport/network throws before Gemini returns: no fabricated cache miss
  logged.

## Requirements

### Functional Requirements

- **FR-001 (Cleanup)**: Use SDK-55-supported asynchronous
  `expo-file-system/legacy` `getInfoAsync`/`deleteAsync` for known temporary
  Voice audio; never rely on runtime-throwing root imports. **(EXECUTED)**
- **FR-002 (Cleanup)**: Preserve missing-file idempotence, deletion once, known
  partial URI capture before native release, release before slow filesystem
  lookup, and blocking new starts while prior cleanup remains pending.
  **(EXECUTED)**
- **FR-003 (Cleanup)**: Preserve current stop/abort/generation/actor safety and
  genuine filesystem-error diagnostics without recording URI, raw audio,
  account, transcript or provider content in logs. **(EXECUTED)**
- **FR-004 (Source)**: Existing server-side zero-byte and structural payload
  checks in `parse-voice` remain unchanged; complex server-side byte decoding is
  retired.
- **FR-005 (Cost Optimization)**: On-device metering is approved strictly as a
  client-side cost optimization to prevent provider calls on clear silence; it
  is NOT authoritative speech proof or background-noise discrimination.
- **FR-006 (Metering)**: On-device metering must be conservative: candidate
  threshold `METERING_SILENCE_THRESHOLD_DBFS = -70.0 dBFS` (equality at
  `-70.0 dBFS` passes to server), minimum active duration
  `METERING_MIN_ACTIVE_DURATION_MS = 1500 ms`, minimum valid count
  `METERING_MIN_VALID_SAMPLES = 10`, max active gap
  `METERING_MAX_ACTIVE_GAP_MS = 250 ms`, max leading/trailing uncovered spans
  `METERING_MAX_LEADING_UNCOVERED_MS = 200 ms`,
  `METERING_MAX_TRAILING_UNCOVERED_MS = 200 ms`, valid sample range finite
  double in `(-160.0, 0.0]`, native status preconditions (`canRecord = true`,
  `isRecording = true`, finite positive `durationMillis > 0`; Android accepts
  normal omission of `mediaServicesDidReset`, rejecting only if explicitly
  true/malformed; iOS requires `mediaServicesDidReset === false`); sample once
  per existing 100ms tick without redundant `getStatus` reads; reject ONLY
  recordings meeting strict candidate near-silence criteria with complete valid
  coverage; fail open on missing, sparse, invalid, or uncertain measurements;
  Android `-160.0 dBFS` floor/sentinel poisons generation and fails open
  regardless of count; validate representative quiet/short/noisy speech on
  physical devices before shipping. **(SUPERSEDES server VAD; implementation and
  deterministic verification COMPLETE; physical calibration NOT RUN)**
- **FR-007 (Server)**: Authentication and fresh active AI-processing consent
  precede server parsing; retain request key, IANA timezone, policy and actor
  gates under existing unchanged contracts.
- **FR-008 (Server Bypass)**: Client-rejected silent input bypasses recording
  upload and parse-voice submission entirely: zero recording upload, zero
  reservation attempts, and zero provider charges attributable to the rejected
  recording. Normal auth, entitlement refresh, and sync network calls remain
  unaffected. **(SUPERSEDES server-side decode-after-reservation)**
- **FR-009 (Accounting)**: Because client-rejected audio never submits to
  `parse-voice`, no server reservation or provider-start accounting occurs;
  existing server RPC semantics remain untouched. **(SUPERSEDES server no-speech
  release RPC)**
- **FR-010 (Errors)**: Existing server error contracts remain unchanged; no new
  server validator error codes are added. **(SUPERSEDES server validator error
  contracts)**
- **FR-011 (Identity)**: Preserve 35-day immutable first-created request-key
  replay retention and current same-key transport identity unchanged in source.
  Mocked Edge handler/RPC regression tests verify parameter shapes and error
  mappings but do NOT execute PostgreSQL stored procedures, RLS, 35-day replay
  retention, or row-level locking concurrency; live database integration,
  physical devices, or live Gemini provider calls are NOT marked proven.
- **FR-012 (Identity)**: Existing server concurrency and reservation handling
  remain unchanged in source; mocked tests do not execute PostgreSQL
  concurrency.
- **FR-013 (Policy)**: Preserve approved 30,000-ms **local active capture**
  (paused time excluded) from #389. Server duration enforcement follow-up is
  explicitly out of scope and identified as not addressed.
- **FR-014 (Policy)**: Existing mobile `durationMs < 1500` guard is preserved;
  on-device metering calibration must be tested against legitimate short speech.
- **FR-015 (UX)**: User approved existing error-region copy:
  `"We couldn’t hear anything. Please try recording again."` (Arabic:
  `"لم نتمكن من سماع أي شيء. يرجى محاولة التسجيل مرة أخرى."`). Provides fresh
  retry and Manual access; zero new modals/redesigns; server response codes
  remain unchanged.
- **FR-016 (Compatibility)**: Preserve current `parse-voice` successful
  financial response, existing Gemini 2.5 Flash-Lite execution, provider
  retries, consent, quota refusal envelopes, Manual access, and deferred #384
  reservation UX unchanged.
- **FR-017 (Feasibility)**: Historical Symphonia WASM and Silero ONNX benchmarks
  are SUPERSEDED; server detector prototypes deleted; licenses, Edge runtime,
  and corpus blockers retired. **(SUPERSEDED)**
- **FR-018 (Privacy)**: Do not persist raw audio, metering logs, or transcripts;
  preserve privacy-safe diagnostics only.
- **FR-019 (TDD)**: Cleanup TDD executed and green; on-device metering TDD,
  threshold calibration, and owner device verification remain pending.
- **FR-020 (Isolation)**: Bounded implementation scope: authorized mobile
  metering and server telemetry source, tests, and documentation only; no
  route/flow redesign, availability/startup alterations, #389 changes, database
  migrations, package dependencies, hosted deployments, provider configurations,
  or emulators.
- **FR-021 (Cache Telemetry)**: In `supabase/functions/parse-voice`, observe
  Gemini 2.5 Flash Lite `response.usageMetadata` immediately after each returned
  provider attempt before reading `response.text` or parsing JSON (including
  empty, malformed, or retried responses). Log event `voice_ai_gemini_usage`
  containing `model` (`"gemini-2.5-flash-lite"`), 0-indexed `attempt`, validated
  non-negative safe integer token counts (`promptTokenCount`,
  `cachedContentTokenCount`, `candidatesTokenCount`, `totalTokenCount`),
  `cacheObservedHit`, and `cachedInputRatio`. Enforce valid pair
  `0 <= cachedContentTokenCount <= promptTokenCount`; malformed pair
  `cached > prompt` is NOT counted as a cache hit and ratio is `null`;
  `cachedInputRatio` denominator strictly includes paired valid positive prompt
  count and valid `<= prompt` cached count; transport throw before response
  yields no event (does not fabricate cache miss); sink failures drop
  observation without retry. Known metadata coverage denominator is strictly
  observed structured `voice_ai_gemini_usage` log events
  (`total observed returned attempts`); missing log events / sink failures
  cannot be inferred as misses or perfect coverage. Telemetry is non-throwing
  and privacy-safe (zero logging of raw audio, prompts, transcripts, categories,
  accounts, or user IDs; zero SQL schema, migration, or deployment changes).
  Deterministic checks PASS; physical devices, live Gemini calls, and real
  PostgreSQL integration remain NOT RUN.

### Nonfunctional Requirements

- **NFR-001 — Cost Optimization:** Local rejection of clear silence prevents
  unnecessary Gemini provider billing and user quota consumption.
- **NFR-002 — False-Negative Safety:** High-recall priority for speech: require
  conservative clear-silence threshold, pass on missing/uncertain measurements,
  and validate representative quiet/short/noisy speech before shipping.
- **NFR-003 — Privacy/Security:** Auth/consent and user data minimization remain
  intact; no raw audio or sensitive metrics logged; Gemini cache telemetry logs
  sanitized token metrics only with zero audio, prompt, or user identity
  leakage.
- **NFR-004 — Compatibility:** Zero new dependencies, zero server schema or
  migration changes, zero hosted Edge runtime modifications.
- **NFR-005 — Cancellation:** Native recorder resource safety, generation
  isolation, and cleanup barriers remain verified under US1.
- **NFR-006 — Evidence:** Historical cleanup TDD evidence preserved; owner alone
  verifies physical native/device behavior for pending metering work.

### Key Entities

**TemporaryRecording** (native recorder, known URI, cleanup promise,
generation); **AudioMeteringClassifier** (pure threshold, gap, and coverage
evaluation in `packages/logic`); **AudioRecorderStatusAdapter**
(platform-specific `mediaServicesDidReset` and status mapping in
`apps/mobile/services`); **useVoiceRecorder** (React lifecycle, timer, refs, and
cancellation in `apps/mobile/hooks` without business calculations);
**GeminiUsageTelemetry** (model, attempt, prompt/cached/candidates/total token
counts, cache observed hit, cached input ratio); **VoiceWorkReservation**
(existing unchanged user+request-key+lease+provider-start status). No schema or
migration changes authorized.

## Success Criteria

- **SC-001:** Root observes meaningful RED under SDK55 throwing-root mocks and
  GREEN after the legacy import change. **ATTAINED (2026-10-12).**
- **SC-002:** Known temporary URI deletion occurs once, missing file is safe,
  genuine I/O errors remain visible, deterministic recorder suites pass.
  **ATTAINED for deterministic suites (72/3/3.809s); owner native/device proof
  remains NOT RUN.**
- **SC-003:** Locally rejected silent audio invokes zero recording upload, zero
  parse-voice submission, zero reservations, and zero provider-start accounting.
  **ATTAINED in deterministic flow tests; physical network observation NOT
  RUN.**
- **SC-004:** Conservative silence threshold and fail-open handling for
  missing/uncertain measurements are calibrated against physical device data
  before shipping. **(PENDING metering calibration)**
- **SC-005:** Server detector prototype files deleted; benchmark findings
  superseded; Edge runtime shared-memory and corpus blockers retired.
  **ATTAINED.**
- **SC-006:** Server API and accounting contracts preserved unchanged without
  new error codes or SQL schema modifications. **ATTAINED.**
- **SC-007:** Existing local active capture cap, consent, Manual fallback, and
  replay handling remain passing in deterministic regressions. **ATTAINED for
  mocked tests; actual PostgreSQL retention/concurrency NOT RUN.**
- **SC-008:** Owner manual plan honestly marks native cleanup and on-device
  metering checks NOT RUN until verified on physical devices.
- **SC-009:** Clean documentation and prototype retirement with zero unapproved
  runtime mutations.
- **SC-010:** Safe per-returned-attempt Gemini cache telemetry in `parse-voice`
  logs event `voice_ai_gemini_usage` (model `gemini-2.5-flash-lite`, 0-indexed
  attempt, nullable safe integer token counts, `cacheObservedHit`, and
  `cachedInputRatio`) without throwing or logging private data, covering all
  returned attempts (including empty/malformed/retried) without fabricating
  misses on transport errors. Log analysis supports cache hit rate
  `sum(true)/(true+false)` excluding unknowns, weighted cached input fraction
  `sum(cached)/sum(prompt)` across valid positive pairs, and separate known
  metadata coverage
  `total(events with known status) / total(observed returned attempts)`
  (denominator is strictly observed structured `voice_ai_gemini_usage` log
  events; missing events from sink drops cannot be inferred as misses or perfect
  coverage). Deterministic checks PASS; physical devices, live Gemini calls, and
  real PostgreSQL integration remain NOT RUN.

## Assumptions and Open Gates

**EXECUTED**: Standalone cleanup TDD completed over
`apps/mobile/hooks/useVoiceRecorder.ts`,
`apps/mobile/__tests__/hooks/voice-recorder-fixtures.ts`, and
`apps/mobile/__tests__/hooks/useVoiceRecorder.filesystem.test.ts`: RED
(`392a26f7…`) → import-only production (`84696d74…`) → async mock reconciliation
(`7ad8ed52…`) → root final batch GREEN (72 tests / 3 suites / 3.809s PASS).

**SUPERSEDED / RETIRED**: Edge decoder/VAD integration, WASM shared memory
isolate issues, missing licensed positive corpus, and server-side validation
error contracts. Prototype files in `scripts/voice-audio-validation-spike/` and
`docs/research/voice-audio-validation-spike/` have been deleted.

**IMPLEMENTED / DETERMINISTIC CHECKS PASS**: Client metering, approved EN/AR
copy, cache telemetry, and regression tests are complete. **OPEN RELEASE GATE**:
Physical acoustic calibration and native validation remain NOT RUN.
Source/tests/docs remain bounded to #391; hosted deployment, migrations,
provider configuration, and startup redesign are excluded. Server duration
follow-up remains out of scope and not addressed.

**Final validation**:
[Root deterministic verification ledger](./checklists/manual-plan.md#final-deterministic-verification--2026-10-12)
records 230 tests / 11 suites PASS; physical/live-provider/real-database checks
remain NOT RUN. Publication is pending root verification.
