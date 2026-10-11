/**
 * #391 NONPRODUCTION local Deno pipeline probe. NOT an Edge CPU benchmark.
 * Requires built local Symphonia WASM adapter, pinned Silero ONNX, matching
 * pinned ONNX Runtime Web WASM and synthetic/licensed manifest fixtures.
 * No network/provider endpoint is called by this code.
 */
import process from "node:process";

interface Fixture {
  readonly id: string;
  readonly relativePath: string | null;
  readonly durationBucketSeconds: number;
  readonly expectedClass: "no_speech" | "speech" | "invalid";
  readonly sha256: string | null;
  readonly status: "ready" | "missing";
  readonly origin: string;
  readonly license: string | null;
}

interface FixtureManifest {
  readonly schemaVersion: number;
  readonly fixtures: Fixture[];
}

interface Options {
  readonly manifestUrl: URL;
  readonly modelUrl: URL;
  readonly runtimeWasmUrl: URL;
  readonly includeId: string | null;
  readonly threshold: number | null;
  readonly minimumSpeechMs: number | null;
}

const ROOT = new URL("./local/", import.meta.url);
const DECODER_WASM = new URL("./decoder/pkg/voice_decoder_bg.wasm", import.meta.url);
const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 512;
const CONTEXT_SAMPLES = 64;
const FRAME_MILLISECONDS = FRAME_SAMPLES * 1000 / TARGET_SAMPLE_RATE;
const MODEL_ORIGIN = "snakers4/silero-vad@60b7ffa243625ebdc1070275a29f18c87843786a";
const RUNTIME_IMPORT = "npm:onnxruntime-web@1.22.0";

function emit(message: string): void {
  Deno.stdout.writeSync(new TextEncoder().encode(message + "\n"));
}

function readOption(name: string): string | null {
  const token = Deno.args.find((arg) => arg.startsWith("--" + name + "="));
  return token ? token.slice(name.length + 3) : null;
}

function options(): Options {
  const candidateThreshold = readOption("threshold");
  const candidateMinimum = readOption("minimum-speech-ms");
  if ((candidateThreshold === null) !== (candidateMinimum === null)) {
    throw new Error("Specify both --threshold and --minimum-speech-ms or neither.");
  }
  const threshold = candidateThreshold === null ? null : Number(candidateThreshold);
  const minimumSpeechMs = candidateMinimum === null ? null : Number(candidateMinimum);
  if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)) {
    throw new Error("--threshold must be within [0,1]; exploratory, NOT a production default");
  }
  if (minimumSpeechMs !== null && (!Number.isFinite(minimumSpeechMs) || minimumSpeechMs <= 0)) {
    throw new Error("--minimum-speech-ms must be positive; exploratory, NOT a production default");
  }
  return {
    manifestUrl: new URL(readOption("manifest") ?? "./local/fixtures.json", import.meta.url),
    modelUrl: new URL(readOption("model") ?? "./local/silero_vad.onnx", import.meta.url),
    runtimeWasmUrl: new URL(readOption("ort-wasm") ?? "./local/ort-wasm-simd-threaded.wasm", import.meta.url),
    includeId: readOption("include"),
    threshold,
    minimumSpeechMs,
  };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sizeAndHash(url: URL): Promise<{ bytes: number; sha256: string }> {
  const bytes = await Deno.readFile(url);
  return { bytes: bytes.byteLength, sha256: await sha256(bytes) };
}

function peakObserved(...values: number[]): number {
  return Math.max(...values);
}

function candidateDecision(probs: readonly number[], threshold: number | null, minimumSpeechMs: number | null): boolean | null {
  if (threshold === null || minimumSpeechMs === null) return null;
  let longestStreak = 0;
  let currentStreak = 0;
  for (const probability of probs) {
    currentStreak = probability >= threshold ? currentStreak + 1 : 0;
    longestStreak = Math.max(longestStreak, currentStreak);
  }
  return longestStreak * FRAME_MILLISECONDS >= minimumSpeechMs;
}

function summarizedProbabilities(probabilities: number[]): object {
  if (probabilities.length === 0) throw new Error("Zero analyzed VAD frames");
  const sorted = [...probabilities].sort((a, b) => a - b);
  return {
    analyzedFrames: sorted.length,
    frameMilliseconds: FRAME_MILLISECONDS,
    min: sorted[0],
    median: sorted[Math.floor(sorted.length * 0.5)],
    p90: sorted[Math.floor(sorted.length * 0.9)],
    max: sorted[sorted.length - 1],
  };
}

