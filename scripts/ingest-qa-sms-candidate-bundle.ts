import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { qaCandidateBundleSchema } from "../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-artifact-schema";
import { serializeQaCandidateBundleIntegrityPayload } from "../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-bundle-builder";
import type { QaCandidateBundle } from "../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-pattern-types";
import { validateQaSmsCandidatePrivacy } from "../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-privacy-validator";
import { runQaSmsPatternPrivacyCheck } from "./check-qa-sms-pattern-privacy";
import {
  createImportCommandDependencies,
  runImportQaSmsCandidateBundle,
  type ImportCommandSummary,
} from "./import-qa-sms-candidate-bundle";

interface IngestCommandOptions {
  readonly inputPath: string;
  readonly acknowledgeNewEvidenceDomain: boolean;
}

interface StageBundleInput {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly contents: string;
}

interface IngestCommandDependencies {
  readonly cwd: () => string;
  readonly readText: (filePath: string) => Promise<string>;
  readonly validateBundle: (contents: string) => Promise<QaCandidateBundle>;
  readonly stageBundle: (input: StageBundleInput) => Promise<void>;
  readonly runImport: (
    args: readonly string[]
  ) => Promise<ImportCommandSummary>;
  readonly runVerification: () => Promise<void>;
  readonly writeSummary: (summary: string) => void;
}

export function parseIngestCommandOptions(
  args: readonly string[]
): IngestCommandOptions {
  const inputPaths = args.filter((argument) => !argument.startsWith("--"));
  if (inputPaths.length === 0) throw new Error("input_path_required");
  if (inputPaths.length !== 1) throw new Error("one_input_path_required");
  return {
    inputPath: inputPaths[0],
    acknowledgeNewEvidenceDomain: args.includes(
      "--acknowledge-new-evidence-domain"
    ),
  };
}

function safeStagingFileName(exportId: string): string {
  return `qa-sms-candidates-${exportId.replace(/[^a-zA-Z0-9_-]/g, "-")}.json`;
}

async function validateBundle(contents: string): Promise<QaCandidateBundle> {
  let rawBundle: unknown;
  try {
    rawBundle = JSON.parse(contents.replace(/^\uFEFF/, "")) as unknown;
  } catch {
    throw new Error("bundle_json_invalid");
  }

  const parsed = qaCandidateBundleSchema.safeParse(rawBundle);
  if (!parsed.success) throw new Error("bundle_schema_invalid");
  if (
    parsed.data.candidates.some(
      (candidate) => !validateQaSmsCandidatePrivacy(candidate).isValid
    )
  ) {
    throw new Error("bundle_privacy_invalid");
  }
  const contentDigest = createHash("sha256")
    .update(serializeQaCandidateBundleIntegrityPayload(parsed.data), "utf8")
    .digest("hex");
  if (contentDigest !== parsed.data.integrity.contentDigest) {
    throw new Error("bundle_integrity_invalid");
  }
  return parsed.data;
}

async function stageBundle(input: StageBundleInput): Promise<void> {
  await fs.mkdir(path.dirname(input.targetPath), { recursive: true });
  try {
    await fs.writeFile(input.targetPath, input.contents, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error: unknown) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "EEXIST"
    ) {
      throw error;
    }
    const existing = await fs.readFile(input.targetPath, "utf8");
    if (existing !== input.contents)
      throw new Error("staging_output_collision");
  }
}

export async function runIngestQaSmsCandidateBundle(
  args: readonly string[],
  dependencies: IngestCommandDependencies
): Promise<void> {
  const options = parseIngestCommandOptions(args);
  const rootDirectory = dependencies.cwd();
  const sourcePath = path.resolve(rootDirectory, options.inputPath);
  const contents = await dependencies.readText(sourcePath);
  const bundle = await dependencies.validateBundle(contents);
  const targetPath = path.resolve(
    rootDirectory,
    ".local/qa-sms-intake",
    safeStagingFileName(bundle.exportId)
  );

  await dependencies.stageBundle({ sourcePath, targetPath, contents });
  await dependencies.runVerification();

  const relativeTargetPath = path
    .relative(rootDirectory, targetPath)
    .replaceAll("\\", "/");
  const commonArgs = [
    relativeTargetPath,
    ...(options.acknowledgeNewEvidenceDomain
      ? ["--acknowledge-new-evidence-domain"]
      : []),
  ];
  await dependencies.runImport([...commonArgs, "--dry-run"]);
  const importSummary = await dependencies.runImport(commonArgs);
  dependencies.writeSummary(
    JSON.stringify({
      status: "ingested",
      importedCandidateCount: importSummary.importedCandidateCount,
      skippedDuplicateCandidateCount:
        importSummary.skippedDuplicateCandidateCount,
    })
  );
}

function createIngestCommandDependencies(
  rootDirectory: string = process.cwd()
): IngestCommandDependencies {
  return {
    cwd: () => rootDirectory,
    readText: (filePath) => fs.readFile(filePath, "utf8"),
    validateBundle,
    stageBundle,
    runImport: (args) =>
      runImportQaSmsCandidateBundle(
        args,
        createImportCommandDependencies(rootDirectory, () => undefined)
      ),
    runVerification: async () => runQaSmsPatternPrivacyCheck(rootDirectory),
    writeSummary: (summary) => process.stdout.write(`${summary}\n`),
  };
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  runIngestQaSmsCandidateBundle(
    process.argv.slice(2),
    createIngestCommandDependencies()
  ).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    const code = /^[a-z0-9_]+$/.test(message)
      ? message
      : "candidate_ingest_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}

export type {
  IngestCommandDependencies,
  IngestCommandOptions,
  StageBundleInput,
};
