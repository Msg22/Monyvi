# #391 Audio Validation Contract — Documented Disposition

**Date:** 2026-10-12 | **Status:** SERVER DETECTOR RETIRED; CLIENT-ONLY BYPASS
DOCUMENTED; EXISTING SERVER CONTRACTS UNCHANGED.<br> **Authority:**
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
   `voice_ai_release_work`) remain unchanged.

## Server Detector Retirement

Server-side WASM decoding (Symphonia) and Silero ONNX speech detection are
**explicitly abandoned and superseded**. Proposed server-side validation error
states, server-side release RPC triggers for no-speech, and Edge Runtime
shared-memory workarounds are retired. All prototype spike files in
`scripts/voice-audio-validation-spike/` and
`docs/research/voice-audio-validation-spike/` have been deleted.

## Client-Side Silence Bypass Contract

Conservative on-device metering is approved as a client-side cost optimization
prior to upload:

1. **Client Silence Rejection**:
   - When a recording has **sufficient valid on-device capture measurements**
     confirming clear silence under conservative thresholds, the client aborts
     submission locally.
   - **Bypass Scope**: Zero recording upload, parse-voice submission,
     reservation (`voice_ai_reserve_work_at`), or provider-start marking
     (`voice_ai_mark_provider_started`) is attributable to a locally rejected
     recording. Normal auth, entitlement refresh, and sync can still make
     routine network requests. Zero Gemini provider quota units are consumed.
2. **Inherent Loudness-Only Caveats & Policy**:
   - A loudness meter measures signal amplitude, not speech presence. Because
     amplitude levels for very quiet speech and ambient room noise can overlap,
     metering cannot unconditionally distinguish faint voice from noise or
     guarantee never blocking faint sound.
   - To minimize false rejections, policy requires:
     - A strictly conservative clear-silence threshold with sufficient valid
       capture measurements.
     - Failing open (passing to server) on missing, sparse, or uncertain
       measurements.
     - Validating representative quiet, short, and noisy speech on physical
       devices before shipping.
3. **Approved Proposed Copy**:
   - The user approved the proposed English copy:
     `"We couldn’t hear anything. Please try recording again."`
   - Arabic translation, localized strings, and UI integration remain pending
     future implementation.
4. **Status of Implementation**:
   - Client-side metering is **NOT implemented** in this documentation and
     prototype retirement slice. Threshold calibration, device testing, and TDD
     remain pending future work.

## Duration Enforcement Disposition

Server duration and encoder padding enforcement follow-up is explicitly **out of
scope** for this approved cost-only guard and is **not addressed**. The existing
approved 30,000-ms local active capture cap from #389 remains the active
boundary.

## Verification Evidence

- **US1 Cleanup**: EXECUTED test-first (test-only RED `392a26f7…` → import-only
  production `84696d74…` → async mock reconciliation `7ad8ed52…` → root final
  GREEN 72 tests / 3 suites / 3.809s PASS).
- **US2 Server Detector**: RETIRED and superseded; prototype files deleted.
- **US2 Client Metering**: UNIMPLEMENTED / PENDING future TDD and physical
  device verification.
