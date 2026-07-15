import type { QaCandidateArtifact } from "../qa-sms-pattern-types";
import {
  buildQaCandidateBundle,
  buildQaCoverageDeclarations,
  serializeQaCandidateBundleIntegrityPayload,
  markPendingQaCoverageUnavailable,
  updateQaCoverageDeclaration,
} from "../qa-sms-bundle-builder";
import {
  buildTestCandidateId,
  buildTestEvidenceDigest,
} from "./qa-sms-test-fixtures";

function candidate(
  candidateId: string,
  messageFamily: QaCandidateArtifact["messageFamily"],
  currency: QaCandidateArtifact["currency"]
): QaCandidateArtifact {
  const safeCandidateId = buildTestCandidateId(candidateId);
  return {
    schemaVersion: 1,
    candidateId: safeCandidateId,
    evidenceDigest: buildTestEvidenceDigest(safeCandidateId),
    providerId: "qnb-egypt",
    verifiedSenderAlias: "QNB",
    messageFamily,
    currency,
    expectedOutcome:
      messageFamily === "otp"
        ? { kind: "rejection", reason: "otp" }
        : {
            kind: "transaction",
            direction: "expense",
            requiredPlaceholderRoles: ["transaction_amount"],
            confidenceCeiling: 0.8,
            reviewStatus: "needs_review",
            reviewReasons: ["candidate_pattern"],
          },
    segments: [
      { kind: "fixed", text: "Reviewed phrase " },
      {
        kind: "placeholder",
        token: "AMOUNT",
        semanticRole: "transaction_amount",
        wasOperatorCorrected: false,
      },
    ],
    sanitizedShape: "Reviewed phrase <AMOUNT>",
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

describe("QA SMS bundle builder", () => {
  it("creates all required family/currency coverage rows", () => {
    const declarations = buildQaCoverageDeclarations(
      [candidate("qa-candidate-1", "card_purchase", "EGP")],
      "2026-07-13T02:00:00.000Z"
    );
    expect(declarations).toHaveLength(16);
    expect(declarations).toContainEqual(
      expect.objectContaining({
        messageFamily: "card_purchase",
        currency: "EGP",
        status: "candidate_collected",
        candidateIds: [buildTestCandidateId("qa-candidate-1")],
      })
    );
    expect(declarations).toContainEqual(
      expect.objectContaining({
        messageFamily: "otp",
        currency: null,
        status: "pending",
      })
    );
    expect(declarations).toContainEqual(
      expect.objectContaining({
        messageFamily: "bank_to_wallet_transfer",
        currency: "EGP",
        status: "pending",
      })
    );
    expect(declarations).not.toContainEqual(
      expect.objectContaining({
        messageFamily: "bank_to_wallet_transfer",
        currency: "USD",
      })
    );
  });

  it("marks only pending coverage unavailable in one immutable update", () => {
    const declarations = buildQaCoverageDeclarations(
      [candidate("qa-candidate-1", "card_purchase", "EGP")],
      "2026-07-13T02:00:00.000Z"
    );
    const alreadyUnavailable = updateQaCoverageDeclaration(
      declarations,
      { messageFamily: "atm_withdrawal", currency: "USD" },
      "unavailable_in_qa_dataset",
      "2026-07-13T02:30:00.000Z"
    );

    const updated = markPendingQaCoverageUnavailable(
      alreadyUnavailable,
      "2026-07-13T03:00:00.000Z"
    );

    expect(updated).not.toBe(alreadyUnavailable);
    expect(updated.every(({ status }) => status !== "pending")).toBe(true);
    expect(
      updated.find(
        ({ messageFamily, currency }) =>
          messageFamily === "card_purchase" && currency === "EGP"
      )
    ).toEqual(
      alreadyUnavailable.find(
        ({ messageFamily, currency }) =>
          messageFamily === "card_purchase" && currency === "EGP"
      )
    );
    expect(
      updated.find(
        ({ messageFamily, currency }) =>
          messageFamily === "atm_withdrawal" && currency === "USD"
      )
    ).toEqual(
      alreadyUnavailable.find(
        ({ messageFamily, currency }) =>
          messageFamily === "atm_withdrawal" && currency === "USD"
      )
    );
  });

  it("does not allow candidate-backed coverage without evidence", () => {
    const declarations = buildQaCoverageDeclarations(
      [],
      "2026-07-13T02:00:00.000Z"
    );
    expect(() =>
      updateQaCoverageDeclaration(
        declarations,
        { messageFamily: "atm_withdrawal", currency: "USD" },
        "candidate_collected",
        "2026-07-13T03:00:00.000Z"
      )
    ).toThrow("coverage_candidate_required");
  });

  it("does not allow collected evidence to be marked unavailable", () => {
    const declarations = buildQaCoverageDeclarations(
      [candidate("qa-candidate-1", "card_purchase", "EGP")],
      "2026-07-13T02:00:00.000Z"
    );

    expect(() =>
      updateQaCoverageDeclaration(
        declarations,
        { messageFamily: "card_purchase", currency: "EGP" },
        "unavailable_in_qa_dataset",
        "2026-07-13T03:00:00.000Z"
      )
    ).toThrow("coverage_candidate_already_collected");
  });

  it("rejects changing candidate-backed coverage to pending", () => {
    const declarations = buildQaCoverageDeclarations(
      [candidate("qa-candidate-1", "card_purchase", "EGP")],
      "2026-07-13T00:00:00.000Z"
    );

    expect(() =>
      updateQaCoverageDeclaration(
        declarations,
        { messageFamily: "card_purchase", currency: "EGP" },
        "pending",
        "2026-07-13T00:01:00.000Z"
      )
    ).toThrow("coverage_candidate_already_collected");
  });

  it("blocks bundle creation while required coverage is pending", async () => {
    const candidates = [candidate("qa-candidate-1", "card_purchase", "EGP")];
    const declarations = buildQaCoverageDeclarations(
      candidates,
      "2026-07-13T02:00:00.000Z"
    );
    await expect(
      buildQaCandidateBundle(
        candidates,
        declarations,
        {
          exportId: "123e4567-e89b-42d3-a456-426614174000",
          exportedAt: "2026-07-13T03:00:00.000Z",
          evidenceDomainStatus: "stable",
        },
        () => Promise.resolve("a".repeat(64))
      )
    ).rejects.toThrow("coverage_pending");
  });

  it("adds a digest of the canonical sanitized bundle content", async () => {
    const candidates = [candidate("qa-candidate-1", "card_purchase", "EGP")];
    const declarations = buildQaCoverageDeclarations(
      candidates,
      "2026-07-13T02:00:00.000Z"
    ).map((declaration) =>
      declaration.status === "pending"
        ? { ...declaration, status: "unavailable_in_qa_dataset" as const }
        : declaration
    );
    const digest = jest.fn(() => Promise.resolve("b".repeat(64)));

    const bundle = await buildQaCandidateBundle(
      candidates,
      declarations,
      {
        exportId: "123e4567-e89b-42d3-a456-426614174000",
        exportedAt: "2026-07-13T03:00:00.000Z",
        evidenceDomainStatus: "stable",
      },
      digest
    );

    expect(bundle.integrity.contentDigest).toBe("b".repeat(64));
    expect(digest).toHaveBeenCalledWith(
      serializeQaCandidateBundleIntegrityPayload(bundle)
    );
  });
});
