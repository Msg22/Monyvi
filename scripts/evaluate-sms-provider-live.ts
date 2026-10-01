import { readFileSync, writeFileSync } from "node:fs";

import { parseRawObservationImport } from "./sms-provider-evaluation/raw-observation.ts";
import {
  attachRawObservationsToEvaluationReport,
} from "./sms-provider-evaluation/scorer.ts";
import { runSmsProviderEvaluation } from "./sms-provider-evaluation/runner.ts";
import {
  EvaluationReportImportSchema,
  STAGING_PARSE_SMS_ENDPOINT,
  STAGING_PROJECT_REF,
  type EvaluationReport,
  type EvaluationRunnerDependencies,
  type ParsedCliOptions,
} from "./sms-provider-evaluation/types.ts";

export interface SmsProviderEvaluationCliDependencies
  extends EvaluationRunnerDependencies {
  readonly writeStdout: (value: string) => void;
  readonly writeStderr: (value: string) => void;
  readonly environment: Readonly<Record<string, string | undefined>>;
}

const DEFAULT_DRY_MAX_CASES = Number.MAX_SAFE_INTEGER;
const DEFAULT_DRY_MAX_REQUESTS = Number.MAX_SAFE_INTEGER;

function readPositiveInteger(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("sms_provider_evaluation_invalid_limit");
  }
  return parsed;
}

function readAnchorMs(value: string | undefined): number {
  if (value === undefined) return Date.now();
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("sms_provider_evaluation_invalid_run");
  }
  return parsed;
}

function defaultRunId(anchorMs: number): string {
  return "sms-eval-" + new Date(anchorMs).toISOString().replace(/[:.]/g, "-");
}

function readJsonFile(path: string): unknown {
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text) as unknown;
}

function parseStoredEvaluationReport(value: unknown): EvaluationReport {
  EvaluationReportImportSchema.parse(value);
  return value as EvaluationReport;
}

function writeReport(
  report: EvaluationReport,
  outputPath: string | undefined,
  writeStdout: (value: string) => void
): void {
  const serialized = JSON.stringify(report, null, 2) + "\n";
  if (outputPath !== undefined) {
    writeFileSync(outputPath, serialized, "utf8");
  }
  writeStdout(serialized);
}

export function parseSmsProviderEvaluationCliArgs(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>
): ParsedCliOptions {
  let mode: "dry-run" | "live" = "dry-run";
  let runId: string | undefined;
  let anchorValue: string | undefined;
  let maxCasesValue: string | undefined;
  let maxRequestsValue: string | undefined;
  let endpoint: string | undefined;
  let projectRef: string | undefined;
  let rawObservationPath: string | undefined;
  let finalReportPath: string | undefined;
  let outputPath: string | undefined;
  let sawMaxCases = false;
  let sawMaxRequests = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = args[index + 1];

    if (argument === "--live") {
      mode = "live";
      continue;
    }
    if (
      argument === "--access-token" ||
      argument === "--public-api-key" ||
      argument === "--apikey" ||
      argument === "--authorization"
    ) {
      throw new Error("sms_provider_evaluation_unknown_or_forbidden_argument");
    }

    if (argument === "--run-id" && next !== undefined) {
      runId = next;
    } else if (argument === "--anchor-ms" && next !== undefined) {
      anchorValue = next;
    } else if (argument === "--max-cases" && next !== undefined) {
      maxCasesValue = next;
      sawMaxCases = true;
    } else if (argument === "--max-requests" && next !== undefined) {
      maxRequestsValue = next;
      sawMaxRequests = true;
    } else if (argument === "--endpoint" && next !== undefined) {
      endpoint = next;
    } else if (argument === "--project-ref" && next !== undefined) {
      projectRef = next;
    } else if (argument === "--raw-observations" && next !== undefined) {
      rawObservationPath = next;
    } else if (argument === "--final-report" && next !== undefined) {
      finalReportPath = next;
    } else if (argument === "--output" && next !== undefined) {
      outputPath = next;
    } else {
      throw new Error("sms_provider_evaluation_unknown_or_forbidden_argument");
    }

    index++;
  }

  if (mode === "live" && (!sawMaxCases || !sawMaxRequests)) {
    throw new Error("sms_provider_evaluation_invalid_limit");
  }

  const anchorMs = readAnchorMs(anchorValue);
  const maxCases =
    maxCasesValue === undefined
      ? DEFAULT_DRY_MAX_CASES
      : readPositiveInteger(maxCasesValue);
  const maxRequests =
    maxRequestsValue === undefined
      ? DEFAULT_DRY_MAX_REQUESTS
      : readPositiveInteger(maxRequestsValue);

  return {
    mode,
    runId: runId ?? defaultRunId(anchorMs),
    anchorMs,
    maxCases,
    maxRequests,
    endpoint:
      endpoint ?? (mode === "live" ? STAGING_PARSE_SMS_ENDPOINT : undefined),
    projectRef:
      projectRef ?? (mode === "live" ? STAGING_PROJECT_REF : undefined),
    accessToken:
      mode === "live"
        ? environment.SMS_PROVIDER_EVAL_ACCESS_TOKEN
        : undefined,
    publicApiKey:
      mode === "live"
        ? environment.SMS_PROVIDER_EVAL_PUBLIC_API_KEY
        : undefined,
    ...(rawObservationPath === undefined ? {} : { rawObservationPath }),
    ...(finalReportPath === undefined ? {} : { finalReportPath }),
    ...(outputPath === undefined ? {} : { outputPath }),
  };
}

