import {
  QA_SMS_MESSAGE_FAMILIES,
  getQaSmsCoverageCurrencies,
  type QaCandidateArtifact,
  type QaSmsCurrency,
  type QaSmsMessageFamily,
} from "../qa-sms-pattern-types";
import { buildQaTemplateFamilies } from "../qa-sms-family-builder";
import { runQaSmsValidationCases } from "../qa-sms-validation-case-runner";
import {
  buildTestCandidateId,
  buildTestEvidenceDigest,
} from "./qa-sms-test-fixtures";

const NO_CURRENCY = new Set<QaSmsMessageFamily>([
  "otp",
  "informational",
  "promotional",
]);

function expectedOutcome(
  family: QaSmsMessageFamily
): QaCandidateArtifact["expectedOutcome"] {
  if (
    family === "failed_transaction" ||
    family === "otp" ||
    family === "informational" ||
    family === "promotional"
  ) {
    return { kind: "rejection", reason: family };
  }
  if (family === "bank_to_wallet_transfer") {
    return {
      kind: "transfer",
      direction: "bank_to_wallet",
      requiredPlaceholderRoles: ["transaction_amount"],
      confidenceCeiling: 0.8,
      reviewStatus: "needs_review",
      reviewReasons: ["candidate_pattern", "transfer_accounts_required"],
    };
  }
  return {
    kind: "transaction",
    direction:
      family === "incoming_ipn_transfer" || family === "refund_or_reversal"
        ? "income"
        : "expense",
    requiredPlaceholderRoles: ["transaction_amount"],
    confidenceCeiling: 0.8,
    reviewStatus: "needs_review",
    reviewReasons: ["candidate_pattern"],
  };
}

function candidate(
  family: QaSmsMessageFamily,
  currency: QaSmsCurrency
): QaCandidateArtifact {
  const hasCurrency = currency !== null;
  const fixedText = `QA ${family.replaceAll("_", " ")} `;
  const segments: QaCandidateArtifact["segments"] = hasCurrency
    ? [
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
      ]
    : [
        { kind: "fixed", text: fixedText },
        {
          kind: "placeholder",
          token: "REFERENCE",
          semanticRole: "message_code",
          wasOperatorCorrected: false,
        },
      ];
  return {
    schemaVersion: 1,
    candidateId: buildTestCandidateId(`${family}-${currency ?? "na"}`),
    evidenceDigest: buildTestEvidenceDigest(`${family}-${currency ?? "na"}`),
    providerId: "qnb-egypt",
    verifiedSenderAlias: "QNB",
    messageFamily: family,
    currency,
    expectedOutcome: expectedOutcome(family),
    segments,
    sanitizedShape: `${fixedText}${
      hasCurrency ? "<CURRENCY> <AMOUNT>" : "<REFERENCE>"
    }`,
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

describe("QNB QA family matrix", () => {
  it("covers every supported family with explicit currency applicability", () => {
    const candidates = QA_SMS_MESSAGE_FAMILIES.flatMap((family) =>
      getQaSmsCoverageCurrencies(family).map((currency) =>
        candidate(family, currency)
      )
    );
    const families = buildQaTemplateFamilies(candidates);
    expect(families).toHaveLength(QA_SMS_MESSAGE_FAMILIES.length);
    expect(families.map(({ messageFamily }) => messageFamily).sort()).toEqual(
      [...QA_SMS_MESSAGE_FAMILIES].sort()
    );
    for (const family of families) {
      expect(family.supportedCurrencies).toEqual(
        getQaSmsCoverageCurrencies(family.messageFamily).filter(
          (currency): currency is Exclude<QaSmsCurrency, null> =>
            currency !== null
        )
      );
    }

    const results = runQaSmsValidationCases(
      families,
      families.map((family) => ({
        caseId: `positive-${family.messageFamily}`,
        kind: "positive" as const,
        targetFamilyId: family.familyId,
        candidate: candidate(
          family.messageFamily,
          NO_CURRENCY.has(family.messageFamily) ? null : "EGP"
        ),
        expectedStatus: "matched" as const,
      }))
    );
    expect(results.filter(({ didPass }) => !didPass)).toEqual([]);
  });
});
