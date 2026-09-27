import { readFileSync } from "node:fs";
import path from "node:path";
import { LOCAL_SMS_FIXTURE_CORPUS } from "../packages/logic/src/parsers/local-sms-fixture-corpus";
import type { LocalSmsFixture } from "../packages/logic/src/parsers/local-sms-parser-types";
import { getUtf8ByteLength } from "../packages/logic/src/sms-safeguards/sms-input-estimator";
import {
  BUILT_IN_SMS_CATEGORY_TREE,
  buildSmsAiResponseSchema,
  buildSmsAiStableSystemPrompt,
  DEFAULT_SMS_CURRENCIES,
} from "../supabase/functions/_shared/sms-ai/sms-ai-prompt";

const CONSERVATIVE_BYTES_PER_TOKEN = 3;
const DEFAULT_GEMINI_CALIBRATION_MODEL = "gemini-2.5-flash-lite";

export interface PromptVariant {
  readonly name: string;
  readonly fixedInstructions: string;
  readonly categoryTree: string;
  readonly schema: unknown;
}

export interface PromptCorpusCase {
  readonly id: string;
  readonly candidatePayload: string;
  readonly expectedOutput: unknown;
  readonly currentOutput?: unknown;
  readonly candidateOutput?: unknown;
}

export interface PromptTokenComponentReport {
  readonly bytes: number;
  readonly characters: number;
  readonly tokens: number;
}

export interface PromptTokenReport {
  readonly promptName: string;
  readonly estimator: "local-conservative" | "selected-model-count-tokens";
  readonly model?: string;
  readonly fixedInstructions: PromptTokenComponentReport;
  readonly categoryTree: PromptTokenComponentReport;
  readonly schema: PromptTokenComponentReport;
  readonly fixtureCorpus: PromptTokenComponentReport & {
    readonly fixtureCount: number;
  };
  readonly totalBytes: number;
  readonly totalTokens: number;
}

export interface PromptTokenEstimateInput {
  readonly prompt: PromptVariant;
  readonly corpus: readonly PromptCorpusCase[];
}

export interface SelectedModelCountTokensInput {
  readonly model: string;
  readonly text: string;
}

export interface SelectedModelTokenCounter {
  readonly countTokens: (
    input: SelectedModelCountTokensInput
  ) => Promise<number>;
}

export interface PromptCalibrationInput extends PromptTokenEstimateInput {
  readonly model: string;
  readonly enabled: boolean;
  readonly countTokens: SelectedModelTokenCounter["countTokens"];
}

export interface PromptParityFailure {
  readonly fixtureId: string;
  readonly variant: "current" | "candidate";
}

export interface PromptParityReport {
  readonly status: "evaluated" | "not_evaluated";
  readonly currentFailures: readonly PromptParityFailure[];
  readonly candidateFailures: readonly PromptParityFailure[];
  readonly regressions: readonly PromptParityFailure[];
}

export interface PromptComparisonInput {
  readonly current: PromptVariant;
  readonly candidate: PromptVariant;
  readonly corpus: readonly PromptCorpusCase[];
}

export interface PromptComparisonReport {
  readonly current: PromptTokenReport;
  readonly candidate: PromptTokenReport;
  readonly tokenReduction: number;
  readonly parity: PromptParityReport;
  readonly recommendation: "recommend" | "do_not_recommend";
}

export interface PromptFileEvaluationOptions {
  readonly rootDirectory?: string;
  readonly candidatePath?: string;
  readonly currentPath?: string;
  readonly corpusPath?: string;
  readonly calibrate?: boolean;
  readonly model?: string;
  readonly countTokens?: SelectedModelTokenCounter["countTokens"];
  readonly apiKey?: string;
}

