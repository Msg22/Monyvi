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
network requests. Runtime integration is NOT part of this slice (metering
implementation, threshold calibration, device testing, and TDD remain pending).
All spike prototype files have been deleted. Server API contracts remain
completely unchanged; server duration follow-up is out of scope and not
addressed.<br> **Published source basis**: Voice
`f625183373e29d372b658c10b3848a217477400a`; cleanup fix
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

### User Story 2 — Conservative on-device silence rejection before provider start (Priority: P1; SUPERSEDED & PENDING)

**Historical Server Detector Disposition**: Server-side decoder/Silero/ONNX VAD
detection is explicitly ABANDONED and SUPERSEDED. Complex server-side decoding,
WASM Edge shared-memory workarounds, and synthetic/licensed speech corpus
requirements are retired; all spike scripts and research templates are deleted.

**Approved Direction**: Conservative client-side metering in the mobile app. A
user who submits a clearly silent recording should not trigger an upload, create
a server reservation, call Gemini, or consume a provider-start unit. This is
strictly a pre-provider cost optimization, not authoritative speech proof or
server security.

**Inherent Metering Limitations**: A loudness-only meter measures signal
amplitude, not speech presence. Very quiet speech and ambient room noise can
overlap in amplitude. Therefore, on-device metering cannot unconditionally
guarantee never blocking faint sound or detecting speech in noise. To minimize
false rejections, policy must be strictly conservative: reject ONLY unambiguous
silence with sufficient valid capture measurements, fail open on missing or
uncertain metrics, and validate representative quiet, short, and noisy speech on
physical hardware before shipping.

**Approved Proposed Copy**: The user approved the proposed English copy:
`"We couldn’t hear anything. Please try recording again."` Localization (Arabic)
and UI integration remain pending future implementation.

**Independent Test AFTER implementation**: deterministic unit tests and physical
device verification demonstrate that:

1. Clearly silent recordings with sufficient valid capture measurements are
   rejected locally before recording upload or server reservation.
2. Zero recording upload, parse-voice submission, reservation, or provider-start
   charges occur attributable to a locally rejected recording.
3. Missing or uncertain metering measurements pass through to the server.
4. Metering work is NOT implemented in this slice; threshold calibration, device
   testing, and TDD remain pending.

5. **Given** a recording with sufficient valid on-device metering measurements
   confirming clear silence, **when** submission is initiated, **then** reject
   locally on-device without recording upload, parse-voice submission,
   reservation, or provider-start.
6. **Given** missing, zero, or insufficient metering samples, **when**
   submission is initiated, **then** pass through safely to the server.
7. **Given** capture audio during normal mobile operation, **when** evaluated by
   on-device metering, **then** acknowledge that loudness metrics cannot
   unconditionally distinguish quiet speech from ambient noise, requiring
   conservative thresholds calibrated against representative physical device
   recordings before shipping.
8. **Given** existing server structural validation (zero-byte files), **when**
   received by `parse-voice`, **then** existing server behavior remains
   unchanged without new server validation contracts.

### User Story 3 — Preserve user identity, safe retries and owner verification (Priority: P2; contract-gated)

No rejected or retried Voice request can bypass authentication/consent,
overwrite another actor's state, duplicate expensive validation without an
agreed lease policy, replay provider work improperly or block Manual mode.

**Server Contracts Unchanged**: Server contracts remain identical to approved
#389 specifications. No new server `no_speech` or validator error codes are
introduced. Locally rejected inputs bypass server upload entirely. Normal auth,
entitlement refresh, and sync network calls remain unaffected. Server duration
follow-up is out of scope and not addressed.

1. Authenticated active-consent and server quota gates remain authoritative on
   the backend; client silence bypass prevents unnecessary reservation traffic.
2. A same-key replay after a released terminal row produces the actual existing
   `already_processed_result_unavailable` decision under existing SQL contracts.
3. Existing client Manual access, the 30-second local active cap, cancellation,
   retained-audio same-key transport identity, and 35×24-hour replay retention
   remain completely unchanged.

### Edge Cases

- Pure digital or room silence with sufficient valid capture measurements:
  rejected on-device; zero upload or reservation.
