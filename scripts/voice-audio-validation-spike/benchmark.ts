/**
 * #391 NONPRODUCTION Deno proxy, not a Supabase Edge CPU test.
 * Run ONLY in a separately permitted environment. Protected local lean-ctx
 * executors disallow deno.exe/ffmpeg; never retry or bypass that policy.
 * No network/provider API is called; all fixtures/assets must be licensed/local.
 */
import process from "node:process";

type FixtureClass = "no_speech" | "speech" | "invalid";

interface Fixture {
  readonly id: string;
  readonly relativePath: string | null;
  readonly durationBucketSeconds: number;
  readonly expectedClass: FixtureClass;
  readonly origin: string;
  readonly license: string | null;
  readonly sha256: string | null;
  readonly status: "ready" | "missing";
}

interface FixtureManifest {
  readonly schemaVersion: 1;
  readonly fixtures: readonly Fixture[];
}

interface Options {
  readonly sourceRevision: string;
  readonly includeId: string | null;
  readonly threshold: number | null;
  readonly minimumSpeechMs: number | null;
}

interface DecodedAudio {
  readonly samples: Float32Array;
  readonly sourceRateHz: number;
  readonly decodedSourceFrames: number;
  readonly outputRateHz: number;
}

type OrtModule = typeof import("npm:onnxruntime-web@1.22.0");
type OrtSession = import("npm:onnxruntime-web@1.22.0").InferenceSession;

const ROOT = new URL("./local/", import.meta.url);
const MANIFEST_URL = new URL("fixtures.json", ROOT);
const MODEL_URL = new URL("silero_vad.onnx", ROOT);
const ORT_WASM_URL = new URL("ort-wasm-simd-threaded.wasm", ROOT);
const DECODER_WASM_URL = new URL("./decoder/pkg/voice_decoder_bg.wasm", import.meta.url);
const TARGET_SAMPLE_RATE = 16_000;
const FRAME_SAMPLES = 512;
const CONTEXT_SAMPLES = 64;
const FRAME_MILLISECONDS = FRAME_SAMPLES * 1000 / TARGET_SAMPLE_RATE;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MODEL_ORIGIN = "snakers4/silero-vad@60b7ffa243625ebdc1070275a29f18c87843786a";
const RUNTIME_IMPORT = "npm:onnxruntime-web@1.22.0";
const REQUIRED_CLASSES = [
  "silence", "fan-proxy", "traffic-proxy",
  "quiet-eg-ar", "quiet-en", "code-switch",
] as const;
const DURATIONS = [5, 15, 30] as const;

function emit(message: string): void {
  Deno.stdout.writeSync(new TextEncoder().encode(message + "\n"));
}