export interface PromptFileEvaluationResult {
  readonly mode: "local" | "selected-model-count-tokens";
  readonly comparison: PromptComparisonReport;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function createComponentReport(
  text: string,
  tokens: number
): PromptTokenComponentReport {
  return {
    bytes: getUtf8ByteLength(text),
    characters: text.length,
    tokens,
  };
}

function estimateLocalTokens(text: string): number {
  const bytes = getUtf8ByteLength(text);
  return bytes === 0 ? 0 : Math.ceil(bytes / CONSERVATIVE_BYTES_PER_TOKEN);
}

function getFixtureCorpusText(corpus: readonly PromptCorpusCase[]): string {
  return corpus.map(({ candidatePayload }) => candidatePayload).join("\n\n");
}

function createPromptTokenReport(
  prompt: PromptVariant,
  corpus: readonly PromptCorpusCase[],
  estimate: (text: string) => number,
  estimator: PromptTokenReport["estimator"],
  model?: string
): PromptTokenReport {
  const fixedInstructions = prompt.fixedInstructions;
  const categoryTree = prompt.categoryTree;
  const schema = stableSerialize(prompt.schema);
  const fixtureCorpus = getFixtureCorpusText(corpus);
  const fixedReport = createComponentReport(
    fixedInstructions,
    estimate(fixedInstructions)
  );
  const categoryReport = createComponentReport(
    categoryTree,
    estimate(categoryTree)
  );
  const schemaReport = createComponentReport(schema, estimate(schema));
  const fixtureReport = createComponentReport(
    fixtureCorpus,
    estimate(fixtureCorpus)
  );
  const totalTokens =
    fixedReport.tokens +
    categoryReport.tokens +
    schemaReport.tokens +
    fixtureReport.tokens;

  return {
    promptName: prompt.name,
    estimator,
    ...(model === undefined ? {} : { model }),
    fixedInstructions: fixedReport,
    categoryTree: categoryReport,
    schema: schemaReport,
    fixtureCorpus: { ...fixtureReport, fixtureCount: corpus.length },
    totalBytes:
      fixedReport.bytes +
      categoryReport.bytes +
      schemaReport.bytes +
      fixtureReport.bytes,
    totalTokens,
  };
}

export function estimatePromptTokenReport(
  input: PromptTokenEstimateInput
): PromptTokenReport {
  return createPromptTokenReport(
    input.prompt,
    input.corpus,
    estimateLocalTokens,
    "local-conservative"
  );
}

export async function calibratePromptTokenReport(
  input: PromptCalibrationInput
): Promise<PromptTokenReport> {
  if (!input.enabled) {
    throw new Error("selected_model_calibration_requires_explicit_opt_in");
  }
  if (input.model.trim().length === 0) {
    throw new Error("selected_model_calibration_requires_model");
  }

  const schema = stableSerialize(input.prompt.schema);
  const fixtureCorpus = getFixtureCorpusText(input.corpus);
  const texts = [
    input.prompt.fixedInstructions,
    input.prompt.categoryTree,
    schema,
    fixtureCorpus,
  ];
  const counts: number[] = [];
  for (const text of texts) {
    const count = await input.countTokens({ model: input.model, text });
    if (!Number.isInteger(count) || count < 0) {
      throw new Error("selected_model_count_tokens_invalid_response");
    }
    counts.push(count);
  }

  let countIndex = 0;

  return createPromptTokenReport(
    input.prompt,
    input.corpus,
    () => {
      const count = counts[countIndex] ?? 0;
      countIndex += 1;
      return count;
    },
    "selected-model-count-tokens",
    input.model
  );
}

function hasOwn(value: object, key: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(value, key) &&
    (value as Record<string, unknown>)[key] !== undefined
  );
}

function findParityFailures(
  corpus: readonly PromptCorpusCase[],
  variant: "current" | "candidate"
): readonly PromptParityFailure[] {
  return corpus.flatMap((item) => {
    const output =
      variant === "current" ? item.currentOutput : item.candidateOutput;
    if (
      !hasOwn(item, variant === "current" ? "currentOutput" : "candidateOutput")
    ) {
      return [];
    }
    return stableSerialize(output) === stableSerialize(item.expectedOutput)
      ? []
      : [{ fixtureId: item.id, variant }];
  });
}

function createParityReport(
  corpus: readonly PromptCorpusCase[]
): PromptParityReport {
  const hasCompleteSnapshots = corpus.every(
    (item) => hasOwn(item, "currentOutput") && hasOwn(item, "candidateOutput")
  );
  const currentFailures = findParityFailures(corpus, "current");
  const candidateFailures = findParityFailures(corpus, "candidate");
  const currentFailureIds = new Set(
    currentFailures.map(({ fixtureId }) => fixtureId)
  );
  const regressions = candidateFailures.filter(
    ({ fixtureId }) => !currentFailureIds.has(fixtureId)
  );

  return {
    status: hasCompleteSnapshots ? "evaluated" : "not_evaluated",
    currentFailures,
    candidateFailures,
    regressions,
  };
}

