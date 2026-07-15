import type {
  QaCandidateArtifact,
  QaTemplateFamily,
} from "../qa-sms-pattern-types";
import { buildQaTemplateFamilies } from "../qa-sms-family-builder";
import { runQaSmsValidationCases } from "../qa-sms-validation-case-runner";
import {
  buildTestCandidateId,
  buildTestEvidenceDigest,
} from "./qa-sms-test-fixtures";

function candidate(
  candidateId: string,
  fixedText: string,
  currency: "EGP" | "USD" = "EGP"
): QaCandidateArtifact {
  return {
    schemaVersion: 1,
    candidateId: buildTestCandidateId(candidateId),
    evidenceDigest: buildTestEvidenceDigest(candidateId),
    providerId: "qnb-egypt",
    verifiedSenderAlias: "QNB",
    messageFamily: "card_purchase",
    currency,
    expectedOutcome: {
      kind: "transaction",
      direction: "expense",
      requiredPlaceholderRoles: ["transaction_amount"],
      confidenceCeiling: 0.8,
      reviewStatus: "needs_review",
      reviewReasons: ["candidate_pattern"],
    },
    segments: [
      { kind: "fixed", text: fixedText },
      {
        kind: "placeholder",
        token: "CURRENCY",
        semanticRole: "transaction_currency",
        wasOperatorCorrected: false,
      },
      { kind: "fixed", text: " " },
      {
        kind: "placeholder",
        token: "AMOUNT",
        semanticRole: "transaction_amount",
        wasOperatorCorrected: false,
      },
    ],
    sanitizedShape: `${fixedText}<CURRENCY> <AMOUNT>`,
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

describe("runQaSmsValidationCases", () => {
  let family: QaTemplateFamily;

  beforeEach(() => {
    [family] = buildQaTemplateFamilies([
      candidate("base", "Reviewed purchase "),
    ]);
  });

  it("matches exact structures and rejects near or negative structures", () => {
    const results = runQaSmsValidationCases(
      [family],
      [
        {
          caseId: "positive",
          kind: "positive",
          targetFamilyId: family.familyId,
          candidate: candidate("positive", "Reviewed purchase "),
          expectedStatus: "matched",
        },
        {
          caseId: "near",
          kind: "near_match",
          targetFamilyId: family.familyId,
          candidate: candidate("near", "Different purchase "),
          expectedStatus: "rejected",
        },
        {
          caseId: "negative",
          kind: "negative",
          targetFamilyId: family.familyId,
          candidate: candidate("negative", "Promotion "),
          expectedStatus: "rejected",
        },
      ]
    );

    expect(results.every(({ didPass }) => didPass)).toBe(true);
    expect(results.map(({ actualStatus }) => actualStatus)).toEqual([
      "matched",
      "rejected",
      "rejected",
    ]);
    expect(JSON.stringify(results)).not.toMatch(
      /Reviewed purchase|Different purchase/
    );
  });

  it("returns unsupported without constructing an app transaction", () => {
    const [result] = runQaSmsValidationCases(
      [],
      [
        {
          caseId: "unsupported",
          kind: "negative",
          targetFamilyId: "missing-family",
          candidate: candidate("unknown", "Unknown "),
          expectedStatus: "unsupported",
        },
      ]
    );
    expect(result).toEqual(
      expect.objectContaining({
        actualStatus: "unsupported",
        expectedOutcomeKind: null,
        didPass: true,
      })
    );
    expect(result).not.toHaveProperty("transaction");
  });

  it("rejects a structural match for a currency without family evidence", () => {
    const [result] = runQaSmsValidationCases(
      [family],
      [
        {
          caseId: "unsupported-currency",
          kind: "near_match",
          targetFamilyId: family.familyId,
          candidate: candidate("usd", "Reviewed purchase ", "USD"),
          expectedStatus: "rejected",
        },
      ]
    );

    expect(result).toMatchObject({
      actualStatus: "rejected",
      didPass: true,
      validationCodes: ["unsupported_currency"],
    });
  });

  it("returns a schema failure for malformed candidates without running privacy validation", () => {
    const malformed = {
      ...candidate("malformed", "Reviewed purchase "),
      verifiedSenderAlias: undefined,
    } as unknown as QaCandidateArtifact;

    expect(() =>
      runQaSmsValidationCases(
        [family],
        [
          {
            caseId: "malformed",
            kind: "negative",
            targetFamilyId: family.familyId,
            candidate: malformed,
            expectedStatus: "rejected",
          },
        ]
      )
    ).not.toThrow();

    expect(
      runQaSmsValidationCases(
        [family],
        [
          {
            caseId: "malformed",
            kind: "negative",
            targetFamilyId: family.familyId,
            candidate: malformed,
            expectedStatus: "rejected",
          },
        ]
      )[0]
    ).toMatchObject({
      actualStatus: "rejected",
      validationCodes: ["candidate_schema_invalid"],
      didPass: false,
    });
  });

  it("does not pass an expected rejection when privacy setup fails", () => {
    const unsafe = candidate(
      "unsafe",
      "Reviewed purchase EGP 250 at Test Person "
    );

    const [result] = runQaSmsValidationCases(
      [family],
      [
        {
          caseId: "unsafe",
          kind: "negative",
          targetFamilyId: family.familyId,
          candidate: unsafe,
          expectedStatus: "rejected",
        },
      ]
    );

    expect(result).toMatchObject({
      actualStatus: "rejected",
      validationCodes: ["candidate_privacy_invalid"],
      didPass: false,
    });
  });
});
