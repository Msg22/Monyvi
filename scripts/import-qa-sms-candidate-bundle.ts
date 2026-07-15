import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { QaCandidateArtifact } from "../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-pattern-types";
import {
  assertQaSmsStagingPath,
  importQaCandidateBundle,
  mergeQaCoverageManifest,
  validateQaCoverageManifest,
} from "../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-candidate-importer";

interface ImportCommandOptions {
  readonly inputPath: string;
  readonly isDryRun: boolean;
  readonly acknowledgeNewEvidenceDomain: boolean;
}

interface ImportCommandSummary {
  readonly mode: "dry-run" | "import";
  readonly importedCandidateCount: number;
  readonly skippedDuplicateCandidateCount: number;
  readonly totalCandidateCount: number;
  readonly familyCount: number;
  readonly requiresManualDuplicateReview: boolean;
}

interface ImportCommandDependencies {
  readonly cwd: () => string;
  readonly readJson: (filePath: string) => Promise<unknown>;
  readonly readExistingCandidates: (
    catalogDirectory: string
  ) => Promise<readonly QaCandidateArtifact[]>;
  readonly readExistingCoverageManifest: (
    manifestPath: string
  ) => Promise<unknown>;
  readonly writeImportAtomically: (
    writes: readonly ImportWrite[]
  ) => Promise<void>;
  readonly writeSummary: (summary: string) => void;
}

interface ImportWrite {
  readonly filePath: string;
  readonly value: unknown;
  readonly allowExistingTarget?: boolean;
}

interface PreparedImportWrite extends ImportWrite {
  readonly temporaryPath: string;
  readonly backupPath: string;
}

type ImportFileSystem = Pick<
  typeof fs,
  "access" | "mkdir" | "writeFile" | "rename" | "rm"
>;

function parseImportCommandOptions(
  args: readonly string[]
): ImportCommandOptions {
  const allowedOptions = new Set([
    "--dry-run",
    "--acknowledge-new-evidence-domain",
  ]);
  const unknownOption = args.find(
    (argument) => argument.startsWith("--") && !allowedOptions.has(argument)
  );
  if (unknownOption !== undefined) {
    throw new Error(`unknown_import_option:${unknownOption}`);
  }

  const inputPaths = args.filter((argument) => !argument.startsWith("--"));
  if (inputPaths.length === 0) throw new Error("input_path_required");
  if (inputPaths.length !== 1) throw new Error("single_input_path_required");

  return {
    inputPath: inputPaths[0],
    isDryRun: args.includes("--dry-run"),
    acknowledgeNewEvidenceDomain: args.includes(
      "--acknowledge-new-evidence-domain"
    ),
  };
}

function safeExportFileName(exportId: string): string {
  return `qnb-candidates-${exportId.replace(/[^a-zA-Z0-9_-]/g, "-")}.json`;
}

