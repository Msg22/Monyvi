# Voice Empty / Speechless Audio Guard Research

**Issue:** #391 — Voice: reject empty or speechless recordings before Gemini  
**Research source:** `0e7ee55abf6fb18af37e29e4f2e48ba45604a31e`  
**Branch:** `codex/voice-empty-audio-guard`  
**Scope:** research/design only. No source, tests, schema, migration, hosted configuration, provider, or UI changes are made by this artifact.

## Executive recommendation

Do not treat any of the following as proof that speech exists: a non-zero file size, a recognized filename/MIME, client-reported duration, Expo recorder duration, metering activity, or a client `hasSpeech` flag.

Use a layered guard with the authoritative rejection boundary on the server **before `voice_ai_mark_provider_started` / Gemini**:

1. Keep auth and active AI-consent checks first.
2. Perform cheap structural checks on the actual multipart audio:
   - zero-byte / missing file;
   - supported container signature rather than defaulting unknown bytes to WebM;
   - bounded size;
   - parseable container with an audio track and sane timing metadata.
3. Resolve policy and reserve work using the existing request-key/accounting contract before any CPU-heavy speech validator. Reservation is not provider-start consumption and gives the existing concurrency/lease mechanism a chance to bound abusive parallel validation.
4. Decode the submitted audio to a low-rate mono PCM stream and run a **high-recall speech VAD** before provider start.
5. If the submitted content is deterministically unusable, release the reservation through the existing pre-provider release path and return a structured unusable-audio result. Do not call `markVoiceAiProviderStarted` and do not call Gemini.
6. If validation itself fails before provider start, release the known-not-started reservation and return a retryable server failure. Preserve the same logical request identity/retained-audio retry semantics.
7. Only after validation succeeds call `markVoiceAiProviderStarted`, then keep the current Gemini/retry/completion accounting unchanged.

For the speech detector, prefer **Silero VAD-quality behavior over WebRTC VAD** if it can be made to fit the Edge runtime. The blocking implementation spike is not the model itself; it is bounded AAC/M4A decoding plus model initialization/inference inside Supabase Edge's CPU/bundle limits. Benchmark that exact pipeline before committing to it. If it cannot fit with safe headroom, use a dedicated speech-validation runtime/service rather than downgrading the authoritative decision to client metadata or loudness.

Client-side Expo metering can still be useful as an advisory prefilter/UX signal, and a future local Silero path can avoid uploading obvious silence, but neither should be the security/accounting authority.

## Current published behavior and root cause

### Mobile

The current recorder uses Expo Audio `RecordingPresets.HIGH_QUALITY`. In Expo SDK 55 this produces AAC-in-M4A on Android/iOS at 44.1 kHz stereo / 128 kbps. The Monyvi wrapper copies `isMeteringEnabled` from the preset and otherwise defaults it to `false`, so current recording does not collect metering evidence.

`useVoiceTransactionFlow.submitRecording()` currently has a 1.5-second client-duration guard, finalizes the recorder, and then submits the URI through `parseVoiceWithAi`. That duration is an app timer and is not evidence that the uploaded media contains speech.

The retained-submission path correctly preserves audio + request identity for ambiguous transport retry. Any new validator must preserve that contract.

### Server

`parse-voice` already rejects a zero-byte `File`, but after reading bytes it currently:

- accepts several signatures;
- defaults every unrecognized byte sequence to `audio/webm`;
- base64-encodes the bytes;
- reserves voice work;
- calls `markVoiceAiProviderStarted`;
- then invokes Gemini.

The safeguard contract explicitly treats provider start as the single consumed usage unit. Therefore silence/noise must be decided before `markVoiceAiProviderStarted` to satisfy #391.

The current prompt tells Gemini to return an empty result for silence/noise. That is useful downstream anti-hallucination behavior, but it is too late for this issue because provider start has already been charged.

## Input taxonomy