export function comparePromptVariants(
  input: PromptComparisonInput
): PromptComparisonReport {
  const current = estimatePromptTokenReport({
    prompt: input.current,
    corpus: input.corpus,
  });
  const candidate = estimatePromptTokenReport({
    prompt: input.candidate,
    corpus: input.corpus,
  });
  const parity = createParityReport(input.corpus);
  const tokenReduction = current.totalTokens - candidate.totalTokens;
  const canRecommend =
    parity.status === "evaluated" &&
    parity.currentFailures.length === 0 &&
    parity.candidateFailures.length === 0 &&
    parity.regressions.length === 0 &&
    tokenReduction > 0;

  return {
    current,
    candidate,
    tokenReduction,
    parity,
    recommendation: canRecommend ? "recommend" : "do_not_recommend",
  };
}

export function loadCurrentPromptVariant(): PromptVariant {
  const categoryTree = BUILT_IN_SMS_CATEGORY_TREE.trim();
  const categorySection = `BUILT-IN CATEGORY TREE:\n${categoryTree}`;
  const systemPrompt = buildSmsAiStableSystemPrompt(DEFAULT_SMS_CURRENCIES);
  if (!systemPrompt.includes(categorySection)) {
    throw new Error("production_sms_prompt_not_extractable");
  }
  return {
    name: "current",
    fixedInstructions: systemPrompt.replace(categorySection, ""),
    categoryTree,
    schema: buildSmsAiResponseSchema(DEFAULT_SMS_CURRENCIES),
  };
}

function toPromptCorpusCase(fixture: LocalSmsFixture): PromptCorpusCase {
  const expectedOutput = fixture.expectedOutcome
    ? { transactions: [{ messageId: fixture.id, ...fixture.expectedOutcome }] }
    : { transactions: [] };
  return {
    id: fixture.id,
    candidatePayload: `--- MESSAGE ID: ${fixture.id} ---\nSender: ${fixture.sender}\nDate: ${new Date(fixture.receivedAtMs).toISOString()}\nBody: ${fixture.body}`,
    expectedOutput,
  };
}

export function createDefaultPromptCorpus(): readonly PromptCorpusCase[] {
  return LOCAL_SMS_FIXTURE_CORPUS.map(toPromptCorpusCase);
}

function parsePromptVariant(value: unknown, sourcePath: string): PromptVariant {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    typeof value.fixedInstructions !== "string" ||
    typeof value.categoryTree !== "string" ||
    !("schema" in value)
  ) {
    throw new Error(`prompt_variant_invalid:${sourcePath}`);
  }
  return {
    name: value.name,
    fixedInstructions: value.fixedInstructions,
    categoryTree: value.categoryTree,
    schema: value.schema,
  };
}

function parseCorpus(
  value: unknown,
  sourcePath: string
): readonly PromptCorpusCase[] {
  const entries =
    isRecord(value) && Array.isArray(value.corpus) ? value.corpus : value;
  if (!Array.isArray(entries))
    throw new Error(`prompt_corpus_invalid:${sourcePath}`);
  return entries.map((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      typeof entry.candidatePayload !== "string" ||
      !("expectedOutput" in entry)
    ) {
      throw new Error(`prompt_corpus_case_invalid:${sourcePath}:${index}`);
    }
    return {
      id: entry.id,
      candidatePayload: entry.candidatePayload,
      expectedOutput: entry.expectedOutput,
      ...(hasOwn(entry, "currentOutput")
        ? { currentOutput: entry.currentOutput }
        : {}),
      ...(hasOwn(entry, "candidateOutput")
        ? { candidateOutput: entry.candidateOutput }
        : {}),
    };
  });
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
}