/** The model's state and 64-sample context must reset BETWEEN EVERY fixture. */
async function modelProbabilities(
  ort: typeof import("npm:onnxruntime-web@1.22.0"),
  session: import("npm:onnxruntime-web@1.22.0").InferenceSession,
  samples: Float32Array,
): Promise<number[]> {
  const stateShape = [2, 1, 128];
  let state = new Float32Array(2 * 128);
  let context = new Float32Array(CONTEXT_SAMPLES);
  const sr = new ort.Tensor("int64", new BigInt64Array([BigInt(TARGET_SAMPLE_RATE)]), [1]);
  const probabilities: number[] = [];
  for (let offset = 0; offset + FRAME_SAMPLES <= samples.length; offset += FRAME_SAMPLES) {
    const frame = samples.subarray(offset, offset + FRAME_SAMPLES);
    const input = new Float32Array(FRAME_SAMPLES + CONTEXT_SAMPLES);
    input.set(context);
    input.set(frame, CONTEXT_SAMPLES);
    const outputs = await session.run({
      input: new ort.Tensor("float32", input, [1, input.length]),
      state: new ort.Tensor("float32", state, stateShape),
      sr,
    });
    if (!outputs.output || !outputs.stateN) {
      throw new Error("Pinned Silero ONNX input/output contract incompatible with probe");
    }
    const probability = Number(outputs.output.data[0]);
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new Error("Invalid VAD probability");
    }
    probabilities.push(probability);
    state = new Float32Array(outputs.stateN.data as Float32Array);
    context = frame.slice(FRAME_SAMPLES - CONTEXT_SAMPLES);
  }
  return probabilities;
}

