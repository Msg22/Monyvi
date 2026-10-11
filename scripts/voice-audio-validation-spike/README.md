# Issue #391: local audio feasibility spike

**NONPRODUCTION.** This folder is isolated research, not an Edge service, mobile package, product validator, or authorization for deployment. Nothing here calls Gemini. No runtime CPU, build or speech-accuracy results have yet been observed.

## Selected candidate and provenance

- Decode only **AAC-LC inside ISO BMFF/M4A** from the actual bytes: Symphonia **0.6.1** built into Rust/WASM with explicit `aac` and `isomp4` features, **MPL-2.0**. Its documented decoding support does **not** establish a working wasm32 build or Supabase Edge support. AAC patent/distribution review and bundled license notices must precede shipping. https://docs.rs/symphonia/0.6.1/symphonia/ ; https://github.com/pdeljanov/Symphonia
- Downmix to mono and resample to 16 kHz PCM; current Rust spike uses *linear* resampling only for research and does not compensate AAC padding. It is **not** a high-quality or validated production resampler. Compare decoded samples and length with offline FFmpeg reference.
- Infer speech with the **MIT-licensed Silero-VAD ONNX** asset pinned to upstream commit `60b7ffa243625ebdc1070275a29f18c87843786a` (v6.2.2), using 16 kHz/512 samples, 64-sample context and a fresh 2x1x128 recurrent state for each recording. https://github.com/snakers4/silero-vad ; https://raw.githubusercontent.com/snakers4/silero-vad/60b7ffa243625ebdc1070275a29f18c87843786a/src/silero_vad/data/silero_vad.onnx
- Run with Microsoft **ONNX Runtime Web 1.22.0 WASM** (MIT), one thread. Module compatibility, WASM integration, model output names and memory footprint are **UNVERIFIED**. https://onnxruntime.ai/docs/tutorials/web/deploy.html
- WebRTC VAD is a small frame-based comparison baseline, **not** selected as authoritative. It still needs decoded PCM and may reject quiet Arabic/English. FFmpeg native binaries are only used offline to generate/check fixtures, never in Edge.

The license of the *different* `snakers4/silero-models` repository is not the source license of this pinned `snakers4/silero-vad` model. Record artifact SHA256, originating version, full license and redistribution review before a deployment proposal.

## Sanctioned local executor bootstrap (PowerShell)

The existing worktree has linked root node_modules; **do not run npm install/ci, edit package.json or any lockfile, or deploy**. Tool prerequisites are pre-existing Deno 2, FFmpeg with AAC encoder, Rust/Cargo, wasm32 target, wasm-pack and tar. Record versions and STOP with the exact failure if any is missing; no unsanctioned toolchain install. **These commands have not been run by Normal ChatGPT.**

```powershell
Set-Location 'E:\Work\My Projects\Monyvi-voice-empty-audio-guard'
git rev-parse HEAD       # must equal coordinator's published artifact SHA
deno --version
ffmpeg -version
rustc --version
cargo --version
wasm-pack --version
rustup target list --installed     # wasm32-unknown-unknown required

Set-Location 'scripts/voice-audio-validation-spike/decoder'
wasm-pack build --release --target deno --out-dir pkg
Set-Location '..'
New-Item -ItemType Directory -Force -Path 'local', 'local/ort' | Out-Null
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/snakers4/silero-vad/60b7ffa243625ebdc1070275a29f18c87843786a/src/silero_vad/data/silero_vad.onnx' -OutFile 'local/silero_vad.onnx'
Invoke-WebRequest -Uri 'https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.22.0.tgz' -OutFile 'local/onnxruntime-web-1.22.0.tgz'
tar -xzf 'local/onnxruntime-web-1.22.0.tgz' -C 'local/ort'
Copy-Item 'local/ort/package/dist/ort-wasm-simd-threaded.wasm' 'local/ort-wasm-simd-threaded.wasm'
Get-FileHash -Algorithm SHA256 'local/silero_vad.onnx'
Get-FileHash -Algorithm SHA256 'local/ort-wasm-simd-threaded.wasm'
Get-FileHash -Algorithm SHA256 'decoder/pkg/voice_decoder_bg.wasm'

Set-Location '../..'       # Monyvi project root
deno run --allow-run=ffmpeg --allow-read --allow-write=scripts/voice-audio-validation-spike/local scripts/voice-audio-validation-spike/prepare-fixtures.ts
deno run --no-check --allow-read --allow-write=scripts/voice-audio-validation-spike/local --allow-net=registry.npmjs.org scripts/voice-audio-validation-spike/benchmark.ts --include=silence-05
# After successful bootstrap, remove --include to examine all generated negatives.
```

