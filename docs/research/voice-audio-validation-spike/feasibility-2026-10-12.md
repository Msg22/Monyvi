# Voice Audio Feasibility Milestone Report (2026-10-12)

- **Source Revision**: `e288d12026bd7076682a6d89b6446bc13c228cab`
- **Main Governance**: `3264eba2b67bcc66cddc95e3fbdb36e8705ee642`
- **Execution Mode**: Local Deno proxy + containerized local Supabase Edge
  Runtime (`v1.76.2`).
- **Status Summary**: Local AAC/M4A WASM decoder and Silero VAD tensor inference
  pass on Windows Deno proxy across synthetic negative and invalid controls.
  Local Edge Runtime worker probe confirms the candidate fits within the 20 MB
  CLI bundle limit (14.30 MB / 13.64 MiB `.eszip`), but execution fails at
  runtime (`TypeError: Creating a shared memory is not supported`) because the
  pinned official `onnxruntime-web@1.22.0` threaded WebAssembly distribution
  unconditionally requires shared memory (`SharedArrayBuffer`), which is
  unsupported by Edge Runtime V8 isolate policy. The tested threaded candidate
  is **BLOCKED** on Supabase Edge Runtime (this does not prove all possible VAD
  methods or future non-shared builds impossible); public quiet speech corpus
  remains **0/9 MISSING**.

---

## 1. Toolchain & Environment Provenance

- **Rust**: `1.97.1` (8bab26f4f 2026-07-14)
- **Cargo**: `1.97.1` (c980f4866 2026-06-30)
- **Deno**: `2.9.7` (stable, release, x86_64-pc-windows-msvc)
- **FFmpeg**: `9.0.2` (via winget links)
- **wasm-pack**: `0.15.0` (official release binary)
- **MSVC Toolchain**: Visual Studio 2022 Build Tools `14.44.35207` (`link.exe`
  Hostx64/x64) activated process-locally via `VsDevCmd.bat`.
- **Symphonia**: `0.6.1` (AAC-LC + ISO MP4 features)
- **ONNX Runtime Web**: `1.22.0` (official npm registry release)
- **Silero VAD**: commit `60b7ffa243625ebdc1070275a29f18c87843786a`

---

## 2. Artifacts & Pinned Assets

