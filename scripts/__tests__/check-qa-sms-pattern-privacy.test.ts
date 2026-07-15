import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { buildQaCoverageDeclarations } from "../../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-bundle-builder";
import type { QaCandidateArtifact } from "../../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-pattern-types";
import {
  runQaSmsPatternPrivacyCheck,
  scanQaSmsPatternPrivacy,
  type QaSmsPrivacyScanFile,
} from "../check-qa-sms-pattern-privacy";

const TEST_CANDIDATE_ID = "qa-candidate-123e4567-e89b-42d3-a456-426614174000";

function scan(files: readonly QaSmsPrivacyScanFile[]): readonly string[] {
  return scanQaSmsPatternPrivacy(files).map(({ code }) => code);
}

test("rejects forbidden raw fields and raw-value canaries", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/leak.json",
      content: JSON.stringify({
        rawSmsBody: "QA_SMS_RAW_CANARY_DO_NOT_COMMIT",
      }),
    },
  ]);

  assert.ok(codes.includes("forbidden_raw_key"));
  assert.ok(codes.includes("raw_value_canary"));
});

test("rejects common raw inbox keys in candidate files", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/raw.json",
      content: JSON.stringify({
        sender: "hidden",
        body: "hidden",
        nativeMessageId: "hidden",
        smsFingerprint: "hidden",
      }),
    },
  ]);

  assert.equal(codes.filter((code) => code === "forbidden_raw_key").length, 4);
});

test("rejects native Android SMS metadata keys in candidate files", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/raw.json",
      content: JSON.stringify({
        _id: "native-message-id",
        address: "QNB EGYPT",
        date: "1750000000000",
      }),
    },
  ]);

  assert.equal(codes.filter((code) => code === "forbidden_raw_key").length, 3);
});

test("rejects source-message timestamp keys in candidate files", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/raw.json",
      content: JSON.stringify({
        receivedAtMs: 1_750_000_000_000,
        sourceTimestamp: "2026-07-13T00:00:00.000Z",
      }),
    },
  ]);

  assert.equal(codes.filter((code) => code === "forbidden_raw_key").length, 2);
});

test("rejects tracked intake files even when their content is sanitized", () => {
  assert.deepEqual(
    scan([
      {
        path: ".local/qa-sms-intake/export.json",
        content: '{"schemaVersion":1}',
      },
    ]),
    ["tracked_staging_artifact"]
  );
});

test("rejects malformed JSON inside the candidate catalog", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/broken.json",
      content: '{"schemaVersion":1',
    },
  ]);

  assert.deepEqual(codes, ["candidate_json_invalid"]);
});

test("rejects malformed candidate-shaped entries before inspecting fixed text", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/malformed.json",
      content: JSON.stringify({
        segments: [{ kind: "fixed", text: "amount 250" }],
      }),
    },
  ]);

  assert.ok(codes.includes("candidate_schema_invalid"));
});

test("rejects malformed entries in candidate catalogs when segments are missing", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/qnb-candidates-test.json",
      content: JSON.stringify({
        candidates: [
          {
            candidateId: TEST_CANDIDATE_ID,
            fixedText: "Synthetic amount EGP 250 at Test Person",
          },
        ],
      }),
    },
  ]);

  assert.ok(codes.includes("candidate_schema_invalid"));
});

test("rejects private values in unknown candidate wrapper fields", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/qnb-candidates-test.json",
      content: JSON.stringify({
        candidates: [],
        operatorNotes: ["Synthetic amount EGP 275 at Test Person"],
      }),
    },
  ]);

  assert.ok(codes.includes("raw_string_value"));
});

test("does not exempt malformed wrapper values under schema-owned keys", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/qnb-candidates-test.json",
      content: JSON.stringify({
        verifiedSenderAlias: "010 123 456 78",
        sanitizedShape: "Synthetic amount EGP250 at Test Person",
      }),
    },
  ]);

  assert.ok(codes.includes("raw_string_value"));
});

test("allows generated candidate IDs in schema-owned ID arrays", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/coverage-manifest.json",
      content: JSON.stringify({
        candidateIds: [TEST_CANDIDATE_ID],
      }),
    },
  ]);

  assert.equal(codes.includes("raw_string_value"), false);
});

test("does not exempt candidate IDs with invalid UUID version or variant bits", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/coverage-manifest.json",
      content: JSON.stringify({
        candidateIds: ["qa-candidate-01012345-6789-0123-4567-890123456789"],
      }),
    },
  ]);

  assert.ok(codes.includes("raw_string_value"));
});