The npm: specifier used by Deno resolves its package to Deno's own cache, not the repository's package.json; if an existing workspace policy prohibits that download, STOP rather than install anything. `--no-check` is intentionally marked: compilation/typechecking is NOT claimed. On a missing binary, Rust type/API error, ORT WASM mismatch, model output/state mismatch or Deno/Edge runtime failure, record exact first failing command and stderr; report BLOCKED. Do not substitute an unpinned artifact.

## Fixtures / local-only evidence

`prepare-fixtures.ts` generates a local manifest and AAC-LC/M4A cases of 5, 15 and 30 seconds: digital silence, *pink fan-proxy noise*, *white traffic-proxy noise*, and malformed bytes. The noise is synthetic proxy data, **not real field noise**. It writes nine `status=missing` valid-speech placeholders: quiet Egyptian Arabic, quiet English and Arabic/English code switching at **5/15/30 seconds**. Do not claim speech-preservation coverage before replacing each placeholder with an independently synthetic or explicitly redistribution-licensed, non-customer/non-private recording, a recorded license/origin, exact SHA256, decoded speech intervals and quiet/noisy sublabels. Do not commit those audio files (local directory is gitignored). Required manifest layout: `docs/research/voice-audio-validation-spike/fixtures.template.json`.

Add reference cases for handling/taps, actual room/fan/traffic/breathing noise where license allows. False negatives on valid quiet speech are the primary safety metric. Silence/noise should be rejected only when the measured decision is sufficiently reliable. The 1.5s existing client guard is not speech proof.

No production VAD probability threshold/minimum duration is chosen. Passing optional `--threshold=... --minimum-speech-ms=...` is an **exploratory** classifier only and requires human-labeled licensed positives plus a confusion matrix. A model VAD does not prove transaction meaning. Do not choose 0.5 or 250ms solely from library defaults.

## Outputs and mandatory interpretation

A successful local `benchmark.ts` run generates ignored `scripts/voice-audio-validation-spike/local/results.json` with the expected structure in `docs/research/voice-audio-validation-spike/results.template.json`:
- Captures tool/platform versions, model/decoder/ORT WASM bytes and SHA256, single initialization wall time, per-case decode/VAD/total wall time, Deno process CPU proxy, RSS at checkpoints (NOT true peak), decoded frames/duration (including padding), probability aggregate (no logged PCM or transcript), and missing positives.
- Local Deno timing excludes process spawn, isolate cold startup and actual hosted Supabase Edge measurements. One process uses one ONNX session (warm per-case); the harness does **not** directly produce a full Edge cold/warm matrix. Re-run each 5/15/30-second case across at least three **new processes** (cold proxy) and repeated iterations in one warm session, separately capturing process CPU, wall and OS-sampled *actual* memory peak; document the wrapper methodology. Local cold proxy is NOT Edge cold CPU.
- **UNMEASURED** must remain for Edge active CPU/request, true peak RSS, complete function bundle bytes, actual local/hosted cold/warm latency, quiet speech accuracy and user/device validation until instrumentation produces those exact observations. `edgeCpuAndBundleGatePassed` remains false in template. Supabase's limits are roughly **2s active CPU**, **256MiB** and deployment bundle limitations; actual headroom must be established rather than comparing only total wall time. https://supabase.com/docs/guides/functions/limits

For an authoritative Edge result, the owner must separately authorize a non-hosted **isolated Edge-runtime** experiment with identical WASM+model+fixture bytes and bundle-size measurement. The official WASM packaging path requires static-file configuration, which is **not** authorized here: https://supabase.com/docs/guides/functions/wasm . No production source/config or remote deployment is permitted in #391 feasibility work.

## Server policy for later implementation (not implemented here)

Auth + active AI consent → cheap actual-byte/size/M4A structural checks → validated request identity/timezone → resolve entitlement/reserve capacity → bounded decode/VAD before provider start → **known** no-speech: release reservation only when confirmed never started → agreed unusable-audio response; validator failure: release known-not-started then retryable failure, retained audio and same request key. If release outcome is ambiguous, fail closed and reconcile lease; do NOT assert a refund. Preserve replay and #384 accounting concerns. Later runtime must not trust MIME/client duration/hasSpeech or interpret container timing metadata as verified actual decoded length, and must not enforce 30s duration absent joined owner/SpecKit policy.

**Required next approvals:** license/security of binary/model/runtime, exhaustive audio corpus and representative Android quiet-speech results, measured Edge resource fit with headroom, product rejection copy, explicit duration/lease policy, TDD proof of behavioral RED and SQL release semantics. Until then, production feasibility **BLOCKED/UNMEASURED**.
