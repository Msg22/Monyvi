# #391 Audio Validation Contract — PROPOSED, NOT IMPLEMENTED

**Date:** 2026-10-12. **Status:** DECISION GATES OPEN for speech; cleanup compatibility is ready for test-first implementation.  
**Source:** published Voice `f625183373e29d372b658c10b3848a217477400a` on stacked research branch `a7e1e00e118b4b8a989387d48181fdde0c821f3d`.  
**Canonical context:** [#391 spec](../spec.md), [#389 parse-voice quota OpenAPI](../../389-voice-usage-limits/contracts/parse-voice-quota.openapi.yaml), [original research](../../../docs/research/voice-empty-audio-guard.md). No request/response schema, HTTP response or backend policy is authorized to change through this proposed contract.

## Existing request and response authority (UNCHANGED)

`POST /functions/v1/parse-voice` uses authenticated multipart `audio`, 1–160-character opaque `requestKey` and valid IANA `callerTimeZone`. Existing optional `callerLocalDate`, `accounts`, `categories` remain. Existing 200 success contains transcript/original transcript/detected language/transactions; current error statuses include 400 for malformed identity/audio, 401 auth, 403 active-consent failure, 413 oversize, 429 quota/refusal, 503 ambiguous authoritative availability, 500 provider/runtime. Treat the existing #389 OpenAPI and implementation as authority; this document **does not select a new speech-rejection HTTP status, code, JSON envelope or mobile copy**.

Current implementation in `supabase/functions/parse-voice/index.ts` rejects zero-byte files before provider start but accepts unknown byte signatures as `audio/webm` fallback. **Neither zero-byte guard nor container signature can determine speech.**

## Internal validator boundary — only after feasibility and authorization

The following are **conceptual discriminants**, not established runtime types or approved public responses.

| Internal condition | Proof and proposed safe disposition | Authority status |
| --- | --- | --- |
| `structural_invalid` | Missing/empty actual bytes, unsupported/truncated/malformed container after bounded actual-byte parser; reject before expensive validation/provider start. | Existing zero-byte behavior applies; expanded format policy/response needs reconciliation. |
| `speech_detected` | High-recall decoder/VAD demonstrates speech with validated quiet Arabic/English/code-switch recall and appropriate confidence. Proceed to current provider-start gate, not a semantic/financial judgment. | BLOCKED until benchmark, policy and tests. |
| `no_speech_proven` | Decoded actual media provides strong calibrated evidence of digital/room silence or noise-only audio. No provider mark or Gemini. If reservation exists, release only known-unstarted work. | BLOCKED until licensed corpus, thresholds, response/accounting approval. |
| `inconclusive` | Valid media with uncertain evidence, quiet voice/noise overlap or inadequate classification confidence. Never silently reject true quiet speech; route by separately approved policy, not library defaults. | UNDECIDED; neither forced reject nor provider acceptance is approved. |
| `validator_error` | Decoder/model/CPU/timeout/unsupported input fails rather than classifies; no provider start in known-not-started path; reconcile retryable error and SQL release/lease outcomes. | BLOCKED on product/error/accounting contract. |
| `provider_start_unknown` / `release_unknown` | The RPC outcome could be committed despite lost response. Do not claim a unit was refunded, consume another request or issue an automatic retry. | Existing fail-closed accounting wins pending reconciliation. |

No `hasSpeech` field, client-reported time, volume/metering level, MIME label, image or estimated file duration may attest authoritative speech. The local 30,000ms active timer does **not** establish server duration or speech.

## Proposed admission and accounting flow

1. Check auth and fresh AI consent. Preserve existing ownership and cancel semantics.
2. Read bounded uploaded bytes; enforce existing actual size rules; examine supported actual bytes/container and audio track. Do not default unknown signature to WebM without a product compatibility decision.
3. Validate existing `requestKey`, `callerTimeZone` and optional request context; resolve current entitlement policy.
4. Reserve authoritative work before expensive codec/VAD CPU. A reservation temporarily occupies capacity, **not a consumed provider-start unit**.
5. Decode actual uploaded content with an approved, measured runtime and run calibrated high-recall speech detection before marking provider start.
6. For proven unusable or validator error, **do not** mark provider started. Attempt `voice_ai_release_work` only when the request is provably still reserved; accept boolean `true` only as confirmed release. Handle `false`/timeout/ambiguous RPC as unknown and fail closed. Final response/copy still requires separate approval.
7. For validated eligible audio, call existing `voice_ai_mark_provider_started` (unit consumption boundary) and then existing Gemini/retries/completion. A late or lost provider-start result is not proof of non-consumption.
8. Preserve existing already-started/replayed behavior; prohibit new provider starts for an already-started logical identity.

### Required reconciliation: exact SQL identity semantics

**Released-terminal same-key:** `supabase/migrations/087_voice_ai_usage_limits.sql` private `voice_ai_reserve_work_at` returns `already_processed_result_unavailable` for previously released terminal rows (and other terminal states) while retained. Thus **release on a transient validator failure does not automatically permit a same-key retry**. Existing 35×24h immutable replay retention still applies. Define safe client/server responses and whether the request is terminal or retryable **before** source/SQL changes. No new SQL or reissue policy is authorized here.

**Concurrent same-key requests:** the reservation RPC can return an existing unexpired reservation as `accepted` + `is_replay=true`. Two requests may consequently run decoder/VAD concurrently even though `mark_provider_started` guards allowance. Define admission/lease/deduplication for expensive speech validation, cancellation and expiry; do not mistake per-user SQL locking during an RPC for serialization across later decoder work. #384 held-reservation UX remains separately deferred.

**Provider start/release race:** `voice_ai_release_work` only updates `status='reserved' AND provider_started_at IS NULL`. A failed or ambiguous release cannot be presented as a refund. No automatic provider reattempt after unknown status.

## Duration / codec / threshold / UX open decisions

- **Duration:** approved #389 local 30-second **active** capture, pause excluded. Older 60-second research is historical. Whether server enforces 30 seconds from container timing, decoded samples, or both, and allowable AAC encoder padding/gapless tolerance, require actual measurements and explicit policy. A valid longer external upload cannot be rejected on a guessed tolerance.
- **Supported media:** current server sniffs MPEG/Ogg/WAV/M4A and defaults unknown to WebM. Planned decoder targets Expo M4A/AAC; existing accepted non-M4A formats need explicit support or compatibility decisions before narrowed acceptance.
- **Classification:** no approved Silero confidence threshold, minimum consecutive voiced interval, uncertain-input behavior, false-negative budget or error fallback. Preserve quiet Egyptian Arabic, English, code-switched, short valid audio and speech-over-noise.
- **Client minimum:** current <1.5s `submitRecording` rejection is **not** speech proof; a proposed change must be approved and independently tested. Root startup worker owns route/flow; no overlapping edit.
- **HTTP/copy:** no new status, refusal code, localization or Retry/Manual screen behavior selected. The existing client currently treats most non-403/429 errors as network-style failures; a speech-specific UX requires agreed mapping and separate writable paths.
- **Resource/security:** Supabase Edge published 2s active CPU / 256MB memory and packaging limits are comparison ceilings, not measured runtime acceptance. No additional hosted validator, Deno/FFmpeg bypass, package, model upload, raw-audio storage or deployment approval.

## Contract acceptance tests (future RED first)

- Missing/zero bytes, unrecognized signature, truncated MP4, unsupported/malformed tracks and forged/contradictory metadata; no provider start or accidental WebM fallback.
- Correctly decoded silence, noise and varied real-world non-speech; **zero** Gemini invocation/started unit; legitimate quiet Arabic/English/code-switch speech eligibility.
- Validator crash, model init, timeout and resource exhaustion: known non-start vs ambiguous release, response and same-key retry decision preserved.
- Terminal released key replay; existing in-flight reserved key replay and two simultaneous validators; cancellation after reservation, lease expiry and late provider-start RPC outcome.
- Valid speech retains existing one provider start, approved retries, successful transcript/transaction response, consent and quota envelope. 35-day replay and Manual are unaffected.
- No raw audio, transcripts, financial/user-specific identifiers, provider payloads or model probabilities logged.

**Execution evidence:** NONE for this proposed contract. The nine research/prototype files exist but **no Deno, FFmpeg, Rust/WASM, model, licensed speech, CPU/memory/Edge, provider or native tests ran in this planning lane**.
