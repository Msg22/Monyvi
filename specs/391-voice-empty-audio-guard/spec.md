# Feature Specification: #391 Voice Empty-Audio Validation and Recorder Cleanup

**Feature Branch**: `codex/voice-empty-audio-guard`<br>
**Date**: 2026-10-12<br>
**Status**: PLANNING ONLY. The SDK 55 cleanup slice is READY for test-first authorization; authoritative speech validation is BLOCKED on feasibility and contract decisions. No implementation, benchmark or device run is implied.<br>
**Published source basis**: Voice `f625183373e29d372b658c10b3848a217477400a`; stacked research branch `a7e1e00e118b4b8a989387d48181fdde0c821f3d` (preserves nine prototype/research files).<br>
**Authority**: [issue #391](https://github.com/Msg22/Monyvi/issues/391), [feature 389](../389-voice-usage-limits/spec.md), [business rules](../../docs/business/business-decisions.md), [existing research](../../docs/research/voice-empty-audio-guard.md), [nonproduction spike](../../scripts/voice-audio-validation-spike/README.md). This document does not rewrite approved 389 contracts.

## User Scenarios & Testing

### User Story 1 — Clean up temporary recordings reliably (Priority: P1; independently READY for TDD)

The user can finish, discard, cancel or retry Voice without keeping stale raw temporary recordings because deprecated Expo filesystem methods failed.

**Independent Test**: An Expo SDK 55 root filesystem mock throws as documented, then the supported legacy adapter is proven to inspect/delete the exact known URI; existing native-release and cleanup-barrier tests remain true.

1. **Given** a finalized temporary recording with a known URI, **when** its owning flow discards, cleans after success or unmounts, **then** supported filesystem APIs delete it once, retaining the existing asynchronous release/cleanup ordering.
2. **Given** a missing or already-deleted file, **when** cleanup runs or repeats, **then** cleanup succeeds idempotently without attempting to delete an absent file.
3. **Given** a failed native Stop, missing finalized URI but known partial URI, or a concurrent retry, **when** cleanup starts, **then** native resources release before potentially slow filesystem work; the URI was captured before release, and the replacement waits without duplicate Stop/delete/release.
4. **Given** genuine filesystem I/O failure, **when** cleanup cannot delete, **then** the privacy-safe existing diagnostic remains observable; it is not suppressed as a fake success.

### User Story 2 — Reject provably unusable recordings before a provider start (Priority: P1; BLOCKED)

A user who submits silence, noise-only audio or malformed bytes should not unnecessarily trigger Gemini or consume a provider-start unit, while quiet/short valid Egyptian Arabic, English and code-switched speech remains eligible.

**Independent Test AFTER readiness**: deterministic actual-byte decoder/VAD fixtures, authorized labeled positives/negatives and mocked provider/SQL RPCs demonstrate that unusable input causes **zero provider starts**, and valid speech can still reach the existing parser/accounting flow. Tests must not interpret a file's size, amplitude, container metadata or client flags as speech proof.

1. **Given** missing/zero bytes, malformed media or an unsupported submitted container, **when** actual bytes are examined, **then** reject before provider start using an agreed response category.
2. **Given** a valid supported container containing confidently demonstrated silence or non-speech, **when** approved high-recall validation completes, **then** no Gemini invocation/provider-start unit occurs and a known-not-started reservation is released only when authoritative SQL confirms that outcome.
3. **Given** a quiet/short Arabic, English, code-switched or speech-over-noise clip, **when** validation is run, **then** a properly measured acceptable speech-evidence rule does not falsely block legitimate capture; semantic financial content remains Gemini/parser territory.
4. **Given** inconclusive speech classification, **when** decoded evidence cannot confidently distinguish speech from silence/noise, **then** accepting, rejecting, or escalating classification remains an explicit high-recall policy decision; inconclusive audio is **not automatically rejected**.
5. **Given** an unavailable decoder/model, lease expiry, or failed/ambiguous release or provider-start RPC, **when** authoritative accounting state cannot be established, **then** provider work and charging remain fail-closed under the separately reconciled retry contract. Never claim release/refund or provider start without authoritative evidence.

### User Story 3 — Preserve user identity, safe retries and owner verification (Priority: P2; contract-gated)

No rejected or retried Voice request can bypass authentication/consent, overwrite another actor's state, duplicate expensive validation without an agreed lease policy, replay provider work improperly or block Manual mode.

**Independent Test AFTER reconciliation**: request-key and actor generation tests reproduce released-terminal same-key replay rejection and concurrent accepted reservation duplicates, before any proposed SQL/response change.

1. Authenticated active-consent and server quota gates remain authoritative; a failed/cancelled request cannot create another user's result.
2. A same-key replay after a released terminal row produces the actual existing `already_processed_result_unavailable` decision until an approved retry design exists; do **not** promise automatic same-key retry.
3. Repeated requests sharing a still-reserved key are not assumed to be serialized through decoder/VAD just because provider-start accounting is guarded.
4. Existing client Manual access, the 30-second local cap, cancellation, retained-audio same-key transport identity, and 35×24-hour replay retention remain unchanged unless separately authorized.

### Edge Cases

- Actual AAC/M4A bytes are truncated after a plausible `ftyp` signature; unknown byte sequences currently default to WebM and must not be silently trusted.
- Valid duration/size but pure silence; breathing, fan, traffic, taps, music, background noise; speech over those backgrounds; very quiet speech and genuine short phrases.
- WAV/WebM/MP3/OGG signatures versus proven decoder support: do not silently deprecate existing accepted inputs without format reconciliation.
- AAC encoder padding/gapless limitations, inconsistent container timing and possible forged metadata; **no duration-padding tolerance selected**.
- Native Stop rejects or returns null URI; a partial URI is captured pre-release; slow deletion, retry, Discard, Reset, unmount, account change, file missing, real I/O failure.
- Validator timeout, memory/CPU budget exhaustion, model import failure, absent licensed fixture, unknown lease/provider-start outcome, duplicate same-key concurrent work.
- Separate owner Starting-latency work on `codex/voice-startup-latency` must not be modified here.

## Requirements

### Functional Requirements

- **FR-001 (Cleanup)**: Use SDK-55-supported asynchronous `expo-file-system/legacy` `getInfoAsync`/`deleteAsync` for known temporary Voice audio; never rely on runtime-throwing root imports.
- **FR-002 (Cleanup)**: Preserve missing-file idempotence, deletion once, known partial URI capture before native release, release before slow filesystem lookup, and blocking new starts while prior cleanup remains pending.
- **FR-003 (Cleanup)**: Preserve current stop/abort/generation/actor safety and genuine filesystem-error diagnostics without recording URI, raw audio, account, transcript or provider content in logs.
- **FR-004 (Source)**: Reject known missing/zero-sized media and bounded malformed actual bytes; verify actual supported container and audio track, rather than defaulting unknown data to WebM.
- **FR-005 (Source)**: Do not authorize a speech verdict based solely on file size, metadata/client duration, metering, client `hasSpeech`, volume, or MIME name.
- **FR-006 (Speech)**: Evaluate actual decoded audio using a **benchmarked** high-recall approach that preserves quiet Egyptian Arabic, English, code-switch, legitimate short speech and speech-over-noise. No threshold or minimum voiced interval is approved.
- **FR-007 (Server)**: Authentication and fresh active AI-processing consent precede validation; retain request key, IANA timezone, policy and actor gates.
- **FR-008 (Server)**: Do cheap structural validation before entitlement reservation; place expensive decoding/classification **after accepted reservation but before** `voice_ai_mark_provider_started` and Gemini.
- **FR-009 (Server)**: Proven no-speech/malformed input must never call Gemini or mark provider start, and must not consume provider-start allowance; release only still-reserved known-not-started work using existing authoritative RPC semantics.
- **FR-010 (Server)**: Distinguish proven unusable, inconclusive classification, validator failure, no provider-start, and ambiguous release/started states; do not manufacture consumption/refund claims or blindly retry providers.
- **FR-011 (Identity)**: Preserve 35-day immutable first-created request-key replay retention and current same-key transport identity; explicitly reconcile released-terminal replay returning `already_processed_result_unavailable` before asserting retryability.
- **FR-012 (Identity)**: Explicitly reconcile simultaneous accepted requests reusing one active reservation, decoder/VAD duplicate execution, abort and reservation lease expiry; do not assume reserve serializes expensive validation.
- **FR-013 (Policy)**: Preserve approved 30,000-ms **local active capture** (paused time excluded) from #389. Earlier research mentioning 60 seconds refers to an **obsolete source revision**, not current approval. Authoritative server duration/padding enforcement is a new unresolved decision.
- **FR-014 (Policy)**: Existing mobile `durationMs < 1500` guard is a non-speech client rule; reconcile valid short speech before changing it or treating it as server validation.
- **FR-015 (UX)**: New unusable-audio status/HTTP body, localized user copy and Retry/Manual interaction require product/contract approval; no new response code or copy is approved by planning.
- **FR-016 (Compatibility)**: Preserve current `parse-voice` successful financial response, existing Gemini 2.5 Flash-Lite execution, provider retries, consent, quota refusal envelopes, Manual access, and deferred #384 reservation UX.
- **FR-017 (Feasibility)**: Benchmark pinned AAC/M4A decode→mono/resample→VAD for 5/15/30-second fixtures, measured local/Edge cold/warm CPU, wall time, true peak memory, complete deployed bundle, quality and licensed provenance **before** server production work.
- **FR-018 (Privacy)**: Do not persist raw audio/PCM/transcripts/provider payloads or introduce another hosted service; preserve only approved privacy-safe bounded outcome and aggregate metrics.
- **FR-019 (TDD)**: Write and obtain actual failing SDK55 adapter tests before cleanup source edit; write and obtain actual failing server/accounting tests **only after** feasibility, explicit contract and branch gates.
- **FR-020 (Isolation)**: No route/flow/availability/startup, #389, migration, package dependency, hosted or provider change within this planning assignment. Future source edit paths require a separate exact grant.

### Nonfunctional Requirements

- **NFR-001 — Latency/resources:** Measure cold/warm init+AAC decode+VAD stages and Edge active CPU/memory/bundle headroom against published limits; a local CPU/RSS proxy is not hosted proof.
- **NFR-002 — False-negative safety:** Favor preservation of valid quiet/short speech; report per-class false-negative/false-positive counts and uncertainty, and choose no arbitrary numerical threshold from a library example.
- **NFR-003 — Privacy/security:** Auth/consent, user-scope and data minimization remain intact; synthetic or explicitly licensed audio only in reproducible benchmarks, stored outside tracked repository.
- **NFR-004 — Compatibility:** No new npm/native package, lockfile, mobile build, Edge deployment, migration, extra service or provider without separate authorization.
- **NFR-005 — Cancellation:** No native resource leak or cross-generation resurrection even when native release precedes slow filesystem deletion; all validation/release outcomes must be unambiguous or explicitly handled as unknown.
- **NFR-006 — Evidence:** Root owns prerequisite commands, mandatory real RED/GREEN, full final checks and publication; owner alone verifies native/device/audio/OS behavior. No blocked Deno/FFmpeg retry or bypass.

### Key Entities (conceptual; no new persistence proposed)

**SubmittedAudio** (actual bounded bytes and container evidence); **AudioValidationDecision** (proposed internal structural invalid / provable no-speech / speech evidence / uncertain / validator failure, not a new public enum); **VoiceWorkReservation** (existing user+request-key+lease+provider-start status); **TemporaryRecording** (native recorder, known URI, cleanup promise, generation); **FixtureEvidence** (local synthetic/licensed provenance, accuracy and resource results). **No schema/migration is authorized.**

## Success Criteria

- **SC-001:** Root observes meaningful RED under SDK55 throwing-root mocks and GREEN after the narrowly approved legacy import change; no deprecated cleanup path is invoked.
- **SC-002:** Known temporary URI deletion occurs once, missing file is safe, genuine I/O errors remain visible and all existing release-before-delete/replacement/generation tests pass.
- **SC-003:** Tested actual-byte malformed and confidently no-speech submissions invoke **zero provider calls** and **zero provider-start accounting**; no false refund claimed on an ambiguous release.
- **SC-004:** Quiet Arabic, English, mixed, short and noisy speech are evaluated with licensed labeled positives and an approved, measured high-recall policy before a speech production gate can pass.
- **SC-005:** A reproducible complete decode/VAD pipeline runs in an authorized environment with actual local and Edge CPU/wall/memory/bundle evidence and usable headroom; source-only readiness is not a pass.
- **SC-006:** Root reproduces released-terminal same-key replay, simultaneous reservation races, validator failure, cancellation and expiry in tests and accepts a documented resolution before server source change.
- **SC-007:** Existing current local cap, optional date/timezone, consent, Manual fallback, request-key replay retention and provider-start quota positive controls remain passing.
- **SC-008:** Owner manual plan honestly marks native cleanup, true audio, OS, screen-reader, provider and E2E checks **NOT RUN** until independently verified.
- **SC-009:** One root-owned final integration/quality batch precedes any authorized publication; no source/test execution or CI is claimed by this planning artifact.

## Assumptions and Open Gates

**READY**: standalone cleanup TDD after root assigns ONLY `apps/mobile/hooks/useVoiceRecorder.ts`, `apps/mobile/__tests__/hooks/voice-recorder-fixtures.ts` and a new `apps/mobile/__tests__/hooks/useVoiceRecorder.filesystem.test.ts`.

**BLOCKED**: Edge decoder/VAD integration, missing quiet licensed positives, runtime CPU/memory/bundle measurements, threshold/padding choices, released-terminal retry and same-key validation concurrency, new HTTP/copy, and user-visible rejection semantics. The research's prototype was **never executed**. No user data/recordings are available to this planning worker.

**Parallel ownership**: root's startup worker owns `codex/voice-startup-latency` route/flow/availability. It must not be touched by this #391 lane. No deployment, migrations, device/provider calls, blocked Deno/FFmpeg or alternate executor workaround.
