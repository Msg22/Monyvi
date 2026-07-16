import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { qaCandidateArtifactSchema } from "../../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-artifact-schema";
import type { QaCandidateArtifact } from "../../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-pattern-types";
import type { TrustedSmsPromotionRecord } from "../../packages/logic/src/parsers/trusted-sms-pattern-types";
import { QNB_EGYPT_TRUSTED_SMS_CATALOG } from "../../packages/logic/src/parsers/trusted-sms-patterns";
import {
  promoteQaSmsPatterns,
  serializeTrustedSmsCatalogSources,
} from "../promote-qa-sms-patterns";

function readCandidates(
  fileName: string = "qnb-candidates-fe11b9b9-ee44-443c-bdf9-8b9c5ad2c4f6.json"
): readonly QaCandidateArtifact[] {
  const filePath = path.resolve(
    process.cwd(),
    "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb",
    fileName
  );
  const catalog = JSON.parse(readFileSync(filePath, "utf8")) as {
    readonly candidates?: readonly unknown[];
  };
  assert.ok(Array.isArray(catalog.candidates));
  return catalog.candidates.map((candidate) =>
    qaCandidateArtifactSchema.parse(candidate)
  );
}

function buildRecord(
  candidate: QaCandidateArtifact,
  overrides: Partial<TrustedSmsPromotionRecord> = {}
): TrustedSmsPromotionRecord {
  const normalizedFamily = candidate.messageFamily.replaceAll("_", "-");
  return {
    schemaVersion: 1,
    promotionId: `promotion-${candidate.candidateId}`,
    candidateId: candidate.candidateId,
    evidenceDigest: candidate.evidenceDigest,
    patternId: `qnb-egypt-${normalizedFamily}-v1`,
    patternVersion: 1,
    catalogVersion: 1,
    reviewerId: "mohamed",
    approvedAt: "2026-07-16T00:00:00.000Z",
    decision: "promote",
    validation: {
      schema: "passed",
      privacy: "passed",
      exactPositive: "passed",
      nearMatch: "passed",
      intentionalNegative: "passed",
      ambiguity: "passed",
      integrity: "passed",
    },
    validationEvidence: {
      exactPositive: "rendered_candidate",
      nearMatch: "mutate_each_fixed_segment",
      intentionalNegative: "unverified_sender",
    },
    ...overrides,
  } as TrustedSmsPromotionRecord;
}

test("promotes only explicitly approved eligible candidates", () => {
  const candidate = readCandidates().find(
    ({ messageFamily, currency }) =>
      messageFamily === "card_purchase" && currency === "EGP"
  );
  assert.ok(candidate);

  const catalog = promoteQaSmsPatterns({
    candidates: [candidate],
    promotionRecords: [buildRecord(candidate)],
    catalogVersion: 1,
  });

  assert.equal(catalog.patterns.length, 1);
  assert.equal(catalog.patterns[0].runtimeScope, "trusted_production");
  assert.equal(catalog.patterns[0].autoSelectPolicy, "never");
  assert.equal(catalog.patterns[0].expectedOutcome.kind, "transaction");
});

test("does not infer approval from an exported candidate", () => {
  const candidate = readCandidates()[0];

  const catalog = promoteQaSmsPatterns({
    candidates: [candidate],
    promotionRecords: [],
    catalogVersion: 1,
  });

  assert.equal(catalog.patterns.length, 0);
});

test("applies explicit bundled per-pattern disablement during regeneration", () => {
  const candidate = readCandidates().find(
    ({ messageFamily, currency }) =>
      messageFamily === "card_purchase" && currency === "EGP"
  );
  assert.ok(candidate);
  const record = buildRecord(candidate);

  const catalog = promoteQaSmsPatterns({
    candidates: [candidate],
    promotionRecords: [record],
    catalogVersion: 1,
    disabledPatternIds: [record.patternId],
  });

  assert.equal(catalog.patterns[0]?.enabled, false);
});