| Input | What can prove it | Recommended disposition before provider start |
| --- | --- | --- |
| Missing file / zero bytes | Multipart/file length | Reject immediately. Existing zero-byte rejection is correct. |
| Random bytes / unsupported signature | Actual bytes + strict signature allowlist | Reject. Do not relabel unknown bytes as WebM. |
| Truncated / malformed M4A/WebM | Bounded container parser over submitted bytes | Reject as malformed. |
| Valid container with zero/implausible duration | Server-derived container timing | Reject as unusable. |
| Valid container with pure digital/room silence | PCM decode + speech detector | Reject; file size and duration are insufficient. |
| Valid container with fan/traffic/handling/breathing noise only | PCM decode + speech detector | Reject when detector confidence/evidence is safely non-speech. Metering alone cannot decide this. |
| Quiet Egyptian Arabic / English / code-switched speech | PCM decode + high-recall multilingual speech detector | Accept. Tune to minimize false rejection. |
| Speech but no financial information | Speech detector says speech; Gemini/parser decides semantic result | Do not make VAD a financial-content classifier. |
| Client says `hasSpeech=true` or reports duration | Untrusted client metadata | Advisory only; never authoritative. |

## Option comparison

### 1. Expo recorder metering

Expo SDK 55 exposes `RecordingOptions.isMeteringEnabled`; when enabled, recorder state may include current recording volume/metering.

**Advantages**
- no new native dependency;
- negligible latency;
- completely local/private;
- easy to aggregate into a coarse envelope without retaining audio samples.

**Limitations**
- it measures level/activity, not speech;
- quiet speech and microphone gain/AGC vary by device;
- AC/fan/street noise, handling noise, and breathing can be loud while containing no speech;
- Expo's public API does not define a cross-device speech threshold contract.

**Recommendation:** optional advisory client prefilter only. Never reject solely because a metering threshold was not crossed, and never let a positive metering result bypass server content validation.

### 2. WebRTC VAD

WebRTC VAD is fast and mature, but its conventional API requires **16-bit mono PCM** at 8/16/32/48 kHz in exactly 10/20/30 ms frames. Monyvi's current native recording is AAC/M4A, so a decode/downmix/resample path is required before WebRTC VAD can run.

**Advantages**
- extremely low inference cost;
- small algorithmic footprint;
- suitable for streaming frame decisions.

**Limitations**
- still needs PCM, so it does not avoid the hard AAC-decoding integration;
- aggressiveness levels trade false positives for false negatives;
- Silero's published multi-domain measurements show WebRTC substantially weaker at speech-vs-noise separation, which is exactly the failure mode #391 needs to distinguish.

**Recommendation:** not the preferred authoritative detector for #391. It can be a benchmark baseline or conservative “obvious speech” helper, but accepting noise as speech would still spend Gemini/quota.

### 3. Silero VAD

Silero publishes ONNX/JIT models supporting 8/16 kHz and 6000+ languages. Its current documentation emphasizes domain-specific threshold tuning; published multi-domain metrics outperform WebRTC VAD substantially, especially for noisy speech/noise discrimination.

**Advantages**
- stronger fit for silence/noise vs real speech;
- multilingual model is appropriate for Arabic, English and code switching;
- small model footprint (roughly a few MB) and fast per-chunk inference;
- can run locally or in a server/WASM-capable environment without sending audio to another AI provider.

**Limitations**
- still requires decoded PCM;
- threshold/minimum-speech settings must be tuned on Monyvi's actual mobile domain;
- local React Native deployment through ONNX Runtime adds a native package/build concern;
- Edge deployment requires proving decoder + model initialization + inference fit within Supabase limits.

**Recommendation:** preferred detector quality, contingent on an Edge feasibility spike. Use a conservative/high-recall policy. Do not freeze Silero's example `0.5` threshold or `250 ms` minimum as product values without Monyvi measurements.

### 4. Local Silero / native VAD

ONNX Runtime provides `onnxruntime-react-native` for React Native, but it is a native runtime integration. Monyvi does not currently depend on it.

**Advantages**
- reject obvious silence before upload;
- no network latency for the local decision;
- raw audio remains on-device for the prefilter.

**Costs / risks**
- native dependency and development/EAS build change;
- model asset packaging;
- a PCM feed is still needed; Expo SDK 55's recorder API exposes metering but not a recorder PCM callback equivalent to its player sampling API;
- a compromised/old client can bypass it, so it cannot be the authoritative provider-start boundary.

**Recommendation:** defer unless owner explicitly approves the native/package change. It is an optimization, not a substitute for server validation.