async function runImportQaSmsCandidateBundle(
  args: readonly string[],
  dependencies: ImportCommandDependencies
): Promise<ImportCommandSummary> {
  const options = parseImportCommandOptions(args);
  const root = dependencies.cwd();
  const stagingRoot = path.resolve(root, ".local/qa-sms-intake");
  const catalogDirectory = path.resolve(
    root,
    "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb"
  );
  const coverageManifestPath = path.resolve(
    root,
    "packages/logic/src/parsers/qa-sms-pattern-candidates/coverage-manifest.json"
  );
  const inputPath = path.resolve(root, options.inputPath);
  assertQaSmsStagingPath(inputPath, stagingRoot);
  const [bundle, existingCandidates, existingCoverageManifest] =
    await Promise.all([
      dependencies.readJson(inputPath),
      dependencies.readExistingCandidates(catalogDirectory),
      dependencies.readExistingCoverageManifest(coverageManifestPath),
    ]);
  const result = importQaCandidateBundle({
    inputPath,
    stagingRoot,
    bundle,
    existingCandidates,
    acknowledgeNewEvidenceDomain: options.acknowledgeNewEvidenceDomain,
  });
  const validatedManifest = validateQaCoverageManifest(
    existingCoverageManifest,
    existingCandidates,
    false
  );
  const mergedManifest = validateQaCoverageManifest(
    mergeQaCoverageManifest(
      validatedManifest,
      result.coverageDeclarations,
      result.candidates
    ),
    result.candidates,
    true
  );

  if (!options.isDryRun) {
    const outputPath = path.join(
      catalogDirectory,
      safeExportFileName(result.bundle.exportId)
    );
    await dependencies.writeImportAtomically([
      ...(result.importedCandidates.length > 0
        ? [
            {
              filePath: outputPath,
              value: {
                schemaVersion: result.bundle.schemaVersion,
                sourceExportId: result.bundle.exportId,
                evidenceDomainStatus: result.bundle.evidenceDomainStatus,
                candidates: result.importedCandidates,
                coverageDeclarations: result.coverageDeclarations,
              },
            },
          ]
        : []),
      {
        filePath: coverageManifestPath,
        value: mergedManifest,
        allowExistingTarget: true,
      },
    ]);
  }
  const summary: ImportCommandSummary = {
    mode: options.isDryRun ? "dry-run" : "import",
    importedCandidateCount: result.summary.importedCandidateCount,
    skippedDuplicateCandidateCount:
      result.summary.skippedDuplicateCandidateCount,
    totalCandidateCount: result.summary.totalCandidateCount,
    familyCount: result.summary.familyCount,
    requiresManualDuplicateReview: result.summary.requiresManualDuplicateReview,
  };
  dependencies.writeSummary(JSON.stringify(summary));
  return summary;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

async function readExistingCandidates(
  catalogDirectory: string
): Promise<readonly QaCandidateArtifact[]> {
  const entries = await fs.readdir(catalogDirectory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && isCandidateCatalogFileName(entry.name))
    .map((entry) => path.join(catalogDirectory, entry.name));
  const records = await Promise.all(files.map(readJson));
  return records.flatMap(parseCandidateCatalogRecord);
}

export function isCandidateCatalogFileName(fileName: string): boolean {
  return /^qnb-candidates-[a-z0-9_-]+\.json$/i.test(fileName);
}

export function parseCandidateCatalogRecord(
  record: unknown
): readonly QaCandidateArtifact[] {
  if (
    typeof record !== "object" ||
    record === null ||
    !("candidates" in record) ||
    !Array.isArray(record.candidates)
  ) {
    throw new Error("existing_candidate_catalog_invalid");
  }
  return record.candidates as readonly QaCandidateArtifact[];
}

async function pathExists(
  filePath: string,
  fileSystem: ImportFileSystem
): Promise<boolean> {
  try {
    await fileSystem.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeIfPresent(
  filePath: string,
  fileSystem: ImportFileSystem
): Promise<void> {
  await fileSystem.rm(filePath, { force: true });
}

async function rollbackPreparedWrites(
  writes: readonly PreparedImportWrite[],
  fileSystem: ImportFileSystem
): Promise<readonly unknown[]> {
  let errors: readonly unknown[] = [];
  for (const write of [...writes].reverse()) {
    try {
      const hasBackup = await pathExists(write.backupPath, fileSystem);
      const hasTemporary = await pathExists(write.temporaryPath, fileSystem);
      const hasTarget = await pathExists(write.filePath, fileSystem);
      if (hasBackup) {
        if (hasTarget) await removeIfPresent(write.filePath, fileSystem);
        await fileSystem.rename(write.backupPath, write.filePath);
      } else if (!hasTemporary && hasTarget) {
        await removeIfPresent(write.filePath, fileSystem);
      }
      await removeIfPresent(write.temporaryPath, fileSystem);
    } catch (error: unknown) {
      errors = [...errors, error];
    }
  }
  return errors;
}

function prepareImportWritePaths(
  writes: readonly ImportWrite[],
  transactionId: string
): readonly PreparedImportWrite[] {
  return writes.map((write) => ({
    ...write,
    temporaryPath: `${write.filePath}.${transactionId}.tmp`,
    backupPath: `${write.filePath}.${transactionId}.bak`,
  }));
}

async function assertImportWritePathsAvailable(
  writes: readonly PreparedImportWrite[],
  fileSystem: ImportFileSystem
): Promise<void> {
  for (const write of writes) {
    if (
      !write.allowExistingTarget &&
      (await pathExists(write.filePath, fileSystem))
    ) {
      throw new Error("import_output_collision");
    }
    if (
      (await pathExists(write.temporaryPath, fileSystem)) ||
      (await pathExists(write.backupPath, fileSystem))
    ) {
      throw new Error("import_atomic_path_collision");
    }
  }
}

async function stageImportWrites(
  writes: readonly PreparedImportWrite[],
  fileSystem: ImportFileSystem
): Promise<void> {
  for (const write of writes) {
    await fileSystem.mkdir(path.dirname(write.filePath), { recursive: true });
    await fileSystem.writeFile(
      write.temporaryPath,
      `${JSON.stringify(write.value, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" }
    );
  }
}

async function commitImportWrites(
  writes: readonly PreparedImportWrite[],
  fileSystem: ImportFileSystem
): Promise<void> {
  for (const write of writes) {
    if (await pathExists(write.filePath, fileSystem)) {
      if (!write.allowExistingTarget) {
        throw new Error("import_output_collision");
      }
      await fileSystem.rename(write.filePath, write.backupPath);
    }
    await fileSystem.rename(write.temporaryPath, write.filePath);
  }
}

async function writeImportAtomically(
  writes: readonly ImportWrite[],
  transactionId = `${process.pid}-${Date.now()}`,
  fileSystem: ImportFileSystem = fs
): Promise<void> {
  const prepared = prepareImportWritePaths(writes, transactionId);
  await assertImportWritePathsAvailable(prepared, fileSystem);
  try {
    await stageImportWrites(prepared, fileSystem);
    await commitImportWrites(prepared, fileSystem);
  } catch (error: unknown) {
    const rollbackErrors = await rollbackPreparedWrites(prepared, fileSystem);
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "import_atomic_rollback_failed"
      );
    }
    throw error;
  }

  await Promise.all(
    prepared.map(({ backupPath }) => removeIfPresent(backupPath, fileSystem))
  );
}

export function createImportCommandDependencies(
  rootDirectory: string = process.cwd(),
  writeSummary: (summary: string) => void = (summary) =>
    process.stdout.write(`${summary}\n`)
): ImportCommandDependencies {
  return {
    cwd: () => rootDirectory,
    readJson,
    readExistingCandidates,
    readExistingCoverageManifest: readJson,
    writeImportAtomically,
    writeSummary,
  };
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  runImportQaSmsCandidateBundle(
    process.argv.slice(2),
    createImportCommandDependencies()
  ).catch((error: unknown) => {
    const code =
      error instanceof Error ? error.message : "candidate_import_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}

export {
  parseImportCommandOptions,
  runImportQaSmsCandidateBundle,
  safeExportFileName,
  writeImportAtomically,
};
export type {
  ImportCommandDependencies,
  ImportCommandOptions,
  ImportCommandSummary,
  ImportFileSystem,
  ImportWrite,
};