| Asset                         | Origin                                                                                                                   | Size (bytes) | SHA256 Digest                                                      | License & Obligations                                                                                                       |
| :---------------------------- | :----------------------------------------------------------------------------------------------------------------------- | :----------- | :----------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| `silero_vad.onnx`             | [`snakers4/silero-vad@60b7ffa...`](https://github.com/snakers4/silero-vad/tree/60b7ffa243625ebdc1070275a29f18c87843786a) | 2,327,524    | `1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3` | [MIT](https://raw.githubusercontent.com/snakers4/silero-vad/60b7ffa243625ebdc1070275a29f18c87843786a/LICENSE)               |
| `voice_decoder_bg.wasm`       | Symphonia 0.6.1 AAC+isomp4 `wasm-pack build --release --target web`                                                      | 432,802      | `106ef6b2e9713bc1d37f4b41266eb22c9f05d3659600e284a73f66bd4156b59a` | Wrapper crate MIT; upstream [Symphonia 0.6.1 MPL-2.0](https://raw.githubusercontent.com/pdeljanov/Symphonia/v0.6.1/LICENSE) |
| `ort-wasm-simd-threaded.wasm` | `npm:onnxruntime-web@1.22.0/dist/ort-wasm-simd-threaded.wasm`                                                            | 11,210,254   | `71aef04959c5c1b6de461b6538e2058e306610034a85aad2742d0c7fd4533fe4` | [MIT](https://raw.githubusercontent.com/microsoft/onnxruntime/v1.22.0/LICENSE)                                              |
| `ort-wasm-simd-threaded.mjs`  | `npm:onnxruntime-web@1.22.0/dist/ort-wasm-simd-threaded.mjs`                                                             | 20,856       | `30dd851d9c00622940500f71ddd2ff8820c5cb65270816080175b958705385a8` | [MIT](https://raw.githubusercontent.com/microsoft/onnxruntime/v1.22.0/LICENSE)                                              |
| `ort.wasm.min.mjs`            | `npm:onnxruntime-web@1.22.0/dist/ort.wasm.min.mjs`                                                                       | 48,259       | `6ef726f355b791129f7ddf3f62e7877a16b9b777abe87004b8ab306e6b9cf265` | [MIT](https://raw.githubusercontent.com/microsoft/onnxruntime/v1.22.0/LICENSE)                                              |

---

## 3. Local Deno Proxy Measurements

Measured locally on Windows x86_64 host under Deno 2.9.7
(`scripts/voice-audio-validation-spike/benchmark.ts`).

> [!WARNING] Windows host process CPU proxy and RSS checkpoints reflect host
> process metrics and are **NOT** equivalent to Supabase Edge isolated vCPU
> billing time or true peak isolate memory.

### 3.1 Full Matrix Breakdown (`results-fullmatrix.json`)

Session initialization wall time for this multi-case run: **1,535.60 ms**
(includes initial module compilation, WASM instantiation, and ONNX session
setup).

| Fixture ID         | Expected Class (Control Label) | Duration Decoded | Output Samples (16kHz) | Decode Wall (ms) | VAD Wall (ms) | Total Audio Wall (ms) | Process CPU Proxy (ms) | Checkpoint RSS | VAD Probability (min / median / p90 / max)       |
| :----------------- | :----------------------------- | :--------------- | :--------------------- | :--------------- | :------------ | :-------------------- | :--------------------- | :------------- | :----------------------------------------------- |
| `silence-05`       | no_speech                      | 5.039s           | 80,620                 | 154.63           | 593.92        | 749.04                | 2,109                  | 200.06 MB      | 0.00167 / 0.00300 / 0.00415 / 0.00891            |
| `silence-15`       | no_speech                      | 15.023s          | 240,373                | 93.97            | 791.41        | 885.53                | 2,563                  | 218.43 MB      | 0.00113 / 0.00128 / 0.00342 / 0.00891            |
| `silence-30`       | no_speech                      | 30.023s          | 480,374                | 140.79           | 967.44        | 1,108.31              | 1,203                  | 151.50 MB      | 0.00113 / 0.00141 / 0.00273 / 0.00891            |
| `fan-proxy-05`     | no_speech                      | 5.039s           | 80,620                 | 40.91            | 252.12        | 293.13                | 328                    | 152.08 MB      | 0.00009 / 0.00191 / 0.00346 / 0.03155            |
| `fan-proxy-15`     | no_speech                      | 15.023s          | 240,373                | 62.94            | 437.26        | 500.29                | 516                    | 151.01 MB      | 0.00013 / 0.00041 / 0.00229 / 0.03155            |
| `fan-proxy-30`     | no_speech                      | 30.023s          | 480,374                | 108.60           | 896.64        | 1,005.30              | 999                    | 156.45 MB      | 0.00012 / 0.00031 / 0.00154 / 0.03155            |
| `traffic-proxy-05` | no_speech                      | 5.039s           | 80,620                 | 35.00            | 210.87        | 246.93                | 250                    | 156.78 MB      | 0.00080 / 0.00542 / 0.00845 / 0.06827            |
| `traffic-proxy-15` | no_speech                      | 15.023s          | 240,373                | 82.64            | 658.38        | 741.07                | 734                    | 158.11 MB      | 0.00090 / 0.00304 / 0.00659 / 0.06827            |
| `traffic-proxy-30` | no_speech                      | 30.023s          | 480,374                | 130.15           | 898.78        | 1,028.98              | 1,016                  | 161.33 MB      | 0.00041 / 0.00154 / 0.00541 / 0.06827            |
| `unknown-bytes`    | invalid                        | 0s               | 0                      | 0.09             | 0.00          | 0.13                  | 0                      | 161.33 MB      | N/A (Rejected: "Not an ISO BMFF ftyp container") |

_Note: All 9 licensed positive cases (`quiet-eg-ar-{05,15,30}`,
`quiet-en-{05,15,30}`, `code-switch-{05,15,30}`) remain
`MISSING_LICENSED_FIXTURE` (0/9 evaluated). No production threshold,
classification predictions, or positive preservation claims are made._

### 3.2 Cold vs In-Session Single Observations (`silence-30`)

> [!NOTE] In benchmark JSON results, `totalWallMs` reflects audio decode + VAD
> inference only. Full cold execution includes session initialization
> (`sessionInitializationWallMs`). Single-run timing observations demonstrate
> local runtime variance rather than robust production speedup under concurrent
> traffic.

- **Cold Single-Process Session (`results-silence30-cold.json`)**:
  - Initialization Wall: **812.78 ms** (module loading + WASM compilation + ONNX
    session create)
  - Audio Decode Wall: **269.32 ms**
  - VAD Inference Wall: **1,726.48 ms**
  - Audio Pipeline Wall (`totalWallMs` in report): **1,996.13 ms**
  - **Full Cold End-to-End Wall Time**: `812.78 + 1,996.13 =` **2,808.91 ms**
  - Windows Process CPU Proxy: 4,234 ms
  - Checkpoint RSS: 180,678,656 bytes (172.31 MiB / 180.68 MB)
- **In-Session Observation (`results-fullmatrix.json`)**:
  - Audio Decode Wall: 140.79 ms
  - VAD Inference Wall: 967.44 ms
  - Audio Pipeline Wall: 1,108.31 ms
  - Windows Process CPU Proxy: 1,203 ms

---

## 4. Local Edge Runtime Investigation (`v1.76.2`)

Conducted using official Docker image
`public.ecr.aws/supabase/edge-runtime:v1.76.2` (immutable digest
`sha256:edd22bef4477b900d5c300e287ce9b18bff9b81a0291bee14ee0b7c7b71a2899`).<br>
Ceilings enforced via official
[EdgeRuntime.userWorkers.create API](https://raw.githubusercontent.com/supabase/edge-runtime/v1.76.2/examples/main/index.ts)
(applied to R2–R4):

- `memoryLimitMb: 256`
- `workerTimeoutMs: 150000` (150s wall clock ceiling)
- `cpuTimeSoftLimitMs: 1000`, `cpuTimeHardLimitMs: 2000` (2s CPU ceiling)
- `staticPatterns`: registered for WASM/ONNX/MJS assets
- `context.useReadSyncFileAPI: true`

### 4.1 Bundle Sizing against Official Limits

Per official
[Supabase Functions Limits](https://supabase.com/docs/guides/functions/limits):

- Local CLI deployment bundle limit: **20 MB**.
- Server-side Management API / Dashboard deployment bundle limit: **5 MB**.

| Iteration | Package Approach                                          | Bundle Size                                | SHA256 Digest                                                      | CLI Limit (20 MB) | Server-side Management API Limit (5 MB) |
| :-------- | :-------------------------------------------------------- | :----------------------------------------- | :----------------------------------------------------------------- | :---------------- | :-------------------------------------- |
| **R1**    | Naive whole-package `npm:onnxruntime-web`                 | 115,052,244 bytes (115.05 MB / 109.72 MiB) | `9F569431...`                                                      | EXCEEDED          | EXCEEDED                                |
| **R2**    | Vendored `ort.wasm.min.mjs` + minimal assets              | 14,225,611 bytes (14.23 MB / 13.57 MiB)    | `F1760FA2...`                                                      | **PASS**          | EXCEEDED                                |
| **R3**    | Minimal + static import of `ort-wasm-simd-threaded.mjs`   | 14,299,286 bytes (14.30 MB / 13.64 MiB)    | `79AA1EA8...`                                                      | **PASS**          | EXCEEDED                                |
| **R4**    | Minimal + static import + standard `global` alias adapter | 14,300,416 bytes (14.30 MB / 13.64 MiB)    | `793EB7474ADCA0A2219E6E36D0A7F830C5DE938C4D3D87CA1745CCA880557772` | **PASS**          | EXCEEDED                                |

> [!NOTE] The minimal `.eszip` (14.30 MB / 13.64 MiB) passes the 20 MB CLI
> limit. The 5 MB limit is specific to server-side Management API / Dashboard
> deployments and is exceeded due to the 11.2 MB ONNX Runtime WebAssembly
> binary.

### 4.2 Runtime Failure Receipts (R1 through R4)

- **R1 Packaging & Parameter Receipt**:
  - Unlinked `.eszip` caused user worker isolate to attempt reading non-existent
    `/var/tmp/sb-compile-edge-runtime/user/silero_vad.onnx`.
  - In R1, `workerTimeoutMs: 2000` was a wall clock timeout with no explicit CPU
    parameters; this was an invalid test harness configuration, not an actual
    CPU failure.
- **R2 Module Resolution Receipt**:
  - Error:
    `no available backend found. ERR: [wasm] TypeError: Module not found: file:///var/tmp/sb-compile-edge-runtime/user/ort-wasm-simd-threaded.mjs`
  - Cause: Dynamic `import()` inside `ort.wasm.min.mjs` was omitted from the
    bundler module graph.
- **R3 Global Environment Receipt**:
  - Static import graph registration resolved module inclusion.
  - Error:
    `no available backend found. ERR: [wasm] ReferenceError: global is not defined`
  - Cause: Emscripten loader in `ort-wasm-simd-threaded.mjs` detects
    `process.versions.node` and accesses `global.Worker`, but `global` is
    undefined in strict isolate mode.
- **R4 Conclusive Shared Memory Architecture Receipt**:
  - Standard compatibility adapter applied (`global = globalThis` per
    [Node.js global docs](https://nodejs.org/api/globals.html#global) and
    [Deno Node compatibility](https://docs.deno.com/api/node/about/)).
  - Container: `monyvi391-vad-probe-r4` on loopback port `19094`.
  - Exact Error Receipt:
    ```json
    {
      "status": "error",
      "message": "no available backend found. ERR: [wasm] TypeError: Creating a shared memory is not supported"
    }
    ```
  - **Conclusive Root Cause**: In `ort-wasm-simd-threaded.mjs`, the official
    pinned Emscripten factory unconditionally executes:
    `new WebAssembly.Memory({ initial: 256, maximum: 65536, shared: true })`.
    Supabase Edge Runtime V8 isolate policy explicitly forbids shared
    WebAssembly memory instantiation (`shared: true`), even when single-thread
    operation (`numThreads = 1`) is configured at runtime.
  - **Scope of Block**: This incompatibility is strictly tied to the **tested
    threaded distribution (`ort-wasm-simd-threaded.wasm`)** and the tested Edge
    Runtime version (`v1.76.2`). It does not imply that non-threaded WebAssembly
    builds (`ort-wasm.wasm` without pthreads/shared memory) or alternative VAD
    engines are categorically impossible.

---

## 5. Speech Positives Corpus Status (F1 Research)

- **Public Fixture Corpus**: 0/9 licensed quiet speech positives acquired.
  Complete suite remains **BLOCKED**.
- **Evaluated Public Datasets**:
  - **ArzEn**: Egyptian Arabic/English code-switching dataset. Author
    registration form with CC BY-SA 4.0 terms pending approval.
  - **LibriSpeech**: CC BY 4.0, English audiobook speech; non-naturally quiet.
  - **Mozilla Common Voice (Arabic)**: CC0, ~3.3 GB download; read-speech
    without verified Egyptian dialect tags.
  - **Perle**: Upstream provenance and licensing unverified.
- **Privacy & Owner Media Boundary**:
  - All private audio is strictly excluded from the published fixture corpus.
  - No private owner audio paths, filenames, hashes, or audio metrics are
    disclosed or retained in public documentation.

---

## 6. Primary Reference Links

- **Supabase Functions Resource Limits**:
  [https://supabase.com/docs/guides/functions/limits](https://supabase.com/docs/guides/functions/limits)
- **Supabase Edge Runtime API (v1.76.2)**:
  [https://raw.githubusercontent.com/supabase/edge-runtime/v1.76.2/examples/main/index.ts](https://raw.githubusercontent.com/supabase/edge-runtime/v1.76.2/examples/main/index.ts)
- **ONNX Runtime Web Deploy Guide**:
  [https://onnxruntime.ai/docs/tutorials/web/deploy.html](https://onnxruntime.ai/docs/tutorials/web/deploy.html)
- **ONNX Runtime Repository License**:
  [https://raw.githubusercontent.com/microsoft/onnxruntime/v1.22.0/LICENSE](https://raw.githubusercontent.com/microsoft/onnxruntime/v1.22.0/LICENSE)
- **Symphonia License (v0.6.1)**:
  [https://raw.githubusercontent.com/pdeljanov/Symphonia/v0.6.1/LICENSE](https://raw.githubusercontent.com/pdeljanov/Symphonia/v0.6.1/LICENSE)
- **Silero VAD Repository & License**:
  [https://raw.githubusercontent.com/snakers4/silero-vad/60b7ffa243625ebdc1070275a29f18c87843786a/LICENSE](https://raw.githubusercontent.com/snakers4/silero-vad/60b7ffa243625ebdc1070275a29f18c87843786a/LICENSE)
- **Node.js Global Object**:
  [https://nodejs.org/api/globals.html#global](https://nodejs.org/api/globals.html#global)
- **Deno Node Compatibility**:
  [https://docs.deno.com/api/node/about/](https://docs.deno.com/api/node/about/)

---

## 7. Next Steps & Technical Path Forward

1. Pinned `ort-wasm-simd-threaded.wasm` distribution is architecturally blocked
   by Edge Runtime's shared memory policy.
2. Next exploration requires an Edge-compatible non-shared WebAssembly build of
   ONNX Runtime Web (`ort-wasm.wasm` without pthreads/shared memory) or an
   alternative non-shared VAD engine.
3. Secure licensed quiet speech positive fixtures before making any production
   threshold or FNR/FPR determinations.