### 5. Server decode + VAD in Supabase Edge

Supabase Edge Functions support JavaScript/npm and WebAssembly, while native shared-library dependencies are not generally available. Current published limits include about 2 seconds of active CPU per request.

**Advantages**
- authoritative because it inspects the same submitted bytes that would go to Gemini;
- no mobile native dependency;
- no additional raw-audio disclosure beyond the already consented parse request;
- cleanly fits the existing provider-start accounting boundary.

**Risks**
- AAC/M4A decode/downmix/resample is the main cost;
- model initialization and a full silence/noise scan can consume meaningful CPU;
- large general-purpose decoders such as full FFmpeg-style WASM are poor candidates for a small Edge function due bundle/startup/CPU cost.

**Recommendation:** run a focused feasibility spike with a small audited WASM decoder + Silero-compatible inference, not a general media stack. Gate adoption on actual Edge-runtime measurements with margin. If it cannot meet budget, use a dedicated validator service/runtime and reconcile its privacy/deployment implications before implementation.

## Recommended server ordering and accounting

The cheapest structural checks should happen before reservation. The CPU-heavier speech validation should be protected by the existing reservation/burst machinery:

```text
auth
→ active AI consent
→ multipart / byte-size / strict signature checks
→ requestKey + timezone validation
→ cheap container parse
→ resolve entitlement policy
→ reserveVoiceAiWork
→ decode + speech validation on submitted bytes
   → known unusable: release reservation; terminal unusable-audio response
   → validator failure: release known-not-started reservation; retryable 503
→ markVoiceAiProviderStarted
→ Gemini + existing retry policy
→ existing completion accounting
```

Why not run the expensive VAD before reservation? An authenticated client could repeatedly send expensive speech-validation requests without ever engaging the existing concurrency/burst lease. Reservation-first for the heavy step preserves abuse/concurrency control while still guaranteeing **no provider-start unit** is consumed for unusable audio.

The eventual implementation must verify that the current release RPC accepts the intended pre-provider decision semantics; do not invent a new persisted decision code without reconciling the existing SQL/contract.

## 30-second server duration-validation feasibility (research only)

This section intentionally addresses **server validation only** and does not change Voice UI/presentation.

A server-derived duration limit from the actual uploaded container is feasible without decoding all samples:

- Native Monyvi recordings are AAC in an ISO Base Media/M4A container. A bounded parser can obtain timescale/duration from the container/movie or audio-track timing metadata and validate that the file has an audio track and internally sane timing.
- Web recordings, if supported by this endpoint, can similarly derive duration from WebM container metadata.
- The existing 5 MB request ceiling bounds parser input.
- This is substantially cheaper than AAC decode + VAD and is realistic inside the Edge CPU budget.

If the reconciled product contract says recordings may be at most 30 seconds, the server can enforce `duration <= 30s` from submitted bytes before provider start. **At source `0e7ee55…`, however, the recorder still has a 60-second recording maximum and the existing 30-second constant is the AI-analysis timeout. #391 must not silently convert that into a new recording limit.** Root/Voice ownership should supply the authoritative joined duration contract before implementation.

Container-derived duration is still **not speech proof**. A perfectly valid 20-second M4A can contain only silence/noise. Duration validation is a separate structural safeguard.

If the threat model requires duration that cannot be forged by manipulated container timing metadata, decoded sample duration must be checked instead; that moves the cost into the same decoder feasibility problem as VAD.

## False-rejection policy

For financial voice entry, rejecting quiet valid speech is worse than allowing a small number of ambiguous clips to reach Gemini. The VAD should therefore be tuned for **high recall**, not maximum noise rejection.

Do not set a production threshold from library defaults. Build a small, privacy-safe validation corpus that covers at minimum:

**Positive**
- quiet Egyptian Arabic transaction phrases;
- quiet English transaction phrases;
- Arabic/English code switching;
- short but valid amounts/merchant phrases;
- normal speech at several phone-to-mouth distances;
- common indoor/outdoor noise under speech.

**Negative**
- digital silence;
- quiet room tone;
- AC/fan;
- traffic without speech;
- handling/taps;
- breathing/sniffing;
- music/non-speech audio as a separate ambiguous bucket.