test("rejects unexpected non-JSON files inside the candidate catalog", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/raw-note.txt",
      content: "Synthetic purchase EGP 250 at Test Person",
    },
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/.gitkeep",
      content: "",
    },
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/index.ts",
      content: "export const catalog = {};",
    },
  ]);

  assert.ok(codes.includes("unexpected_candidate_file"));
  assert.equal(
    codes.filter((code) => code === "unexpected_candidate_file").length,
    1
  );
});

test("does not let candidate ID arrays hide arbitrary private text", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/coverage-manifest.json",
      content: JSON.stringify({
        candidateIds: ["Synthetic amount EGP 275 at Test Person"],
      }),
    },
  ]);

  assert.ok(codes.includes("raw_string_value"));
});

test("scans committed candidate contents even when the working copy is safe", (context) => {
  context.mock.method(process.stderr, "write", () => true);
  const rootDirectory = mkdtempSync(join(tmpdir(), "monyvi-qa-privacy-"));
  const relativePath =
    "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/unsafe.json";
  const filePath = join(rootDirectory, relativePath);
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    execFileSync("git", ["init"], { cwd: rootDirectory });
    execFileSync("git", ["config", "user.email", "qa@example.test"], {
      cwd: rootDirectory,
    });
    execFileSync("git", ["config", "user.name", "QA Test"], {
      cwd: rootDirectory,
    });
    writeFileSync(
      filePath,
      JSON.stringify({
        candidates: [],
        operatorNote: "Synthetic amount EGP 275 at Test Person",
      })
    );
    execFileSync("git", ["add", relativePath], { cwd: rootDirectory });
    execFileSync("git", ["commit", "-m", "test: add unsafe candidate"], {
      cwd: rootDirectory,
    });
    writeFileSync(filePath, JSON.stringify({ candidates: [] }));

    assert.throws(
      () => runQaSmsPatternPrivacyCheck(rootDirectory),
      /qa_sms_privacy_check_failed/
    );
  } finally {
    rmSync(rootDirectory, { recursive: true, force: true });
  }
});

test("scans unsafe candidate content from every commit in the pushed range", (context) => {
  context.mock.method(process.stderr, "write", () => true);
  const rootDirectory = mkdtempSync(join(tmpdir(), "monyvi-qa-history-"));
  const relativePath =
    "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/history.json";
  const filePath = join(rootDirectory, relativePath);
  const previousBaseSha = process.env.QA_SMS_PRIVACY_BASE_SHA;
  const previousHeadSha = process.env.QA_SMS_PRIVACY_HEAD_SHA;
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    execFileSync("git", ["init"], { cwd: rootDirectory });
    execFileSync("git", ["config", "user.email", "qa@example.test"], {
      cwd: rootDirectory,
    });
    execFileSync("git", ["config", "user.name", "QA Test"], {
      cwd: rootDirectory,
    });
    writeFileSync(join(rootDirectory, "README.md"), "safe\n");
    execFileSync("git", ["add", "README.md"], { cwd: rootDirectory });
    execFileSync("git", ["commit", "-m", "test: safe baseline"], {
      cwd: rootDirectory,
    });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: rootDirectory,
      encoding: "utf8",
    }).trim();

    writeFileSync(
      filePath,
      JSON.stringify({
        candidates: [],
        operatorNote: "Synthetic amount EGP 275 at Test Person",
      })
    );
    execFileSync("git", ["add", relativePath], { cwd: rootDirectory });
    execFileSync("git", ["commit", "-m", "test: unsafe intermediate"], {
      cwd: rootDirectory,
    });

    writeFileSync(filePath, JSON.stringify({ candidates: [] }));
    execFileSync("git", ["add", relativePath], { cwd: rootDirectory });
    execFileSync("git", ["commit", "-m", "test: safe final tree"], {
      cwd: rootDirectory,
    });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: rootDirectory,
      encoding: "utf8",
    }).trim();

    process.env.QA_SMS_PRIVACY_BASE_SHA = baseSha;
    process.env.QA_SMS_PRIVACY_HEAD_SHA = headSha;
    assert.throws(
      () => runQaSmsPatternPrivacyCheck(rootDirectory),
      /qa_sms_privacy_check_failed/
    );
  } finally {
    if (previousBaseSha === undefined) {
      delete process.env.QA_SMS_PRIVACY_BASE_SHA;
    } else {
      process.env.QA_SMS_PRIVACY_BASE_SHA = previousBaseSha;
    }
    if (previousHeadSha === undefined) {
      delete process.env.QA_SMS_PRIVACY_HEAD_SHA;
    } else {
      process.env.QA_SMS_PRIVACY_HEAD_SHA = previousHeadSha;
    }
    rmSync(rootDirectory, { recursive: true, force: true });
  }
});