function parseOptions(): Options {
  const values = new Map<string, string>();
  const accepted = new Set(["source-revision", "include", "threshold", "minimum-speech-ms"]);
  for (const argument of Deno.args) {
    const match = /^--([a-z-]+)=(.*)$/.exec(argument);
    if (!match || !accepted.has(match[1]) || values.has(match[1])) {
      throw new Error("Unknown/duplicate argument. Only --source-revision, --include, --threshold, --minimum-speech-ms are supported.");
    }
    values.set(match[1], match[2]);
  }
  const sourceRevision = values.get("source-revision") ?? "";
  if (!/^[a-f0-9]{40}$/.test(sourceRevision)) {
    throw new Error("Require --source-revision=<actual checkout git SHA> (40 lowercase hex characters); do not use the research parent SHA.");
  }
  const thresholdText = values.get("threshold");
  const minimumText = values.get("minimum-speech-ms");
  if ((thresholdText === undefined) !== (minimumText === undefined)) {
    throw new Error("Provide BOTH exploratory threshold and minimum speech milliseconds, or neither.");
  }
  const threshold = thresholdText === undefined ? null : Number(thresholdText);
  const minimumSpeechMs = minimumText === undefined ? null : Number(minimumText);
  if (threshold !== null &&
      (thresholdText === "" || !Number.isFinite(threshold) || threshold < 0 || threshold > 1)) {
    throw new Error("Exploratory --threshold must be in [0,1]. No production threshold is approved.");
  }
  if (minimumSpeechMs !== null &&
      (minimumText === "" || !Number.isFinite(minimumSpeechMs) || minimumSpeechMs <= 0)) {
    throw new Error("Exploratory --minimum-speech-ms must be positive.");
  }
  return {
    sourceRevision,
    includeId: values.get("include") ?? null,
    threshold,
    minimumSpeechMs,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function classForId(id: string): { expectedClass: FixtureClass; duration: number; filename: string } | null {
  if (id === "unknown-bytes") {
    return { expectedClass: "invalid", duration: 0, filename: "unknown-bytes.bin" };
  }
  const match = /^(silence|fan-proxy|traffic-proxy|quiet-eg-ar|quiet-en|code-switch)-(05|15|30)$/.exec(id);
  if (!match) return null;
  const duration = Number(match[2]);
  const expectedClass = ["quiet-eg-ar", "quiet-en", "code-switch"].includes(match[1])
    ? "speech" : "no_speech";
  return { expectedClass, duration, filename: id + ".m4a" };
}

/**
 * A manifest is an evidence record, NEVER a capability to access arbitrary
 * local paths. Only fixed local basenames and the complete known suite are valid.
 */
function parseManifest(value: unknown): FixtureManifest {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.fixtures)) {
    throw new Error("Invalid fixture manifest schema/version.");
  }
  const fixtures: Fixture[] = [];
  const seen = new Set<string>();
  for (const raw of value.fixtures as unknown[]) {
    if (!isRecord(raw) || typeof raw.id !== "string" || seen.has(raw.id)) {
      throw new Error("Non-object, invalid or duplicate fixture ID.");
    }
    const descriptor = classForId(raw.id);
    if (!descriptor ||
        raw.expectedClass !== descriptor.expectedClass ||
        raw.durationBucketSeconds !== descriptor.duration ||
        typeof raw.origin !== "string" || raw.origin.trim().length === 0 ||
        (raw.status !== "ready" && raw.status !== "missing")) {
      throw new Error("Manifest content disagrees with fixed fixture taxonomy: " + raw.id);
    }
    seen.add(raw.id);
    if (raw.status === "ready") {
      if (raw.relativePath !== descriptor.filename ||
          typeof raw.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(raw.sha256) ||
          typeof raw.license !== "string" || raw.license.trim().length === 0) {
        throw new Error("Ready fixture lacks fixed basename/SHA-256/license: " + raw.id);
      }
    } else if (raw.relativePath !== null || raw.sha256 !== null || raw.license !== null) {
      throw new Error("Missing fixture must not claim media/license/evidence: " + raw.id);
    }
    fixtures.push({
      id: raw.id,
      relativePath: raw.relativePath as string | null,
      durationBucketSeconds: descriptor.duration,
      expectedClass: descriptor.expectedClass,
      origin: raw.origin,
      license: raw.license as string | null,
      sha256: raw.sha256 as string | null,
      status: raw.status,
    });
  }
  const requiredIds = [...REQUIRED_CLASSES.flatMap((name) =>
    DURATIONS.map((duration) => name + "-" + String(duration).padStart(2, "0"))), "unknown-bytes"];
  if (seen.size !== requiredIds.length || requiredIds.some((id) => !seen.has(id))) {
    throw new Error("Manifest must enumerate all 5/15/30s positive/negative cases and malformed control. Missing evidence uses status=missing, not omitted rows.");
  }
  return { schemaVersion: 1, fixtures };
}

async function hash(bytes: Uint8Array): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fileEvidence(url: URL): Promise<{ bytes: number; sha256: string }> {
  const file = await Deno.readFile(url);
  return { bytes: file.byteLength, sha256: await hash(file) };
}

function decodedAudio(value: unknown): value is DecodedAudio {
  if (!isRecord(value) || !(value.samples instanceof Float32Array)) return false;
  const length = value.samples.length;
  return value.outputRateHz === TARGET_SAMPLE_RATE &&
    typeof value.sourceRateHz === "number" &&
    Number.isInteger(value.sourceRateHz) && value.sourceRateHz >= 8_000 && value.sourceRateHz <= 96_000 &&
    typeof value.decodedSourceFrames === "number" &&
    Number.isSafeInteger(value.decodedSourceFrames) && value.decodedSourceFrames > 0 &&
    length > 0 && length <= TARGET_SAMPLE_RATE * 65 &&
    value.samples.every((sample: number) => Number.isFinite(sample) && Math.abs(sample) <= 1);
}