- Ambient noise (fan, traffic, typing), breathing, low volume: evaluated under
  conservative thresholds; passes to server unless meeting strict clear-silence
  criteria.
- Missing, empty, or sparse metering measurements: fails open (passes to
  server).
- Native Stop rejects or returns null URI; a partial URI is captured
  pre-release; slow deletion, retry, Discard, Reset, unmount, account change,
  file missing, real I/O failure (handled by US1 cleanup).
- Server duration enforcement follow-up: explicitly out of scope, not addressed.
- Separate owner Starting-latency work on `codex/voice-startup-latency` must not
  be modified here.

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
- **FR-006 (Metering)**: On-device metering must be conservative: reject ONLY
  clearly silent recordings with sufficient valid capture measurements; pass on
  missing or uncertain measurements; validate representative quiet/short/noisy
  speech before shipping, acknowledging amplitude overlap between very quiet
  speech and ambient room noise. **(SUPERSEDES server VAD; implementation
  PENDING)**
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
  replay retention and current same-key transport identity unchanged.
- **FR-012 (Identity)**: Existing server concurrency and reservation handling
  remain unchanged.
- **FR-013 (Policy)**: Preserve approved 30,000-ms **local active capture**
  (paused time excluded) from #389. Server duration enforcement follow-up is
  explicitly out of scope and identified as not addressed.
- **FR-014 (Policy)**: Existing mobile `durationMs < 1500` guard is preserved;
  on-device metering calibration must be tested against legitimate short speech.
- **FR-015 (UX)**: User approved proposed English copy:
  `"We couldn’t hear anything. Please try recording again."` Arabic translation
  and retry UX integration remain pending future implementation; server response
  codes remain unchanged.
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
- **FR-020 (Isolation)**: No route/flow/availability/startup, #389, migration,
  package dependency, hosted or provider change within this documentation
  retirement task. Runtime metering integration is NOT part of this slice.

### Nonfunctional Requirements

- **NFR-001 — Cost Optimization:** Local rejection of clear silence prevents
  unnecessary Gemini provider billing and user quota consumption.
- **NFR-002 — False-Negative Safety:** High-recall priority for speech: require
  conservative clear-silence threshold, pass on missing/uncertain measurements,
  and validate representative quiet/short/noisy speech before shipping.
- **NFR-003 — Privacy/Security:** Auth/consent and user data minimization remain
  intact; no raw audio or sensitive metrics logged.
- **NFR-004 — Compatibility:** Zero new dependencies, zero server schema or
  migration changes, zero hosted Edge runtime modifications.
- **NFR-005 — Cancellation:** Native recorder resource safety and cleanup
  barriers remain verified under US1.
- **NFR-006 — Evidence:** Historical cleanup TDD evidence preserved; owner alone
  verifies physical native/device behavior for pending metering work.

### Key Entities

**TemporaryRecording** (native recorder, known URI, cleanup promise,
generation); **OnDeviceMeteringRecord** (conceptual capture measurements;
sufficient valid samples vs missing/uncertain); **VoiceWorkReservation**
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
  **(PENDING metering implementation)**
- **SC-004:** Conservative silence threshold and fail-open handling for
  missing/uncertain measurements are calibrated against physical device data
  before shipping. **(PENDING metering calibration)**
- **SC-005:** Server detector prototype files deleted; benchmark findings
  superseded; Edge runtime shared-memory and corpus blockers retired.
  **ATTAINED.**
- **SC-006:** Server API and accounting contracts preserved unchanged without
  new error codes or SQL schema modifications. **ATTAINED.**
- **SC-007:** Existing local active capture cap, consent, Manual fallback, and
  replay retention remain passing. **ATTAINED.**
- **SC-008:** Owner manual plan honestly marks native cleanup and future
  on-device metering checks NOT RUN until verified on physical devices.
- **SC-009:** Clean documentation and prototype retirement with zero unapproved
  runtime mutations.

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

**PENDING (Future Scope)**: On-device metering threshold calibration, device
verification, and TDD. Runtime integration is NOT part of this documentation and
prototype retirement slice. Server duration follow-up is out of scope and not
addressed.