function createGeminiCountTokensCounter(
  apiKey: string
): SelectedModelTokenCounter["countTokens"] {
  return async ({ model, text }): Promise<number> => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:countTokens?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        generateContentRequest: {
          contents: [{ role: "user", parts: [{ text }] }],
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`selected_model_count_tokens_failed:${response.status}`);
    }
    const payload = (await response.json()) as unknown;
    if (
      !isRecord(payload) ||
      typeof payload.totalTokens !== "number" ||
      !Number.isInteger(payload.totalTokens) ||
      payload.totalTokens < 0
    ) {
      throw new Error("selected_model_count_tokens_invalid_response");
    }
    return payload.totalTokens;
  };
}

export async function evaluatePromptFiles(
  options: PromptFileEvaluationOptions = {}
): Promise<PromptFileEvaluationResult> {
  const rootDirectory = options.rootDirectory ?? process.cwd();
  const current = options.currentPath
    ? parsePromptVariant(
        readJsonFile(path.resolve(rootDirectory, options.currentPath)),
        options.currentPath
      )
    : loadCurrentPromptVariant();
  if (!options.candidatePath) {
    throw new Error("prompt_candidate_path_required");
  }
  const candidate = parsePromptVariant(
    readJsonFile(path.resolve(rootDirectory, options.candidatePath)),
    options.candidatePath
  );
  const corpus = options.corpusPath
    ? parseCorpus(
        readJsonFile(path.resolve(rootDirectory, options.corpusPath)),
        options.corpusPath
      )
    : createDefaultPromptCorpus();

  if (options.calibrate === true) {
    const model = options.model ?? DEFAULT_GEMINI_CALIBRATION_MODEL;
    if (!model.trim()) throw new Error("selected_model_calibration_model_required");
    let counter = options.countTokens;
    if (!counter) {
      if (!model.startsWith("gemini-")) {
        throw new Error("selected_model_calibration_unsupported_model");
      }
      const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("selected_model_calibration_api_key_required");
      counter = createGeminiCountTokensCounter(apiKey);
    }
    const [currentReport, candidateReport] = await Promise.all([
      calibratePromptTokenReport({
        prompt: current,
        corpus,
        model,
        enabled: true,
        countTokens: counter,
      }),
      calibratePromptTokenReport({
        prompt: candidate,
        corpus,
        model,
        enabled: true,
        countTokens: counter,
      }),
    ]);
    const localComparison = comparePromptVariants({
      current,
      candidate,
      corpus,
    });
    const tokenReduction =
      currentReport.totalTokens - candidateReport.totalTokens;
    const recommendation =
      localComparison.parity.status === "evaluated" &&
      localComparison.parity.currentFailures.length === 0 &&
      localComparison.parity.candidateFailures.length === 0 &&
      localComparison.parity.regressions.length === 0 &&
      tokenReduction > 0
        ? "recommend"
        : "do_not_recommend";
    return {
      mode: "selected-model-count-tokens",
      comparison: {
        ...localComparison,
        current: currentReport,
        candidate: candidateReport,
        tokenReduction,
        recommendation,
      },
    };
  }

  return {
    mode: "local",
    comparison: comparePromptVariants({ current, candidate, corpus }),
  };
}

function parseCliArgs(args: readonly string[]): PromptFileEvaluationOptions {
  let candidatePath: string | undefined;
  let currentPath: string | undefined;
  let corpusPath: string | undefined;
  let model: string | undefined;
  let calibrate = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = args[index + 1];
    if (argument === "--candidate" && next) {
      candidatePath = next;
      index += 1;
    } else if (argument === "--current" && next) {
      currentPath = next;
      index += 1;
    } else if (argument === "--corpus" && next) {
      corpusPath = next;
      index += 1;
    } else if (argument === "--model" && next) {
      model = next;
      index += 1;
    } else if (argument === "--calibrate") {
      calibrate = true;
    } else {
      throw new Error(`unknown_or_incomplete_argument:${argument}`);
    }
  }
  return { candidatePath, currentPath, corpusPath, model, calibrate };
}

async function main(): Promise<void> {
  const result = await evaluatePromptFiles(parseCliArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.comparison.recommendation !== "recommend") process.exitCode = 2;
}

if (process.argv[1]?.endsWith("evaluate-sms-parser-prompt.ts") === true) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