function candidateDecision(probabilities: readonly number[], threshold: number | null, minimumSpeechMs: number | null): boolean | null {
  if (threshold === null || minimumSpeechMs === null) return null;
  let longestRun = 0;
  let consecutive = 0;
  for (const probability of probabilities) {
    consecutive = probability >= threshold ? consecutive + 1 : 0;
    longestRun = Math.max(longestRun, consecutive);
  }
  return longestRun * FRAME_MILLISECONDS >= minimumSpeechMs;
}

function summarize(probabilities: readonly number[]): object {
  if (probabilities.length === 0) throw new Error("No VAD frames were processed.");
  const sorted = [...probabilities].sort((left, right) => left - right);
  return {
    analyzedFrames: sorted.length,
    frameMilliseconds: FRAME_MILLISECONDS,
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    p90: sorted[Math.floor(0.9 * (sorted.length - 1))],
    max: sorted[sorted.length - 1],
  };
}

function verifyModelNames(session: OrtSession): void {
  const same = (actual: readonly string[], expected: readonly string[]): boolean =>
    actual.length === expected.length &&
    expected.every((value) => actual.includes(value));
  if (!same(session.inputNames, ["input", "state", "sr"]) ||
      !same(session.outputNames, ["output", "stateN"])) {
    throw new Error("Pinned model input/output names differ from upstream Silero reference.");
  }
}

/** Reset Silero's state and context for EVERY recording, even after a rejected one. */
async function modelProbabilities(ort: OrtModule, session: OrtSession, samples: Float32Array): Promise<number[]> {
  let state = new Float32Array(2 * 128);
  let context = new Float32Array(CONTEXT_SAMPLES);
  // Original Silero Python: np.array(sr, dtype='int64') => rank-0 scalar.
  const sr = new ort.Tensor("int64", new BigInt64Array([BigInt(TARGET_SAMPLE_RATE)]), []);
  const probabilities: number[] = [];
  for (let offset = 0; offset < samples.length; offset += FRAME_SAMPLES) {
    const input = new Float32Array(CONTEXT_SAMPLES + FRAME_SAMPLES);
    input.set(context, 0);
    input.set(samples.subarray(offset, offset + FRAME_SAMPLES), CONTEXT_SAMPLES);
    // Trailing incomplete frame receives silence padding, as upstream
    // audio_forward does; a valid final short utterance is not discarded.
    const output = await session.run({
      input: new ort.Tensor("float32", input, [1, CONTEXT_SAMPLES + FRAME_SAMPLES]),
      state: new ort.Tensor("float32", state, [2, 1, 128]),
      sr,
    });
    const speech = output.output;
    const updatedState = output.stateN;
    if (!speech || !updatedState ||
        !(speech.data instanceof Float32Array) || speech.data.length !== 1 ||
        speech.dims.length !== 2 || speech.dims[0] !== 1 || speech.dims[1] !== 1 ||
        !(updatedState.data instanceof Float32Array) || updatedState.data.length !== 2 * 128 ||
        updatedState.dims.length !== 3 ||
        updatedState.dims[0] !== 2 || updatedState.dims[1] !== 1 || updatedState.dims[2] !== 128) {
      throw new Error("Pinned Silero ONNX output shape/type differs from reference.");
    }
    const probability = speech.data[0];
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new Error("Invalid Silero probability.");
    }
    probabilities.push(probability);
    state = new Float32Array(updatedState.data);
    context = input.slice(input.length - CONTEXT_SAMPLES);
  }
  return probabilities;
}