Evaluate false-negative rate first. Tune an aggregate rule over multiple frames (for example, cumulative/contiguous speech evidence), not one frame crossing one threshold.

The existing mobile `durationMs < 1500` rejection must not be promoted as speech detection. It may also conflict with #391's requirement to preserve valid short speech; reconcile that existing product rule separately before changing it.

## Privacy and diagnostics

- Local metering/VAD: no additional network disclosure.
- Server VAD: operates on raw audio already submitted under active consent; do not persist a second copy.
- Never log raw audio, base64, transcripts, PCM samples, account/category payloads, or model inputs.
- Safe diagnostics may include a coarse validation outcome (for example structural-invalid / no-speech / accepted), bounded processing-time metric, container family, and non-identifying aggregate duration bucket if governance approves it.
- Do not log raw VAD probability sequences tied to a user/request unless there is a demonstrated need and an approved privacy treatment.
- A dedicated external validator would introduce a new processor/data path and therefore needs explicit privacy/deployment reconciliation.

## Implementation acceptance tests after reconciliation

No implementation is authorized by this research artifact. When approved, use TDD and keep the following distinctions explicit.

### Server deterministic tests

1. zero-byte file → rejected before reservation/start;
2. unknown/random bytes → rejected instead of defaulting to WebM;
3. truncated/malformed supported container → rejected before provider start;
4. valid container with server-derived duration outside approved bound → rejected before provider start;
5. deterministic silence fixture → reservation released, provider-start mock not called;
6. deterministic noise fixture → reservation released, provider-start mock not called;
7. quiet Arabic speech fixture → provider-start path remains eligible;
8. quiet English speech fixture → provider-start path remains eligible;
9. validator internal failure → provider-start not called, known reservation released, retry response preserves same logical request semantics;
10. valid speech → existing provider-start / Gemini retry / completion accounting remains exactly once.

Use synthetic/licensed non-private fixtures only. No live provider calls.

### Mobile tests

- client metering or local VAD, if added, never replaces server authority;
- positive local evidence does not create a trusted server `hasSpeech` bypass;
- retained-audio same-key retry remains intact;
- consent loss/cancellation/discard semantics remain intact;
- existing Manual access remains unaffected.

### Owner-only device validation

This lane does not execute device/E2E. Owner testing should include the positive/negative matrix above across representative Android devices and quiet/noisy environments, with particular attention to quiet Egyptian Arabic and short English speech.

## Reconciliation decisions required before source implementation

| ID | Decision | Recommendation |
| --- | --- | --- |
| R391-01 | Authoritative speech validator runtime | First benchmark small server WASM AAC→PCM + Silero-quality VAD under Supabase Edge limits. If it fails, approve a dedicated validator; do not fall back to metadata-only rejection. |
| R391-02 | Client prefilter | Optional Expo metering only for advisory UX/cheap prefilter. Local Silero requires explicit native-package/build approval. |
| R391-03 | Speech threshold / minimum voiced evidence | Do not choose from defaults. Tune from Monyvi Arabic/English/noise measurements with a high-recall objective. |
| R391-04 | Public unusable-audio response/copy | Needs product/UI reconciliation before implementation because it creates a new user-visible rejection state. |
| R391-05 | Recording duration | Server can enforce a reconciled 30-second limit from uploaded container bytes, but current source still uses 60-second recording max. Do not change duration policy in #391 without authoritative joined source. |
| R391-06 | Existing <1.5s client rejection | Keep out of the speech-proof decision. Reconcile separately against the “valid short speech” acceptance criterion. |

## Minimal recommended next step

Before production coding, build a **non-production benchmark spike** against synthetic/licensed fixtures:

1. parse the actual Expo AAC/M4A container;
2. decode/downmix/resample to 16 kHz mono;
3. run Silero-quality VAD with early accept after sufficient speech evidence;
4. run the whole silence/noise clip when no speech is found;
5. measure Edge active CPU, cold/warm latency, memory and bundle/model size for 5/15/30-second clips;
6. verify quiet Arabic/English positives are not rejected.

Proceed with the Edge validator only if it stays comfortably inside the 2-second CPU limit with headroom. Otherwise reconcile a dedicated validation runtime. Expo metering can be added independently as an advisory optimization, but it must never be used to claim #391's authoritative guarantee.