test("scans unsafe candidate content introduced only by a merge commit", (context) => {
  context.mock.method(process.stderr, "write", () => true);
  const rootDirectory = mkdtempSync(join(tmpdir(), "monyvi-qa-merge-history-"));
  const relativePath =
    "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/merge-only.json";
  const filePath = join(rootDirectory, relativePath);
  const previousBaseSha = process.env.QA_SMS_PRIVACY_BASE_SHA;
  const previousHeadSha = process.env.QA_SMS_PRIVACY_HEAD_SHA;
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    execFileSync("git", ["init"], { cwd: rootDirectory });
    execFileSync("git", ["config", "user.email", "qa@example.test"], {
      cwd: rootDirectory,
    });
    execFileSync("git", ["config", "user.name", "QA Test"], {
      cwd: rootDirectory,
    });
    writeFileSync(join(rootDirectory, "README.md"), "safe\n");
    execFileSync("git", ["add", "README.md"], { cwd: rootDirectory });
    execFileSync("git", ["commit", "-m", "test: safe baseline"], {
      cwd: rootDirectory,
    });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: rootDirectory,
      encoding: "utf8",
    }).trim();

    execFileSync("git", ["switch", "-c", "feature"], {
      cwd: rootDirectory,
    });
    writeFileSync(join(rootDirectory, "feature.txt"), "feature\n");
    execFileSync("git", ["add", "feature.txt"], { cwd: rootDirectory });
    execFileSync("git", ["commit", "-m", "test: feature parent"], {
      cwd: rootDirectory,
    });

    execFileSync("git", ["switch", "master"], { cwd: rootDirectory });
    writeFileSync(join(rootDirectory, "main.txt"), "main\n");
    execFileSync("git", ["add", "main.txt"], { cwd: rootDirectory });
    execFileSync("git", ["commit", "-m", "test: main parent"], {
      cwd: rootDirectory,
    });
    execFileSync("git", ["merge", "--no-ff", "--no-commit", "feature"], {
      cwd: rootDirectory,
    });
    writeFileSync(
      filePath,
      JSON.stringify({
        candidates: [],
        operatorNote: "Synthetic amount EGP275 at Test Person",
      })
    );
    execFileSync("git", ["add", relativePath], { cwd: rootDirectory });
    execFileSync("git", ["commit", "-m", "test: unsafe merge result"], {
      cwd: rootDirectory,
    });

    rmSync(filePath);
    execFileSync("git", ["add", relativePath], { cwd: rootDirectory });
    execFileSync("git", ["commit", "-m", "test: remove unsafe merge file"], {
      cwd: rootDirectory,
    });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: rootDirectory,
      encoding: "utf8",
    }).trim();

    process.env.QA_SMS_PRIVACY_BASE_SHA = baseSha;
    process.env.QA_SMS_PRIVACY_HEAD_SHA = headSha;
    assert.throws(
      () => runQaSmsPatternPrivacyCheck(rootDirectory),
      /qa_sms_privacy_check_failed/
    );
  } finally {
    if (previousBaseSha === undefined) {
      delete process.env.QA_SMS_PRIVACY_BASE_SHA;
    } else {
      process.env.QA_SMS_PRIVACY_BASE_SHA = previousBaseSha;
    }
    if (previousHeadSha === undefined) {
      delete process.env.QA_SMS_PRIVACY_HEAD_SHA;
    } else {
      process.env.QA_SMS_PRIVACY_HEAD_SHA = previousHeadSha;
    }
    rmSync(rootDirectory, { recursive: true, force: true });
  }
});

test("rejects candidate artifacts with open review reasons or confidence bounds", () => {
  const content = JSON.stringify({
    runtimeScope: "candidate",
    autoSelectPolicy: "never",
    expectedOutcome: {
      kind: "transaction",
      confidenceCeiling: 1.2,
      reviewReasons: ["invented_reason"],
    },
  });

  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/unsafe.json",
      content,
    },
  ]);

  assert.ok(codes.includes("invalid_review_reason"));
  assert.ok(codes.includes("invalid_confidence_ceiling"));
});

test("rejects candidate imports from runtime parser entry points", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/local-sms-parser.ts",
      content: 'import { candidates } from "./qa-sms-pattern-candidates";',
    },
  ]);

  assert.deepEqual(codes, ["candidate_runtime_import"]);
});