async function main(): Promise<void> {
  const config = parseOptions();
  const manifest = parseManifest(JSON.parse(await Deno.readTextFile(MANIFEST_URL)) as unknown);
  const relevant = config.includeId === null
    ? manifest.fixtures
    : manifest.fixtures.filter((fixture) => fixture.id === config.includeId);
  if (relevant.length === 0) throw new Error("Unknown fixture --include id.");

  // Resolve model/decoder paths at fixed local locations only; the manifest
  // cannot supply URLs, absolute paths or traversal into the workspace.
  const modelBytes = await Deno.readFile(MODEL_URL);
  const ortWasmBytes = await Deno.readFile(ORT_WASM_URL);
  const decoderWasmBytes = await Deno.readFile(DECODER_WASM_URL);
  const artifactInfo = {
    model: { origin: MODEL_ORIGIN, ...(await fileEvidence(MODEL_URL)) },
    decoderWasm: { origin: "Symphonia 0.6.1 AAC+isomp4 wasm-pack --target web local build",
      ...(await fileEvidence(DECODER_WASM_URL)) },
    ortWasm: { origin: RUNTIME_IMPORT + "/dist/ort-wasm-simd-threaded.wasm",
      ...(await fileEvidence(ORT_WASM_URL)) },
    compiledSupabaseBundleBytes: null,
  };

  // Import and explicitly initialize wasm-bindgen's supported --target web
  // ES module using bytes; do NOT treat a function export as proof it was
  // initialized. This measures local module+WASM+model init wall, not Edge cold.
  const initStart = performance.now();
  const decoder = await import("./decoder/pkg/voice_decoder.js");
  await decoder.default(decoderWasmBytes);
  if (typeof decoder.decode_m4a_to_pcm16k !== "function") {
    throw new Error("Symphonia WASM export absent after initialization.");
  }
  const ort = await import("npm:onnxruntime-web@1.22.0");
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmBinary = ortWasmBytes;
  const session = await ort.InferenceSession.create(modelBytes, { executionProviders: ["wasm"] });
  verifyModelNames(session);
  const initializationWallMs = performance.now() - initStart;

  const results: unknown[] = [];
  const actuallyEvaluatedSpeech = new Set<string>();
  for (const item of relevant) {
    if (item.status !== "ready" || item.relativePath === null || item.sha256 === null || item.license === null) {
      results.push({ id: item.id, expectedClass: item.expectedClass, status: "MISSING_LICENSED_FIXTURE", measured: false });
      continue;
    }
    // parseManifest verified the exact basename and disallowed traversal.
    const fileUrl = new URL(item.relativePath, ROOT);
    const bytes = await Deno.readFile(fileUrl);
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES ||
        await hash(bytes) !== item.sha256) {
      throw new Error("Fixture size/checksum failed: " + item.id);
    }

    const wallStart = performance.now();
    const cpuStart = process.cpuUsage();
    const rssStart = Deno.memoryUsage().rss;
    let decoded: DecodedAudio | null = null;
    let decodeError: string | null = null;
    try {
      const candidate: unknown = decoder.decode_m4a_to_pcm16k(bytes);
      if (!decodedAudio(candidate)) throw new Error("Decoder returned invalid PCM metadata/content.");
      decoded = candidate;
    } catch (error: unknown) {
      decodeError = error instanceof Error ? error.message : String(error);
    }
    const decodeWallMs = performance.now() - wallStart;
    const rssAfterDecode = Deno.memoryUsage().rss;
    if (decodeError !== null) {
      const cpu = process.cpuUsage(cpuStart);
      const isExpectedInvalid = item.expectedClass === "invalid" &&
        decodeError.includes("Not an ISO BMFF ftyp container");
      results.push({
        id: item.id,
        expectedClass: item.expectedClass,
        status: isExpectedInvalid ? "EXPECTED_STRUCTURAL_REJECTION" : "UNEXPECTED_DECODE_FAILURE",
        decodeError,
        decodeWallMs,
        totalWallMs: performance.now() - wallStart,
        processCpuMsProxy: (cpu.user + cpu.system) / 1000,
        observedRssBytesAtCheckpoints: Math.max(rssStart, rssAfterDecode),
        truePeakMemoryBytes: null,
        edgeActiveCpuMs: null,
      });
      continue;
    }
    if (decoded === null || item.expectedClass === "invalid") {
      throw new Error("Decoder result unexpectedly accepted invalid audio: " + item.id);
    }
    const vadStart = performance.now();
    const probabilities = await modelProbabilities(ort, session, decoded.samples);
    const vadWallMs = performance.now() - vadStart;
    const cpu = process.cpuUsage(cpuStart);
    const accepted = candidateDecision(probabilities, config.threshold, config.minimumSpeechMs);
    if (item.expectedClass === "speech") actuallyEvaluatedSpeech.add(item.id);
    const inferredDurationSeconds = decoded.decodedSourceFrames / decoded.sourceRateHz;
    results.push({
      id: item.id,
      expectedClass: item.expectedClass,
      status: "MEASURED_LOCAL_DENO_ONLY",
      origin: item.origin,
      license: item.license,
      durationBucketSeconds: item.durationBucketSeconds,
      decodedSourceFrames: decoded.decodedSourceFrames,
      sourceRateHz: decoded.sourceRateHz,
      decodedDurationSecondsIncludingCodecPriming: inferredDurationSeconds,
      outputRateHz: TARGET_SAMPLE_RATE,
      outputSamples: decoded.samples.length,
      finalFrameZeroPadded: decoded.samples.length % FRAME_SAMPLES !== 0,
      sampleDurationMatchesBucketWithin200ms: Math.abs(inferredDurationSeconds - item.durationBucketSeconds) <= 0.2,
      decodeWallMs,
      vadWallMs,
      totalWallMs: performance.now() - wallStart,
      processCpuMsProxy: (cpu.user + cpu.system) / 1000,
      observedRssBytesAtCheckpoints: Math.max(rssStart, rssAfterDecode, Deno.memoryUsage().rss),
      truePeakMemoryBytes: null,
      edgeActiveCpuMs: null,
      vadFeatures: summarize(probabilities),
      exploratoryCandidateAcceptedSpeech: accepted,
      exploratoryCandidateCorrect: accepted === null ? null : accepted === (item.expectedClass === "speech"),
    });
  }
  const speechCases = manifest.fixtures.filter((item) => item.expectedClass === "speech");
  const completeSpeechCoverage = config.includeId === null &&
    speechCases.every((item) => item.status === "ready" && actuallyEvaluatedSpeech.has(item.id));
  const allMissing = manifest.fixtures.filter((item) => item.status === "missing").map((item) => item.id);
  const report = {
    schemaVersion: 1,
    mode: "LOCAL_DENO_PROXY_NOT_HOSTED_EDGE",
    sourceRevision: config.sourceRevision, // actual checkout SHA supplied, not hardcoded parent
    sourceRevisionEvidence: "explicit --source-revision (caller must verify git rev-parse HEAD)",
    generatedAt: new Date().toISOString(),
    runtime: { deno: Deno.version.deno, platform: Deno.build.os, architecture: Deno.build.arch },
    artifacts: artifactInfo,
    sessionInitializationWallMs: initializationWallMs,
    candidate: { threshold: config.threshold, minimumSpeechMs: config.minimumSpeechMs,
      status: "EXPLORATORY_NOT_APPROVED" },
    selectedCase: config.includeId,
    results,
    coverage: {
      completeSpeechCoverage,
      requiredQuietSpeechPreservation: "UNMEASURED_UNTIL_ALL_LICENSED_POSITIVES_PRESENT_AND_EVALUATED",
      missingFixtureIds: allMissing,
      hostedEdgeCpu: "UNMEASURED",
      hostedEdgeColdWarmLatency: "UNMEASURED",
      hostedEdgeMemoryPeak: "UNMEASURED",
      hostedBundle: "UNMEASURED",
      edgeCpuAndBundleGatePassed: false,
    },
  };
  await Deno.writeTextFile(new URL("results.json", ROOT), JSON.stringify(report, null, 2) + "\n");
  emit("Local Deno-only evidence written under ignored local/. Supabase Edge: UNMEASURED.");
  emit("Quiet speech corpus: " + (completeSpeechCoverage ? "cases evaluated, accuracy needs review" : "MISSING/BLOCKED"));
}

if (import.meta.main) {
  await main();
}