test("rejects unknown bundled disablement identities", () => {
  assert.throws(
    () =>
      promoteQaSmsPatterns({
        candidates: [],
        promotionRecords: [],
        catalogVersion: 1,
        disabledPatternIds: ["missing-pattern"],
      }),
    /promotion_disabled_pattern_missing/
  );
});

test("rejects promoted structures that collide at runtime", () => {
  const candidate = readCandidates().find(
    ({ messageFamily, currency }) =>
      messageFamily === "card_purchase" && currency === "EGP"
  );
  assert.ok(candidate);

  assert.throws(
    () =>
      promoteQaSmsPatterns({
        candidates: [candidate],
        promotionRecords: [
          buildRecord(candidate, { patternId: "collision-a" }),
          buildRecord(candidate, {
            patternId: "collision-b",
            promotionId: "promotion-collision-b",
          }),
        ],
        catalogVersion: 1,
      }),
    /promotion_pattern_ambiguous/
  );
});

test("rejects malformed promotion-record identity fields", () => {
  const candidate = readCandidates()[0];

  assert.throws(
    () =>
      promoteQaSmsPatterns({
        candidates: [candidate],
        promotionRecords: [buildRecord(candidate, { patternVersion: 0 })],
        catalogVersion: 1,
      }),
    /promotion_record_invalid/
  );
});

test("rejects an incomplete promotion validation", () => {
  const candidate = readCandidates()[0];
  const record = buildRecord(candidate, {
    validation: {
      ...buildRecord(candidate).validation,
      nearMatch: "failed",
    },
  });

  assert.throws(
    () =>
      promoteQaSmsPatterns({
        candidates: [candidate],
        promotionRecords: [record],
        catalogVersion: 1,
      }),
    /promotion_validation_incomplete/
  );
});

test("rejects promotion approval without bound executable evidence", () => {
  const candidate = readCandidates()[0];
  const record = buildRecord(candidate) as TrustedSmsPromotionRecord & {
    readonly validationEvidence: Readonly<Record<string, string>>;
  };
  const { validationEvidence: _validationEvidence, ...recordWithoutEvidence } =
    record;

  assert.throws(
    () =>
      promoteQaSmsPatterns({
        candidates: [candidate],
        promotionRecords: [recordWithoutEvidence as TrustedSmsPromotionRecord],
        catalogVersion: 1,
      }),
    /promotion_validation_evidence_missing/
  );
});

test("excludes bank-to-wallet candidates from this release", () => {
  const candidate = readCandidates(
    "qnb-candidates-a171a1e8-5caf-4b8b-91f0-3f21ebda75a4.json"
  ).find(({ messageFamily }) => messageFamily === "bank_to_wallet_transfer");
  assert.ok(candidate);

  assert.throws(
    () =>
      promoteQaSmsPatterns({
        candidates: [candidate],
        promotionRecords: [buildRecord(candidate)],
        catalogVersion: 1,
      }),
    /promotion_family_not_eligible/
  );
});

test("rejects promotion records whose candidate integrity does not match", () => {
  const candidate = readCandidates()[0];

  assert.throws(
    () =>
      promoteQaSmsPatterns({
        candidates: [candidate],
        promotionRecords: [
          buildRecord(candidate, { evidenceDigest: "0".repeat(64) }),
        ],
        catalogVersion: 1,
      }),
    /promotion_evidence_digest_mismatch/
  );
});

test("splits generated catalog source into maintainable modules", () => {
  const sources = serializeTrustedSmsCatalogSources(
    QNB_EGYPT_TRUSTED_SMS_CATALOG
  );

  assert.ok(sources.length > 1);
  assert.equal(sources[0]?.fileName, "qnb-egypt.ts");
  assert.ok(
    sources.every(({ source }) => source.split("\n").length <= 900),
    "generated source files must respect the project line limit"
  );
  assert.equal(
    sources
      .filter(({ fileName }) => fileName.startsWith("qnb-egypt-patterns-"))
      .reduce(
        (total, { source }) =>
          total + (source.match(/"patternId":/g)?.length ?? 0),
        0
      ),
    QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns.length
  );
});
