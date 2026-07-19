import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { QaCandidateBundle } from "../../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-pattern-types";
import coverageManifest from "../../packages/logic/src/parsers/qa-sms-pattern-candidates/coverage-manifest.json";
import { serializeQaCandidateBundleIntegrityPayload } from "../../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-bundle-builder";
import {
  isCandidateCatalogFileName,
  parseCandidateCatalogRecord,
  parseImportCommandOptions,
  runImportQaSmsCandidateBundle,
  writeImportAtomically,
} from "../import-qa-sms-candidate-bundle";

const root = path.resolve("qa-command-test-root");
const TEST_CANDIDATE_ID = "qa-candidate-123e4567-e89b-42d3-a456-426614174000";
const EMPTY_COVERAGE_MANIFEST = {
  ...coverageManifest,
  declarations: coverageManifest.declarations.map((declaration) => ({
    ...declaration,
    status: "unavailable_in_qa_dataset" as const,
    candidateIds: [],
  })),
};

function bundle(): QaCandidateBundle {
  const candidate = {
    schemaVersion: 1 as const,
    candidateId: TEST_CANDIDATE_ID,
    evidenceDigest: "a".repeat(64),
    providerId: "qnb-egypt" as const,
    verifiedSenderAlias: "QNB",
    messageFamily: "otp" as const,
    currency: null,
    expectedOutcome: { kind: "rejection" as const, reason: "otp" as const },
    segments: [
      { kind: "fixed" as const, text: "Use code " },
      {
        kind: "placeholder" as const,
        token: "REFERENCE" as const,
        semanticRole: "otp_code",
        wasOperatorCorrected: false,
      },
    ],
    sanitizedShape: "Use code <REFERENCE>",
    sourceType: "qa-real-sms" as const,
    runtimeScope: "candidate" as const,
    autoSelectPolicy: "never" as const,
    authorization: {
      version: 1 as const,
      authorizationClass: "qa_operator_explicit" as const,
      authorizedAt: "2026-07-13T00:00:00.000Z",
      providerScope: "qnb-egypt" as const,
    },
    createdAt: "2026-07-13T01:00:00.000Z",
  };
  const content: Omit<QaCandidateBundle, "integrity"> = {
    schemaVersion: 1,
    exportId: "123e4567-e89b-42d3-a456-426614174000",
    exportedAt: "2026-07-13T02:00:00.000Z",
    evidenceDomainStatus: "stable",
    candidates: [candidate],
    coverageDeclarations: coverageManifest.declarations.map((declaration) =>
      declaration.messageFamily === "otp" && declaration.currency === null
        ? {
            ...declaration,
            status: "candidate_collected" as const,
            candidateIds: [candidate.candidateId],
            recordedAt: "2026-07-13T02:00:00.000Z",
          }
        : {
            ...declaration,
            status: "unavailable_in_qa_dataset" as const,
            candidateIds: [],
            recordedAt: "2026-07-13T02:00:00.000Z",
          }
    ),
  };
  const contentDigest = createHash("sha256")
    .update(serializeQaCandidateBundleIntegrityPayload(content), "utf8")
    .digest("hex");
  return {
    ...content,
    integrity: {
      candidateCount: 1,
      candidateIds: [candidate.candidateId],
      contentDigest,
    },
  };
}

test("parses dry-run and evidence-domain acknowledgement flags", () => {
  assert.deepEqual(
    parseImportCommandOptions([
      ".local/qa-sms-intake/bundle.json",
      "--dry-run",
      "--acknowledge-new-evidence-domain",
    ]),
    {
      inputPath: ".local/qa-sms-intake/bundle.json",
      isDryRun: true,
      acknowledgeNewEvidenceDomain: true,
    }
  );
});

test("rejects unknown import flags before any import can run", () => {
  assert.throws(
    () =>
      parseImportCommandOptions([
        ".local/qa-sms-intake/bundle.json",
        "--dryrun",
      ]),
    /unknown_import_option:--dryrun/
  );
});

test("rejects multiple positional bundle paths", () => {
  assert.throws(
    () =>
      parseImportCommandOptions([
        ".local/qa-sms-intake/bundle.json",
        ".local/qa-sms-intake/other.json",
      ]),
    /single_input_path_required/
  );
});

test("rejects malformed candidate catalog wrappers instead of skipping them", () => {
  assert.throws(
    () => parseCandidateCatalogRecord({ schemaVersion: 1 }),
    /existing_candidate_catalog_invalid/
  );
});

test("loads only generated QNB candidate catalog files", () => {
  assert.equal(
    isCandidateCatalogFileName(
      "qnb-candidates-123e4567-e89b-42d3-a456-426614174000.json"
    ),
    true
  );
  assert.equal(isCandidateCatalogFileName("validation-cases.json"), false);
  assert.equal(isCandidateCatalogFileName("coverage-manifest.json"), false);
});

test("dry-run prints safe counts and performs no write", async () => {
  const summaries: string[] = [];
  let writeCount = 0;
  await runImportQaSmsCandidateBundle(
    [".local/qa-sms-intake/bundle.json", "--dry-run"],
    {
      cwd: () => root,
      readJson: async () => bundle(),
      readExistingCandidates: async () => [],
      readExistingCoverageManifest: async () => EMPTY_COVERAGE_MANIFEST,
      writeImportAtomically: async () => {
        writeCount += 1;
      },
      writeSummary: (summary) => summaries.push(summary),
    }
  );
  assert.equal(writeCount, 0);
  assert.match(summaries[0], /"importedCandidateCount":1/);
  assert.doesNotMatch(summaries[0], /Use code|digest-1|candidate-1/);
});

