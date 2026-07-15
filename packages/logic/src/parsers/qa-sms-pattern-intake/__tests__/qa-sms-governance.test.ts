import type { QaTemplateFamily } from "../qa-sms-pattern-types";
import {
  approveQaTemplateFamilyReview,
  invalidateQaTemplateFamilyVersion,
  promoteQaTemplateFamily,
  recordQaFamilyValidationCoverage,
} from "../qa-sms-governance";

function family(): QaTemplateFamily {
  return {
    familyId: "qnb-egypt-card-purchase-signature",
    version: 1,
    providerId: "qnb-egypt",
    verifiedSenderAliases: ["QNB"],
    messageFamily: "card_purchase",
    structuralSignature: "signature-v1",
    supportedCurrencies: ["EGP", "USD"],
    evidenceDigestsByCurrency: {
      EGP: ["digest-1", "digest-2"],
      USD: ["digest-3"],
    },
    expectedOutcome: {
      kind: "transaction",
      direction: "expense",
      requiredPlaceholderRoles: ["transaction_amount"],
      confidenceCeiling: 0.8,
      reviewStatus: "needs_review",
      reviewReasons: ["candidate_pattern"],
    },
    reviewState: "candidate",
    humanReview: null,
    validationCoverage: {
      positive: "pending",
      nearMatch: "pending",
      negative: "pending",
      currencies: {
        EGP: {
          positive: "pending",
          nearMatch: "pending",
          negative: "pending",
        },
        USD: {
          positive: "pending",
          nearMatch: "pending",
          negative: "pending",
        },
      },
    },
    versionHistory: [],
    runtimeScope: "candidate",
    autoSelectPolicy: "never",
  };
}

describe("QA SMS family governance", () => {
  it("promotes only after three samples, per-currency tests, and current-version approval", () => {
    const validated = recordQaFamilyValidationCoverage(family(), {
      positive: "passed",
      nearMatch: "passed",
      negative: "passed",
      currencies: {
        EGP: {
          positive: "passed",
          nearMatch: "passed",
          negative: "passed",
        },
        USD: {
          positive: "passed",
          nearMatch: "passed",
          negative: "passed",
        },
      },
    });
    const reviewed = approveQaTemplateFamilyReview(validated, {
      reasonCode: "qa_structure_confirmed",
      reviewedAt: "2026-07-13T03:00:00.000Z",
    });
    expect(promoteQaTemplateFamily(reviewed).reviewState).toBe("review_ready");
  });

  it("rejects an incomplete validation-case set for any supported currency", () => {
    const validated = recordQaFamilyValidationCoverage(family(), {
      positive: "passed",
      nearMatch: "passed",
      negative: "passed",
      currencies: {
        EGP: {
          positive: "passed",
          nearMatch: "passed",
          negative: "passed",
        },
        USD: {
          positive: "passed",
          nearMatch: "passed",
          negative: "pending",
        },
      },
    });
    const reviewed = approveQaTemplateFamilyReview(validated, {
      reasonCode: "qa_structure_confirmed",
      reviewedAt: "2026-07-13T03:00:00.000Z",
    });

    expect(() => promoteQaTemplateFamily(reviewed)).toThrow(
      "validation_coverage_required"
    );
  });

  it("rejects missing evidence, incomplete validation, and stale review", () => {
    const insufficient = {
      ...family(),
      evidenceDigestsByCurrency: { EGP: ["digest-1"], USD: ["digest-2"] },
    };
    expect(() => promoteQaTemplateFamily(insufficient)).toThrow(
      "three_evidence_samples_required"
    );
    const stale = {
      ...family(),
      humanReview: {
        decision: "approved" as const,
        reasonCode: "qa_structure_confirmed",
        reviewerRole: "qa_owner" as const,
        reviewedAt: "2026-07-13T03:00:00.000Z",
        testedArtifactVersion: 0,
      },
    };
    expect(() => promoteQaTemplateFamily(stale)).toThrow(
      "current_human_approval_required"
    );
  });

  it("increments structural versions and invalidates previous evidence and review", () => {
    const validated = recordQaFamilyValidationCoverage(family(), {
      positive: "passed",
      nearMatch: "passed",
      negative: "passed",
      currencies: {
        EGP: {
          positive: "passed",
          nearMatch: "passed",
          negative: "passed",
        },
        USD: {
          positive: "passed",
          nearMatch: "passed",
          negative: "passed",
        },
      },
    });
    const reviewed = approveQaTemplateFamilyReview(validated, {
      reasonCode: "qa_structure_confirmed",
      reviewedAt: "2026-07-13T03:00:00.000Z",
    });
    const promoted = promoteQaTemplateFamily(reviewed);
    const revised = invalidateQaTemplateFamilyVersion(
      promoted,
      "signature-v2",
      "2026-07-13T04:00:00.000Z"
    );
    expect(revised).toMatchObject({
      version: 2,
      structuralSignature: "signature-v2",
      reviewState: "candidate",
      humanReview: null,
      evidenceDigestsByCurrency: {},
      supportedCurrencies: [],
    });
    const [historyEntry] = revised.versionHistory;
    expect(historyEntry).toMatchObject({
      version: 1,
      structuralSignature: "signature-v1",
      reviewState: "review_ready",
      evidenceCount: 3,
      verifiedSenderAliases: ["QNB"],
      supportedCurrencies: ["EGP", "USD"],
      evidenceDigestsByCurrency: {
        EGP: ["digest-1", "digest-2"],
        USD: ["digest-3"],
      },
      validationCoverage: {
        positive: "passed",
        nearMatch: "passed",
        negative: "passed",
        currencies: {
          EGP: {
            positive: "passed",
            nearMatch: "passed",
            negative: "passed",
          },
          USD: {
            positive: "passed",
            nearMatch: "passed",
            negative: "passed",
          },
        },
      },
      runtimeScope: "candidate",
      autoSelectPolicy: "never",
      compatibility: "incompatible_structural_revision",
      supersededByVersion: 2,
    });
    expect(historyEntry?.humanReview).toMatchObject({
      decision: "approved",
      testedArtifactVersion: 1,
    });
  });
});
