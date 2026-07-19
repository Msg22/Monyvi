import { createHash } from "node:crypto";
import path from "node:path";
import type {
  QaCandidateArtifact,
  QaCandidateBundle,
} from "../qa-sms-pattern-types";
import {
  importQaCandidateBundle,
  mergeQaCoverageManifest,
  validateQaCoverageManifest,
} from "../qa-sms-candidate-importer";
import {
  buildQaCoverageDeclarations,
  serializeQaCandidateBundleIntegrityPayload,
} from "../qa-sms-bundle-builder";
import {
  buildTestCandidateId,
  buildTestEvidenceDigest,
} from "./qa-sms-test-fixtures";

function candidate(candidateId = "1"): QaCandidateArtifact {
  const safeCandidateId = buildTestCandidateId(candidateId);
  return {
    schemaVersion: 1,
    candidateId: safeCandidateId,
    evidenceDigest: buildTestEvidenceDigest(safeCandidateId),
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
    createdAt: "2026-07-13T01:00:00.000Z",
  };
}

function bundle(
  evidenceDomainStatus: QaCandidateBundle["evidenceDomainStatus"] = "stable"
): QaCandidateBundle {
  const artifact = candidate();
  const content: Omit<QaCandidateBundle, "integrity"> = {
    schemaVersion: 1,
    exportId: "123e4567-e89b-42d3-a456-426614174000",
    exportedAt: "2026-07-13T02:00:00.000Z",
    evidenceDomainStatus,
    candidates: [artifact],
    coverageDeclarations: buildQaCoverageDeclarations(
      [artifact],
      "2026-07-13T02:00:00.000Z"
    ).map((declaration) =>
      declaration.status === "pending"
        ? { ...declaration, status: "unavailable_in_qa_dataset" as const }
        : declaration
    ),
  };
  const contentDigest = createHash("sha256")
    .update(serializeQaCandidateBundleIntegrityPayload(content), "utf8")
    .digest("hex");
  return {
    ...content,
    integrity: {
      candidateCount: 1,
      candidateIds: [artifact.candidateId],
      contentDigest,
    },
  };
}

function rebuildBundle(
  source: QaCandidateBundle,
  candidates: readonly QaCandidateArtifact[]
): QaCandidateBundle {
  const content: Omit<QaCandidateBundle, "integrity"> = {
    ...source,
    candidates,
    coverageDeclarations: buildQaCoverageDeclarations(
      candidates,
      source.exportedAt
    ).map((declaration) =>
      declaration.status === "pending"
        ? { ...declaration, status: "unavailable_in_qa_dataset" as const }
        : declaration
    ),
  };
  return {
    ...content,
    integrity: {
      candidateCount: candidates.length,
      candidateIds: candidates.map(({ candidateId }) => candidateId),
      contentDigest: createHash("sha256")
        .update(serializeQaCandidateBundleIntegrityPayload(content), "utf8")
        .digest("hex"),
    },
  };
}

