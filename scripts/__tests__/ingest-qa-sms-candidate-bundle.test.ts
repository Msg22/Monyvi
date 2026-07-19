import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import type { QaCandidateBundle } from "../../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-pattern-types";
import {
  parseIngestCommandOptions,
  runIngestQaSmsCandidateBundle,
  type IngestCommandDependencies,
} from "../ingest-qa-sms-candidate-bundle";

const root = path.resolve("qa-ingest-test-root");
const exportId = "123e4567-e89b-42d3-a456-426614174000";
const sourcePath = path.resolve(root, "transferred", "bundle.json");

function createBundle(): QaCandidateBundle {
  return {
    schemaVersion: 1,
    exportId,
    exportedAt: "2026-07-15T00:00:00.000Z",
    evidenceDomainStatus: "stable",
    candidates: [],
    coverageDeclarations: [],
    integrity: {
      candidateCount: 0,
      candidateIds: [],
      contentDigest: "a".repeat(64),
    },
  };
}

function createDependencies(events: string[]): IngestCommandDependencies {
  return {
    cwd: () => root,
    readText: async (filePath) => {
      events.push(`read:${filePath}`);
      return "sanitized-json";
    },
    validateBundle: async (contents) => {
      events.push(`validate:${contents}`);
      return createBundle();
    },
    stageBundle: async ({ targetPath }) => {
      events.push(
        `stage:${path.relative(root, targetPath).replaceAll("\\", "/")}`
      );
    },
    runImport: async (args) => {
      events.push(`import:${args.join(" ")}`);
      return {
        mode: args.includes("--dry-run") ? "dry-run" : "import",
        importedCandidateCount: 0,
        skippedDuplicateCandidateCount: 0,
        totalCandidateCount: 0,
        familyCount: 0,
        requiresManualDuplicateReview: false,
      };
    },
    runVerification: async () => {
      events.push("verify");
    },
    writeSummary: (summary) => {
      events.push(`summary:${summary}`);
    },
  };
}

test("parses one explicit export path and duplicate-domain acknowledgement", () => {
  assert.deepEqual(
    parseIngestCommandOptions([
      "transferred/bundle.json",
      "--acknowledge-new-evidence-domain",
    ]),
    {
      inputPath: "transferred/bundle.json",
      acknowledgeNewEvidenceDomain: true,
    }
  );
});

test("rejects ambiguous input paths", () => {
  assert.throws(
    () => parseIngestCommandOptions(["first.json", "second.json"]),
    /one_input_path_required/
  );
});

test("validates before staging and runs dry-run before atomic import", async () => {
  const events: string[] = [];
  await runIngestQaSmsCandidateBundle([sourcePath], createDependencies(events));

  assert.deepEqual(events.slice(0, 4), [
    `read:${sourcePath}`,
    "validate:sanitized-json",
    `stage:.local/qa-sms-intake/qa-sms-candidates-${exportId}.json`,
    "verify",
  ]);
  assert.match(events[4] ?? "", /import:.*--dry-run/);
  assert.doesNotMatch(events[5] ?? "", /--dry-run/);
  assert.match(events[6] ?? "", /summary:/);
  assert.match(events[6] ?? "", /"skippedDuplicateCandidateCount":0/);
  assert.doesNotMatch(events[6] ?? "", /sanitized-json|transferred/);
});

test("does not stage or import a bundle that fails external validation", async () => {
  const events: string[] = [];
  const dependencies = createDependencies(events);
  await assert.rejects(
    runIngestQaSmsCandidateBundle([sourcePath], {
      ...dependencies,
      validateBundle: async () => {
        throw new Error("bundle_validation_failed");
      },
    }),
    /bundle_validation_failed/
  );
  assert.equal(
    events.some((event) => event.startsWith("stage:")),
    false
  );
  assert.equal(
    events.some((event) => event.startsWith("import:")),
    false
  );
});

test("does not write catalog output when repository verification fails", async () => {
  const events: string[] = [];
  const dependencies = createDependencies(events);
  await assert.rejects(
    runIngestQaSmsCandidateBundle([sourcePath], {
      ...dependencies,
      runVerification: async () => {
        events.push("verify");
        throw new Error("qa_sms_privacy_check_failed");
      },
    }),
    /qa_sms_privacy_check_failed/
  );
  assert.equal(
    events.some((event) => event.startsWith("import:")),
    false
  );
});

test("stops after a duplicate-domain dry-run refusal", async () => {
  const events: string[] = [];
  const dependencies = createDependencies(events);
  await assert.rejects(
    runIngestQaSmsCandidateBundle([sourcePath], {
      ...dependencies,
      runImport: async (args) => {
        events.push(`import:${args.join(" ")}`);
        throw new Error("evidence_domain_acknowledgement_required");
      },
    }),
    /evidence_domain_acknowledgement_required/
  );
  assert.equal(events.filter((event) => event.startsWith("import:")).length, 1);
  assert.match(
    events.find((event) => event.startsWith("import:")) ?? "",
    /--dry-run/
  );
});