function attachRawEvidenceOffline(
  options: ParsedCliOptions
): EvaluationReport {
  if (
    options.finalReportPath === undefined ||
    options.rawObservationPath === undefined
  ) {
    throw new Error("sms_provider_evaluation_raw_offline_inputs_required");
  }

  const report = parseStoredEvaluationReport(
    readJsonFile(options.finalReportPath)
  );
  const expectedBatchInputs = new Map(
    report.rawAttributionManifest.map((entry) => [
      entry.batchId,
      {
        caseIds: entry.caseIds,
        inputIdentity: entry.inputIdentity,
      },
    ])
  );
  const rawObservations = parseRawObservationImport({
    value: readJsonFile(options.rawObservationPath),
    runId: report.runId,
    expectedBatchInputs,
    cases: report.cases.map(({ caseId }) => ({ caseId })),
  });
  return attachRawObservationsToEvaluationReport(report, rawObservations);
}

export async function runSmsProviderEvaluationCli(
  args: readonly string[],
  dependencies: SmsProviderEvaluationCliDependencies
): Promise<EvaluationReport> {
  const options = parseSmsProviderEvaluationCliArgs(
    args,
    dependencies.environment
  );

  let report: EvaluationReport;
  if (options.finalReportPath !== undefined) {
    report = attachRawEvidenceOffline(options);
  } else {
    const rawObservationValue =
      options.rawObservationPath === undefined
        ? undefined
        : readJsonFile(options.rawObservationPath);
    report = await runSmsProviderEvaluation(
      {
        mode: options.mode,
        runId: options.runId,
        anchorMs: options.anchorMs,
        maxCases: options.maxCases,
        maxRequests: options.maxRequests,
        endpoint: options.endpoint,
        projectRef: options.projectRef,
        accessToken: options.accessToken,
        publicApiKey: options.publicApiKey,
        signal: options.signal,
        ...(rawObservationValue === undefined
          ? {}
          : { rawObservationValue }),
      },
      dependencies
    );
  }

  writeReport(report, options.outputPath, dependencies.writeStdout);
  return report;
}

async function main(): Promise<void> {
  await runSmsProviderEvaluationCli(process.argv.slice(2), {
    fetch,
    now: Date.now,
    writeStdout: (value: string): void => {
      process.stdout.write(value);
    },
    writeStderr: (value: string): void => {
      process.stderr.write(value);
    },
    environment: process.env,
  });
}

if (process.argv[1]?.endsWith("evaluate-sms-provider-live.ts") === true) {
  void main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "sms_provider_evaluation_failed";
    process.stderr.write(message + "\n");
    process.exitCode = 1;
  });
}