test("rejects dynamic candidate imports from runtime parser entry points", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/local-sms-parser.ts",
      content:
        'const candidates = await import("./qa-sms-pattern-candidates");',
    },
  ]);

  assert.deepEqual(codes, ["candidate_runtime_import"]);
});

test("allows evaluator imports inside the isolated QA validation runner", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-validation-case-runner.ts",
      content:
        'import { evaluate } from "./testing/qa-sms-template-evaluator";',
    },
  ]);

  assert.deepEqual(codes, []);
});

test("rejects candidate artifacts with executable runtime metadata", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/unsafe.json",
      content: JSON.stringify({
        runtimeScope: "production",
        autoSelectPolicy: "automatic",
      }),
    },
  ]);

  assert.ok(codes.includes("invalid_runtime_scope"));
  assert.ok(codes.includes("invalid_auto_select_policy"));
});

test("accepts isolated candidate metadata without raw values", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/safe.json",
      content: JSON.stringify({
        runtimeScope: "candidate",
        autoSelectPolicy: "never",
        expectedOutcome: {
          kind: "transaction",
          confidenceCeiling: 0.8,
          reviewReasons: ["candidate_pattern"],
        },
      }),
    },
  ]);

  assert.deepEqual(codes, []);
});

test("rejects raw financial values hidden inside candidate fixed text", () => {
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/leak.json",
      content: JSON.stringify({
        schemaVersion: 1,
        candidateId: TEST_CANDIDATE_ID,
        evidenceDigest: "a".repeat(64),
        providerId: "qnb-egypt",
        verifiedSenderAlias: "QNB",
        messageFamily: "card_purchase",
        currency: "EGP",
        expectedOutcome: {
          kind: "transaction",
          direction: "expense",
          requiredPlaceholderRoles: ["transaction_amount"],
          confidenceCeiling: 0.8,
          reviewStatus: "needs_review",
          reviewReasons: ["candidate_pattern"],
        },
        segments: [
          { kind: "fixed", text: "Purchase for EGP 1234.56 amount " },
          {
            kind: "placeholder",
            token: "AMOUNT",
            semanticRole: "transaction_amount",
            wasOperatorCorrected: false,
          },
        ],
        sanitizedShape: "Purchase for EGP 1234.56 amount <AMOUNT>",
        sourceType: "qa-real-sms",
        runtimeScope: "candidate",
        autoSelectPolicy: "never",
        authorization: {
          version: 1,
          authorizationClass: "qa_operator_explicit",
          authorizedAt: "2026-07-13T00:00:00.000Z",
          providerScope: "qnb-egypt",
        },
        createdAt: "2026-07-13T00:01:00.000Z",
      }),
    },
  ]);

  assert.ok(codes.includes("candidate_privacy_invalid"));
});

test("rejects a staged bundle whose canonical content digest is stale", () => {
  const candidate = {
    schemaVersion: 1,
    candidateId: TEST_CANDIDATE_ID,
    evidenceDigest: "a".repeat(64),
    providerId: "qnb-egypt",
    verifiedSenderAlias: "QNB",
    messageFamily: "otp",
    currency: null,
    expectedOutcome: { kind: "rejection", reason: "otp" },
    segments: [
      { kind: "fixed", text: "Use code " },
      {
        kind: "placeholder",
        token: "REFERENCE",
        semanticRole: "otp_code",
        wasOperatorCorrected: false,
      },
    ],
    sanitizedShape: "Use code <REFERENCE>",
    sourceType: "qa-real-sms",
    runtimeScope: "candidate",
    autoSelectPolicy: "never",
    authorization: {
      version: 1,
      authorizationClass: "qa_operator_explicit",
      authorizedAt: "2026-07-13T00:00:00.000Z",
      providerScope: "qnb-egypt",
    },
    createdAt: "2026-07-13T00:01:00.000Z",
  };
  const codes = scan([
    {
      path: "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb/bundle.json",
      content: JSON.stringify({
        schemaVersion: 1,
        exportId: "123e4567-e89b-42d3-a456-426614174000",
        exportedAt: "2026-07-13T00:02:00.000Z",
        evidenceDomainStatus: "stable",
        candidates: [candidate],
        coverageDeclarations: buildQaCoverageDeclarations(
          [candidate as QaCandidateArtifact],
          "2026-07-13T00:02:00.000Z"
        ),
        integrity: {
          candidateCount: 1,
          candidateIds: [candidate.candidateId],
          contentDigest: "b".repeat(64),
        },
      }),
    },
  ]);

  assert.ok(codes.includes("bundle_integrity_invalid"));
});