test("rejects command input outside staging", async () => {
  let readCount = 0;
  await assert.rejects(
    runImportQaSmsCandidateBundle(["outside.json"], {
      cwd: () => root,
      readJson: async () => {
        readCount += 1;
        return bundle();
      },
      readExistingCandidates: async () => {
        readCount += 1;
        return [];
      },
      readExistingCoverageManifest: async () => {
        readCount += 1;
        return EMPTY_COVERAGE_MANIFEST;
      },
      writeImportAtomically: async () => undefined,
      writeSummary: () => undefined,
    }),
    /staging_path_required/
  );
  assert.equal(readCount, 0);
});

test("non-dry-run writes the candidate file and merged coverage manifest", async () => {
  const atomicWrites: Array<
    readonly { readonly filePath: string; readonly value: unknown }[]
  > = [];

  await runImportQaSmsCandidateBundle([".local/qa-sms-intake/bundle.json"], {
    cwd: () => root,
    readJson: async () => bundle(),
    readExistingCandidates: async () => [],
    readExistingCoverageManifest: async () => EMPTY_COVERAGE_MANIFEST,
    writeImportAtomically: async (writes) => {
      atomicWrites.push(writes);
    },
    writeSummary: () => undefined,
  });

  assert.equal(atomicWrites.length, 1);
  const writes = atomicWrites[0];
  assert.equal(writes.length, 2);
  assert.ok(
    writes.some(({ filePath }) => filePath.endsWith("coverage-manifest.json"))
  );
  const manifestWrite = writes.find(({ filePath }) =>
    filePath.endsWith("coverage-manifest.json")
  );
  const declarations = (
    manifestWrite?.value as {
      readonly declarations: ReadonlyArray<{
        readonly messageFamily: string;
        readonly currency: string | null;
        readonly status: string;
        readonly candidateIds: readonly string[];
      }>;
    }
  ).declarations;
  assert.deepEqual(
    declarations.find(
      ({ messageFamily, currency }) =>
        messageFamily === "otp" && currency === null
    ),
    bundle().coverageDeclarations.find(
      ({ messageFamily, currency }) =>
        messageFamily === "otp" && currency === null
    )
  );
});

test("skips an equivalent existing candidate without writing an empty catalog", async () => {
  const source = bundle();
  const incoming = source.candidates[0];
  const existing = {
    ...incoming,
    candidateId: "qa-candidate-223e4567-e89b-42d3-a456-426614174000",
    createdAt: "2026-07-12T01:00:00.000Z",
    authorization: {
      ...incoming.authorization,
      authorizedAt: "2026-07-12T00:00:00.000Z",
    },
  };
  const atomicWrites: Array<
    readonly { readonly filePath: string; readonly value: unknown }[]
  > = [];
  const summaries: string[] = [];

  await runImportQaSmsCandidateBundle([".local/qa-sms-intake/bundle.json"], {
    cwd: () => root,
    readJson: async () => source,
    readExistingCandidates: async () => [existing],
    readExistingCoverageManifest: async () => EMPTY_COVERAGE_MANIFEST,
    writeImportAtomically: async (writes) => atomicWrites.push(writes),
    writeSummary: (summary) => summaries.push(summary),
  });

  assert.equal(atomicWrites.length, 1);
  assert.equal(atomicWrites[0]?.length, 1);
  assert.match(
    atomicWrites[0]?.[0]?.filePath ?? "",
    /coverage-manifest\.json$/
  );
  assert.match(summaries[0] ?? "", /"importedCandidateCount":0/);
  assert.match(summaries[0] ?? "", /"skippedDuplicateCandidateCount":1/);
});

test("atomic import rolls back the candidate when the manifest commit fails", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "qa-sms-import-"));
  const candidatePath = path.join(directory, "candidate.json");
  const manifestPath = path.join(directory, "coverage-manifest.json");
  const transactionId = "rollback-test";
  await fs.writeFile(manifestPath, "old manifest", "utf8");
  const failingFileSystem = {
    access: fs.access.bind(fs),
    mkdir: fs.mkdir.bind(fs),
    writeFile: fs.writeFile.bind(fs),
    rm: fs.rm.bind(fs),
    rename: async (oldPath: string, newPath: string): Promise<void> => {
      if (oldPath === `${manifestPath}.${transactionId}.tmp`) {
        throw new Error("simulated_manifest_commit_failure");
      }
      await fs.rename(oldPath, newPath);
    },
  };

  try {
    await assert.rejects(
      writeImportAtomically(
        [
          { filePath: candidatePath, value: { candidate: true } },
          {
            filePath: manifestPath,
            value: { manifest: true },
            allowExistingTarget: true,
          },
        ],
        transactionId,
        failingFileSystem
      )
    );
    await assert.rejects(fs.access(candidatePath));
    assert.equal(await fs.readFile(manifestPath, "utf8"), "old manifest");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("atomic import rejects an existing catalog output collision", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "qa-sms-import-"));
  const candidatePath = path.join(directory, "candidate.json");
  await fs.writeFile(candidatePath, "existing candidate", "utf8");

  try {
    await assert.rejects(
      writeImportAtomically(
        [{ filePath: candidatePath, value: { replacement: true } }],
        "collision-test"
      ),
      /import_output_collision/
    );
    assert.equal(
      await fs.readFile(candidatePath, "utf8"),
      "existing candidate"
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