## Sources

### Pinned Monyvi source

- [Issue #391](https://github.com/Msg22/Monyvi/issues/391)
- [useVoiceRecorder.ts @ 0e7ee55](https://github.com/Msg22/Monyvi/blob/0e7ee55abf6fb18af37e29e4f2e48ba45604a31e/apps/mobile/hooks/useVoiceRecorder.ts)
- [useVoiceTransactionFlow.ts @ 0e7ee55](https://github.com/Msg22/Monyvi/blob/0e7ee55abf6fb18af37e29e4f2e48ba45604a31e/apps/mobile/hooks/useVoiceTransactionFlow.ts)
- [ai-voice-parser-service.ts @ 0e7ee55](https://github.com/Msg22/Monyvi/blob/0e7ee55abf6fb18af37e29e4f2e48ba45604a31e/apps/mobile/services/ai-voice-parser-service.ts)
- [parse-voice/index.ts @ 0e7ee55](https://github.com/Msg22/Monyvi/blob/0e7ee55abf6fb18af37e29e4f2e48ba45604a31e/supabase/functions/parse-voice/index.ts)
- [voice-ai-safeguard-service.ts @ 0e7ee55](https://github.com/Msg22/Monyvi/blob/0e7ee55abf6fb18af37e29e4f2e48ba45604a31e/supabase/functions/_shared/voice-ai-safeguard-service.ts)
- [voice-ai-entitlement.ts @ 0e7ee55](https://github.com/Msg22/Monyvi/blob/0e7ee55abf6fb18af37e29e4f2e48ba45604a31e/supabase/functions/_shared/voice-ai-entitlement.ts)
- [voice safeguard contract @ 0e7ee55](https://github.com/Msg22/Monyvi/blob/0e7ee55abf6fb18af37e29e4f2e48ba45604a31e/packages/logic/src/voice-ai-safeguard-contract.ts)
- [business decisions @ 0e7ee55](https://github.com/Msg22/Monyvi/blob/0e7ee55abf6fb18af37e29e4f2e48ba45604a31e/docs/business/business-decisions.md)
- [feature 389 spec @ 0e7ee55](https://github.com/Msg22/Monyvi/blob/0e7ee55abf6fb18af37e29e4f2e48ba45604a31e/specs/389-voice-usage-limits/spec.md)
- [feature 389 reconciliation @ 0e7ee55](https://github.com/Msg22/Monyvi/blob/0e7ee55abf6fb18af37e29e4f2e48ba45604a31e/specs/389-voice-usage-limits/reconciliation.md)

### Primary / upstream references

- Expo SDK 55 Audio: https://docs.expo.dev/versions/v55.0.0/sdk/audio/
- Supabase Edge CPU limits: https://supabase.com/docs/guides/troubleshooting/edge-function-cpu-limits
- Supabase Edge WebAssembly: https://supabase.com/docs/guides/functions/wasm
- Supabase note on native libraries vs WASM: https://supabase.com/docs/guides/functions/examples/image-manipulation
- WebRTC VAD API constraints (reference implementation wrapper): https://github.com/wiseman/py-webrtcvad
- WebRTC VAD source constraints: https://github.com/wiseman/py-webrtcvad/blob/master/cbits/webrtc/common_audio/vad/webrtc_vad.c
- Silero VAD model/version information: https://github.com/snakers4/silero-vad/wiki/Version-history-and-Available-Models
- Silero VAD quality metrics and threshold guidance: https://github.com/snakers4/silero-vad/wiki/Quality-Metrics
- Silero VAD runtime/default threshold documentation: https://github.com/snakers4/silero-vad/blob/master/src/silero_vad/utils_vad.py
- ONNX Runtime for React Native: https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html

## Evidence status

- Repository/source inspection: completed against exact `0e7ee55abf6fb18af37e29e4f2e48ba45604a31e`.
- Public upstream research: completed from the references above.
- Device measurements: **not run** by this lane.
- Edge decoder/VAD benchmark: **not run**; this is the primary implementation-feasibility gate.
- Provider/Gemini calls: **not run**.
- Hosted changes/deployments: **none**.