async function main(): Promise<void> {
  const config = options();
  const manifest = JSON.parse(await Deno.readTextFile(config.manifestUrl)) as FixtureManifest;
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.fixtures)) {
    throw new Error("Unsupported fixture manifest format");
  }
  const relevant = config.includeId
    ? manifest.fixtures.filter((fixture) => fixture.id === config.includeId)
    : manifest.fixtures;
  if (relevant.length === 0) throw new Error("No fixtures selected");
  const missing = relevant.filter((fixture) => fixture.status !== "ready");
  const modelFile = await Deno.readFile(config.modelUrl);
  const ortWasmFile = await Deno.readFile(config.runtimeWasmUrl);
  const artifactInfo = {
    model: { origin: MODEL_ORIGIN, ...(await sizeAndHash(config.modelUrl)) },
    decoderWasm: { origin: "local wasm-pack build: Symphonia 0.6.1 AAC+isomp4", ...(await sizeAndHash(DECODER_WASM)) },
    ortWasm: { origin: RUNTIME_IMPORT + "/dist/ort-wasm-simd-threaded.wasm", ...(await sizeAndHash(config.runtimeWasmUrl)) },
    compiledSupabaseBundleBytes: null,
  };
  // Timing from here excludes Deno process startup and npm module resolution.
  // It is NOT a hosted Edge isolate cold-start metric.
  const initStart = performance.now();
  const decoder = await import("./decoder/pkg/voice_decoder.js");
  if (typeof decoder.decode_m4a_to_pcm16k !== "function") {
    throw new Error("Local Symphonia WASM export absent");
  }
  const ort = await import("npm:onnxruntime-web@1.22.0");
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmBinary = ortWasmFile;
  const session = await ort.InferenceSession.create(modelFile, { executionProviders: ["wasm"] });
  const sessionInitializationWallMs = performance.now() - initStart;
  const results: unknown[] = [];
  for (const item of relevant) {
    if (item.status !== "ready" || !item.relativePath || !item.sha256 || !item.license) {
      results.push({ id: item.id, expectedClass: item.expectedClass, status: "MISSING_LICENSED_FIXTURE", measured: false });
      continue;
    }
    const sourceUrl = new URL(item.relativePath, config.manifestUrl);
    const bytes = await Deno.readFile(sourceUrl);
    if (await sha256(bytes) !== item.sha256) {
      throw new Error("Fixture checksum mismatch: " + item.id);
    }
    const startWall = performance.now();
    const startCpu = process.cpuUsage();
    const rssStart = Deno.memoryUsage().rss;
    let decoded: { samples: Float32Array; sourceRateHz: number; decodedSourceFrames: number; outputRateHz: number };
    let decodingError: string | null = null;
    try {
      decoded = decoder.decode_m4a_to_pcm16k(bytes) as typeof decoded;
      if (!(decoded.samples instanceof Float32Array) ||
          decoded.outputRateHz !== TARGET_SAMPLE_RATE ||
          !Number.isFinite(decoded.decodedSourceFrames) ||
          decoded.sourceRateHz <= 0) {
        throw new Error("Decoder result violates expected shape");
      }
    } catch (error: unknown) {
      decodingError = error instanceof Error ? error.message : String(error);
    }
    const decodeWallMs = performance.now() - startWall;
    const rssAfterDecode = Deno.memoryUsage().rss;
    if (decodingError !== null) {
      const usedCpu = process.cpuUsage(startCpu);
      results.push({
        id: item.id, expectedClass: item.expectedClass,
        status: item.expectedClass === "invalid" ? "EXPECTED_STRUCTURAL_REJECTION" : "UNEXPECTED_DECODE_FAILURE",
        decodingError, durationBucketSeconds: item.durationBucketSeconds,
        decodeWallMs, totalWallMs: performance.now() - startWall,
        processCpuMsProxy: (usedCpu.user + usedCpu.system) / 1000,
        observedRssBytesAtCheckpoints: peakObserved(rssStart, rssAfterDecode),
        edgeActiveCpuMs: null,
      });
      continue;
    }
    if (item.expectedClass === "invalid") {
      throw new Error("Malformed fixture decoded unexpectedly: " + item.id);
    }
    const decodeResult = decoded!;
    const inferredDurationSeconds = decodeResult.decodedSourceFrames / decodeResult.sourceRateHz;
    const vadStart = performance.now();
    const probabilities = await modelProbabilities(ort, session, decodeResult.samples);
    const vadWallMs = performance.now() - vadStart;
    const usage = process.cpuUsage(startCpu);
    const accepted = candidateDecision(probabilities, config.threshold, config.minimumSpeechMs);
    results.push({
      id: item.id,
      expectedClass: item.expectedClass,
      status: "MEASURED_LOCAL_DENO_ONLY",
      durationBucketSeconds: item.durationBucketSeconds,
      decodedSourceFrames: decodeResult.decodedSourceFrames,
      sourceRateHz: decodeResult.sourceRateHz,
      decodedDurationSecondsIncludingCodecPriming: inferredDurationSeconds,
      outputRateHz: TARGET_SAMPLE_RATE,
      outputSamples: decodeResult.samples.length,
      sampleDurationMatchesBucketWithin200ms: Math.abs(inferredDurationSeconds - item.durationBucketSeconds) <= 0.2,
      decodeWallMs, vadWallMs, totalWallMs: performance.now() - startWall,
      processCpuMsProxy: (usage.user + usage.system) / 1000,
      observedRssBytesAtCheckpoints: peakObserved(rssStart, rssAfterDecode, Deno.memoryUsage().rss),
      truePeakMemoryBytes: null,
      edgeActiveCpuMs: null,
      vadFeatures: summarizedProbabilities(probabilities),
      exploratoryCandidateAcceptedSpeech: accepted,
      exploratoryCandidateCorrect: accepted === null ? null : accepted === (item.expectedClass === "speech"),
    });
  }
  const speechMissing = missing.filter((fixture) => fixture.expectedClass === "speech");
  const completeSpeechCoverage = speechMissing.length === 0 &&
    [5, 15, 30].every((seconds) =>
      relevant.some((fixture) => fixture.expectedClass === "speech" &&
        fixture.durationBucketSeconds === seconds && fixture.status === "ready"));
  const report = {
    schemaVersion: 1,
    mode: "LOCAL_DENO_PROXY_NOT_HOSTED_EDGE",
    sourceRevision: "1a208d72750fb457933070f76669f7ae95975864",
    generatedAt: new Date().toISOString(),
    runtime: { deno: Deno.version.deno, platform: Deno.build.os, architecture: Deno.build.arch },
    artifacts: artifactInfo,
    sessionInitializationWallMs,
    candidate: { threshold: config.threshold, minimumSpeechMs: config.minimumSpeechMs, status: "EXPLORATORY_NOT_APPROVED" },
    selectedCase: config.includeId,
    results,
    coverage: {
      completeSpeechCoverage,
      requiredQuietSpeechPreservation: "UNMEASURED_UNTIL_ALL_LICENSED_POSITIVES_PRESENT",
      missingFixtureIds: missing.map((item) => item.id),
      hostedEdgeCpu: "UNMEASURED",
      hostedEdgeColdWarmLatency: "UNMEASURED",
      hostedEdgeMemoryPeak: "UNMEASURED",
      hostedBundle: "UNMEASURED",
      edgeCpuAndBundleGatePassed: false,
    },
  };
  await Deno.mkdir(ROOT, { recursive: true });
  await Deno.writeTextFile(new URL("results.json", ROOT), JSON.stringify(report, null, 2) + "\n");
  emit("Local Deno results: scripts/voice-audio-validation-spike/local/results.json");
  emit("Hosted Edge feasibility: UNMEASURED (no CPU, bundle, or isolate evidence).");
  emit("Quiet speech corpus: " + (completeSpeechCoverage ? "PRESENT, scoring still exploratory" : "INCOMPLETE/BLOCKED"));
}

if (import.meta.main) {
  await main();
}
