import type {
  QaFamilyValidationCoverage,
  QaTemplateFamily,
  QaValidationCaseCoverage,
} from "./qa-sms-pattern-types";

interface QaFamilyReviewInput {
  readonly reasonCode: string;
  readonly reviewedAt: string;
}

function copyValidationCoverage(
  coverage: QaFamilyValidationCoverage
): QaFamilyValidationCoverage {
  return {
    ...coverage,
    currencies: Object.fromEntries(
      Object.entries(coverage.currencies).map(([currency, cases]) => [
        currency,
        cases ? { ...cases } : cases,
      ])
    ),
  };
}

function hasCompleteCaseCoverage(
  coverage: QaValidationCaseCoverage | undefined
): boolean {
  return (
    coverage?.positive === "passed" &&
    coverage.nearMatch === "passed" &&
    coverage.negative === "passed"
  );
}

function evidenceCount(family: QaTemplateFamily): number {
  return new Set(
    Object.values(family.evidenceDigestsByCurrency).flatMap((digests) =>
      digests ? [...digests] : []
    )
  ).size;
}

function copyExpectedOutcome(
  outcome: QaTemplateFamily["expectedOutcome"]
): QaTemplateFamily["expectedOutcome"] {
  return outcome.kind === "rejection"
    ? { ...outcome }
    : {
        ...outcome,
        requiredPlaceholderRoles: [...outcome.requiredPlaceholderRoles],
        reviewReasons: [...outcome.reviewReasons],
      };
}

export function recordQaFamilyValidationCoverage(
  family: QaTemplateFamily,
  validationCoverage: QaFamilyValidationCoverage
): QaTemplateFamily {
  return {
    ...family,
    validationCoverage: copyValidationCoverage(validationCoverage),
    reviewState: "candidate",
  };
}

export function approveQaTemplateFamilyReview(
  family: QaTemplateFamily,
  input: QaFamilyReviewInput
): QaTemplateFamily {
  if (input.reasonCode.trim().length === 0) {
    throw new Error("review_reason_required");
  }
  return {
    ...family,
    humanReview: {
      decision: "approved",
      reasonCode: input.reasonCode,
      reviewerRole: "qa_owner",
      reviewedAt: input.reviewedAt,
      testedArtifactVersion: family.version,
    },
    reviewState: "candidate",
  };
}

export function promoteQaTemplateFamily(
  family: QaTemplateFamily
): QaTemplateFamily {
  if (
    family.runtimeScope !== "candidate" ||
    family.autoSelectPolicy !== "never"
  ) {
    throw new Error("candidate_runtime_policy_required");
  }
  if (evidenceCount(family) < 3) {
    throw new Error("three_evidence_samples_required");
  }
  if (
    family.supportedCurrencies.some(
      (currency) =>
        (family.evidenceDigestsByCurrency[currency]?.length ?? 0) === 0
    )
  ) {
    throw new Error("currency_evidence_required");
  }
  if (
    family.humanReview?.decision !== "approved" ||
    family.humanReview.testedArtifactVersion !== family.version
  ) {
    throw new Error("current_human_approval_required");
  }
  const { validationCoverage } = family;
  if (
    !hasCompleteCaseCoverage(validationCoverage) ||
    family.supportedCurrencies.some(
      (currency) =>
        !hasCompleteCaseCoverage(validationCoverage.currencies[currency])
    )
  ) {
    throw new Error("validation_coverage_required");
  }
  return { ...family, reviewState: "review_ready" };
}

export function invalidateQaTemplateFamilyVersion(
  family: QaTemplateFamily,
  structuralSignature: string,
  invalidatedAt: string
): QaTemplateFamily {
  if (structuralSignature === family.structuralSignature) {
    throw new Error("structural_signature_unchanged");
  }
  return {
    ...family,
    version: family.version + 1,
    structuralSignature,
    supportedCurrencies: [],
    evidenceDigestsByCurrency: {},
    reviewState: "candidate",
    humanReview: null,
    validationCoverage: {
      positive: "pending",
      nearMatch: "pending",
      negative: "pending",
      currencies: {},
    },
    versionHistory: [
      ...family.versionHistory,
      {
        version: family.version,
        structuralSignature: family.structuralSignature,
        providerId: family.providerId,
        verifiedSenderAliases: [...family.verifiedSenderAliases],
        messageFamily: family.messageFamily,
        supportedCurrencies: [...family.supportedCurrencies],
        evidenceDigestsByCurrency: Object.fromEntries(
          Object.entries(family.evidenceDigestsByCurrency).map(
            ([currency, digests]) => [currency, digests ? [...digests] : []]
          )
        ),
        expectedOutcome: copyExpectedOutcome(family.expectedOutcome),
        reviewState: family.reviewState,
        humanReview: family.humanReview ? { ...family.humanReview } : null,
        validationCoverage: copyValidationCoverage(family.validationCoverage),
        runtimeScope: family.runtimeScope,
        autoSelectPolicy: family.autoSelectPolicy,
        evidenceCount: evidenceCount(family),
        invalidatedAt,
        compatibility: "incompatible_structural_revision",
        supersededByVersion: family.version + 1,
      },
    ],
  };
}

export type { QaFamilyReviewInput };
