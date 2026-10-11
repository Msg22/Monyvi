# #391: AAC/M4A speech-validation feasibility harness — NONPRODUCTION

**Current outcome: BLOCKED BY LOCAL EXECUTION POLICY; ALL RESULTS UNMEASURED.** This worktree's mandatory lean-ctx tool allowlist permanently blocks `deno.exe` and FFmpeg. **Do not reattempt them, bypass protections, reconfigure tool permission checks, launch through wrappers, install substitutes, deploy, or call Gemini.** The commands below are **documentation of the corrected bootstrap protocol only**, not an instruction to execute in the blocked local environment. A separate actually authorized future verification assignment would be needed to change this status. No executions or measurements occurred in this ChatGPT lane.

This research folder is not a Supabase Edge service, mobile dependency, production speech classifier, or product filtering rule. The source alone cannot establish that WASM compiles or that model inference is accurate.

## Selected candidate / primary source evidence

| Part | Version and actual upstream API | Feasibility evidence missing |
| --- | --- | --- |
| ISO BMFF/M4A AAC-LC decode | [Symphonia 0.6.1](https://docs.rs/symphonia/0.6.1/symphonia/) requires opt-in `aac` + `isomp4`; [MPL-2.0](https://github.com/pdeljanov/Symphonia). Versioned [`FormatReader::next_packet() -> Result<Option<Packet>>`](https://docs.rs/symphonia-core/0.6.1/symphonia_core/formats/trait.FormatReader.html), [`CodecRegistry::make_audio_decoder`](https://docs.rs/symphonia-core/0.6.1/symphonia_core/codecs/registry/struct.CodecRegistry.html), [`GenericAudioBufferRef::copy_to_slice_interleaved`](https://docs.rs/symphonia-core/0.6.1/symphonia_core/audio/enum.GenericAudioBufferRef.html). | `wasm32-unknown-unknown` compile; AAC support on actual Expo M4A; codec/distribution review; memory; real decoded duration; reference PCM quality. Symphonia explicitly does **not** claim MP4/AAC gapless support. |
| WASM glue | Current [wasm-pack `--target deno` is supported](https://wasm-bindgen.github.io/wasm-pack/book/commands/build.html); unknown installed version means no local support claim. To remove implicit Deno-generated binary loading, **this probe chooses `--target web`** (also documented). [wasm-bindgen's web target default ES-module initializer](https://wasm-bindgen.github.io/wasm-bindgen/examples/without-a-bundler.html) accepts WASM bytes/module. `benchmark.ts` must `await decoder.default(decoderWasmBytes)` **before calling** the named export. | Build/toolchain availability, generated `pkg/` signature and correct init under Deno and Supabase Edge are UNMEASURED. Web-compatible glue does **not** prove Edge runtime compatibility. |
| Voice VAD | [Silero VAD](https://github.com/snakers4/silero-vad), ONNX file pinned to [commit `60b7ffa243625ebdc1070275a29f18c87843786a`](https://github.com/snakers4/silero-vad/tree/60b7ffa243625ebdc1070275a29f18c87843786a); MIT. [Upstream ONNX Python reference](https://github.com/snakers4/silero-vad/blob/60b7ffa243625ebdc1070275a29f18c87843786a/src/silero_vad/utils_vad.py) uses 16 kHz ×512 samples, 64-sample context, recurrent state `[2,1,128]`, and **scalar int64 `sr`** (`np.array(sr, dtype='int64')`). Outputs named `output` and `stateN`. | Actual pinned binary tensor metadata, correct runtime load/inference, quiet Egyptian Arabic/English/code-switched recall, model/binary hash and license origin remain UNMEASURED. The full model is *not* Silero's `half` model. |
| Inference | [ONNX Runtime Web v1.22.0](https://onnxruntime.ai/docs/tutorials/web/deploy.html) single-thread WASM; MIT. [`ort.env.wasm.wasmBinary`](https://onnxruntime.ai/docs/api/js/interfaces/Env.WebAssemblyFlags.html) takes `Uint8Array`. Probe validates session input/output names and per-frame tensor shape/type; resets state per fixture, zero-pads final partial frame (as upstream `audio_forward` does). | Deno `npm:` import+ORT binary match, CPU/memory, cold/warm init, active Edge CPU, function bundle size and Edge worker concurrency all UNMEASURED. |
| Edge constraints | [Supabase WASM support](https://supabase.com/docs/guides/functions/wasm) and [runtime resource limits](https://supabase.com/docs/guides/functions/limits) (approx. 2s active CPU per request and 256 MiB memory) are separate from Deno `process.cpuUsage` / wall time. | Actual Edge CPU with model/decode, true memory peak, bundle packaging and load headroom. None measured. Function config/hosted changes forbidden. |

The Rust research adapter uses a bounded compressed input, verified signature, documented v0.6.1 `default_track(TrackType::Audio)`, codec creation, typed audio samples, source rate consistency and explicit EOS. Stereo downmix and **linear resampling** remain an accuracy limitation, not a validated resampler. No production speech threshold or 30-second decoded-duration enforcement is selected.

**Important discrepancy in older draft:** The older README called `--target deno` potentially unsupported. Official upstream *current* wasm-pack actually exposes that target. There is **no observed installed wasm-pack version here** and no compatibility claim. The documented `--target web` + explicit `await init(bytes)` route is selected only as a deterministic prototype contract.

## Corrected PowerShell bootstrap — REFERENCE ONLY; DO NOT EXECUTE UNDER CURRENT lean-ctx PROTECTION

No `npm install` / `npm ci` / lockfile / native config / provider / deployment commands belong in this spike. Prerequisites would need to **already exist** in a separately eligible environment; this project's blocked executor MUST NOT run any command below to circumvent its allowlist. The commands have **NOT BEEN RUN**.

```powershell
# DOCUMENTATION ONLY; current local executor is permanently BLOCKED.
Set-Location 'E:\Work\My Projects\Monyvi-voice-empty-audio-guard'
$revision = (git rev-parse HEAD).Trim()     # caller proves checkout is exactly published commit
deno --version
ffmpeg -version
rustc --version
cargo --version
wasm-pack --version
rustup target list --installed             # must list wasm32-unknown-unknown
Set-Location 'scripts/voice-audio-validation-spike/decoder'
wasm-pack build --release --target web --out-dir pkg  # supported ESM + explicit init
Set-Location '..'
New-Item -ItemType Directory -Force -Path 'local', 'local/ort' | Out-Null
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/snakers4/silero-vad/60b7ffa243625ebdc1070275a29f18c87843786a/src/silero_vad/data/silero_vad.onnx' -OutFile 'local/silero_vad.onnx'
Invoke-WebRequest -Uri 'https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.22.0.tgz' -OutFile 'local/onnxruntime-web-1.22.0.tgz'
tar -xzf 'local/onnxruntime-web-1.22.0.tgz' -C 'local/ort'
Copy-Item 'local/ort/package/dist/ort-wasm-simd-threaded.wasm' 'local/ort-wasm-simd-threaded.wasm'
Get-FileHash -Algorithm SHA256 'local/silero_vad.onnx'
Get-FileHash -Algorithm SHA256 'local/ort-wasm-simd-threaded.wasm'
Get-FileHash -Algorithm SHA256 'decoder/pkg/voice_decoder_bg.wasm'
Set-Location '../..'  # project root
deno run --allow-run=ffmpeg --allow-read --allow-write=scripts/voice-audio-validation-spike/local scripts/voice-audio-validation-spike/prepare-fixtures.ts
deno run --no-check --allow-read --allow-write=scripts/voice-audio-validation-spike/local --allow-net=registry.npmjs.org scripts/voice-audio-validation-spike/benchmark.ts "--source-revision=$revision" --include=silence-05
# Omit --include for complete matrix only when fixtures exist and execution is authorized.
```

The explicit `--source-revision` replaces the **incorrect hardcoded research parent `1a208…`**. Always provide the **actual published checkout SHA**, not a guessed parent. Results template uses `sourceRevision:null` until a verified run. `--no-check` means TypeScript checking was not performed and cannot be represented as a passed check.

If any tool, model download, pinned dependency, Rust API, Deno import, `wasm-pack` binary or ONNX output fails in a *permitted* future environment: record first actual command/stderr and stop instead of substituting unpinned media/codecs or claiming a passing run. Current blocker is already final: **lean-ctx disallows `deno.exe` and FFmpeg; no retries allowed**.

## Manifest and fixture boundary

`prepare-fixtures.ts` is source-only and not executed. If ever run in an explicitly permitted environment, it would generate:
- 5/15/30-second local synthetic AAC-LC/M4A **digital silence**, **pink fan-proxy**, **white traffic-proxy**; these are *not actual room/fan/road recordings*.
- Known malformed bytes (`unknown-bytes.bin`).
- Nine deliberately missing speech positives across **quiet Egyptian Arabic, quiet English and Arabic/English code-switch × 5/15/30 seconds**.

It now uses Node's standard `fileURLToPath` for Windows-safe FFmpeg filenames (important because this worktree path contains spaces). `benchmark.ts` accepts **no manifest/asset path overrides**, and validates the entire fixed ID taxonomy, duplicates, expected classes/durations, local basenames, SHA-256 and nonempty license/origin. A missing fixture must remain `status:"missing"` with null path/hash/license. A ready positive is evidence of bytes/provenance only, **not accuracy**; it still needs measured decoded audio and labeled speech. Media must be synthetic or explicitly licensed, never customer/private raw recordings. Media/model binaries and measured results belong in ignored `local/`, not Git.

Additional complete-coverage evidence (still missing) is genuine independently licensed quiet Arabic/English code-switch, short utterances, varied speakers, speech-over-noise and representative handling/breathing/room/traffic sounds. Synthetic noise generator output cannot establish field performance. No arbitrary VAD threshold or min-voiced duration is approved; optional parameters are exploratory only. A sample-level VAD never determines whether speech contains a financial transaction.

## Output contract and status

The bounded source-only parser would write `local/results.json` if its full init and actual measurement succeed in a permitted environment. `docs/research/voice-audio-validation-spike/results.template.json` is explicitly **UNMEASURED**, not a generated report. Benchmark result `sourceRevision` comes from required CLI `--source-revision=<actual Git SHA>` and should be independently compared to `git rev-parse HEAD`. Report `results[]` aligns with template (previous template mistakenly used `cases[]`).

Measurements **NOT available** here: Rust/WASM compilation, import+model init, locally generated files, 5/15/30 decode and VAD wall/CPU, cross-process cold or session-warm comparisons, true peak memory, full Edge function bundle bytes, hosted Edge active CPU or cold/warm latency, and quiet-speech accuracy. Deno process CPU, `Deno.memoryUsage().rss` at checkpoints, and local wall time (if ever gathered elsewhere) must not be presented as hosted Edge metrics or true peak memory.

## Preserve accounting boundaries for later, not implemented by this task

Server must use auth, active consent, cheap actual-byte/container checks, validated request-key/timezone and policy, reservation **before** expensive validation, then never mark provider start for a proven no-speech clip. A known-not-started rejection may release the reservation; uncertain start/release must fail closed. Keep replay, cancellation, #384 lease caveats, same-key retries and Manual. Metadata, loudness, unverified `hasSpeech` or a duration claim do not prove speech. The current 60s recorder vs R2 30s direction is separate; no max-duration rule is changed in this prototype.

**Concrete missing evidence before any production source assignment:** a real compiling/initialized pinned decoder+ORT+Silero pipeline, provenance/checksums, licensed quiet-speech positives, measured FNR/FPR across 5/15/30s and representative noise, local and Edge resource/headroom data, exact decoded-duration treatment, and deterministic tests of the agreed unusable-audio HTTP/release/provider-start contract. Those are factual gaps, **not new approval requests or a request to change the already approved scope**. No production changes are authorized here.