describe("importQaCandidateBundle", () => {
  const stagingRoot = path.resolve(".local/qa-sms-intake");

  it("accepts only validated files inside the ignored staging root", () => {
    const result = importQaCandidateBundle({
      inputPath: path.join(stagingRoot, "bundle.json"),
      stagingRoot,
      bundle: bundle(),
      existingCandidates: [],
      acknowledgeNewEvidenceDomain: false,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.families).toHaveLength(1);
    expect(() =>
      importQaCandidateBundle({
        inputPath: path.resolve("bundle.json"),
        stagingRoot,
        bundle: bundle(),
        existingCandidates: [],
        acknowledgeNewEvidenceDomain: false,
      })
    ).toThrow("staging_path_required");
  });

  it("requires explicit acknowledgement after an evidence-domain reset", () => {
    expect(() =>
      importQaCandidateBundle({
        inputPath: path.join(stagingRoot, "bundle.json"),
        stagingRoot,
        bundle: bundle("reset_requires_manual_duplicate_review"),
        existingCandidates: [],
        acknowledgeNewEvidenceDomain: false,
      })
    ).toThrow("new_evidence_domain_acknowledgement_required");
  });

  it("skips equivalent evidence and remaps coverage to the existing candidate", () => {
    const existing = candidate("existing");
    const source = bundle();
    const duplicateCandidate = {
      ...source.candidates[0],
      evidenceDigest: existing.evidenceDigest,
    };
    const newCandidate = candidate("new");
    const duplicateBundle = rebuildBundle(source, [
      duplicateCandidate,
      newCandidate,
    ]);

    const result = importQaCandidateBundle({
      inputPath: path.join(stagingRoot, "bundle.json"),
      stagingRoot,
      bundle: duplicateBundle,
      existingCandidates: [existing],
      acknowledgeNewEvidenceDomain: false,
    });

    expect(result.importedCandidates).toEqual([newCandidate]);
    expect(result.candidates).toEqual(
      expect.arrayContaining([existing, newCandidate])
    );
    expect(result.summary).toMatchObject({
      importedCandidateCount: 1,
      skippedDuplicateCandidateCount: 1,
    });
    const otpCoverage = result.coverageDeclarations.find(
      ({ messageFamily, currency }) =>
        messageFamily === "otp" && currency === null
    );
    expect(otpCoverage?.candidateIds).toEqual(
      [existing.candidateId, newCandidate.candidateId].sort()
    );
  });

  it("rejects a conflicting interpretation of existing evidence", () => {
    const existing = candidate("existing");
    const source = bundle();
    const conflictingCandidate = {
      ...source.candidates[0],
      evidenceDigest: existing.evidenceDigest,
      segments: [{ kind: "fixed" as const, text: "Different safe template" }],
      sanitizedShape: "Different safe template",
    };
    const conflictingBundle = rebuildBundle(source, [conflictingCandidate]);

    expect(() =>
      importQaCandidateBundle({
        inputPath: path.join(stagingRoot, "bundle.json"),
        stagingRoot,
        bundle: conflictingBundle,
        existingCandidates: [existing],
        acknowledgeNewEvidenceDomain: false,
      })
    ).toThrow("conflicting_duplicate_evidence");
  });

  it("rejects candidate content edited after the trusted export workflow", () => {
    const original = bundle();
    const edited = {
      ...original,
      candidates: original.candidates.map((artifact) => ({
        ...artifact,
        segments: [{ kind: "fixed" as const, text: "Edited safe phrase" }],
        sanitizedShape: "Edited safe phrase",
      })),
    };

    expect(() =>
      importQaCandidateBundle({
        inputPath: path.join(stagingRoot, "bundle.json"),
        stagingRoot,
        bundle: edited,
        existingCandidates: [],
        acknowledgeNewEvidenceDomain: false,
      })
    ).toThrow("bundle_integrity_digest_mismatch");
  });

  it("rejects malformed existing catalog candidates before duplicate checks", () => {
    const malformedExisting = [
      { ...candidate("existing"), runtimeScope: "production" },
    ] as unknown as readonly QaCandidateArtifact[];

    expect(() =>
      importQaCandidateBundle({
        inputPath: path.join(stagingRoot, "bundle.json"),
        stagingRoot,
        bundle: bundle(),
        existingCandidates: malformedExisting,
        acknowledgeNewEvidenceDomain: false,
      })
    ).toThrow("existing_candidate_catalog_invalid");
  });

  it("rejects privacy-invalid existing catalog candidates before import", () => {
    const privacyInvalidExisting = {
      ...candidate("existing"),
      verifiedSenderAlias: "personal-phone-sender",
    };

    expect(() =>
      importQaCandidateBundle({
        inputPath: path.join(stagingRoot, "bundle.json"),
        stagingRoot,
        bundle: bundle(),
        existingCandidates: [privacyInvalidExisting],
        acknowledgeNewEvidenceDomain: false,
      })
    ).toThrow("existing_candidate_privacy_invalid");
  });

  it("rejects candidate IDs that already exist with different evidence", () => {
    const existing = {
      ...candidate("1"),
      evidenceDigest: buildTestEvidenceDigest("different-evidence"),
    };

    expect(() =>
      importQaCandidateBundle({
        inputPath: path.join(stagingRoot, "bundle.json"),
        stagingRoot,
        bundle: bundle(),
        existingCandidates: [existing],
        acknowledgeNewEvidenceDomain: false,
      })
    ).toThrow("duplicate_candidate_id");
  });

  it("preserves collected candidate evidence when a later import marks the scope unavailable", () => {
    const existing = candidate("existing");
    const recordedAt = "2026-07-13T02:00:00.000Z";
    const existingManifest = {
      schemaVersion: 1 as const,
      providerId: "qnb-egypt" as const,
      declarations: buildQaCoverageDeclarations([existing], recordedAt),
    };
    const incoming = buildQaCoverageDeclarations([], recordedAt).map(
      (declaration) => ({
        ...declaration,
        status: "unavailable_in_qa_dataset" as const,
      })
    );

    const merged = mergeQaCoverageManifest(existingManifest, incoming, [
      existing,
    ]);

    expect(
      merged.declarations.find(
        ({ messageFamily, currency }) =>
          messageFamily === "otp" && currency === null
      )
    ).toMatchObject({
      status: "candidate_collected",
      candidateIds: [existing.candidateId],
    });
  });

  it("rejects existing manifest references to candidates from another scope", () => {
    const existing = candidate("existing");
    const recordedAt = "2026-07-13T02:00:00.000Z";
    const manifest = {
      schemaVersion: 1 as const,
      providerId: "qnb-egypt" as const,
      declarations: buildQaCoverageDeclarations([existing], recordedAt).map(
        (declaration) =>
          declaration.messageFamily === "card_purchase" &&
          declaration.currency === "EGP"
            ? {
                ...declaration,
                status: "candidate_collected" as const,
                candidateIds: [existing.candidateId],
              }
            : declaration
      ),
    };

    expect(() =>
      validateQaCoverageManifest(manifest, [existing], false)
    ).toThrow("coverage_candidate_scope_mismatch");
  });

  it("rejects complete manifests that omit an existing catalog candidate", () => {
    const existing = candidate("existing");
    const recordedAt = "2026-07-13T02:00:00.000Z";
    const manifest = {
      schemaVersion: 1 as const,
      providerId: "qnb-egypt" as const,
      declarations: buildQaCoverageDeclarations([], recordedAt).map(
        (declaration) => ({
          ...declaration,
          status: "unavailable_in_qa_dataset" as const,
        })
      ),
    };

    expect(() =>
      validateQaCoverageManifest(manifest, [existing], true)
    ).toThrow("coverage_candidate_missing");
  });
});
