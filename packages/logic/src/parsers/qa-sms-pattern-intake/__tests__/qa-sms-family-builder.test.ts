import type { QaCandidateArtifact } from "../qa-sms-pattern-types";
import { buildQaTemplateFamilies } from "../qa-sms-family-builder";

function candidate(
  candidateId: string,
  currency: "EGP" | "USD",
  fixedText = "Your card ",
  verifiedSenderAlias = "QNB"
): QaCandidateArtifact {
  return {
    schemaVersion: 1,
    candidateId,
    evidenceDigest: `digest-${candidateId}`,
    providerId: "qnb-egypt",
    verifiedSenderAlias,
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
        token: "LAST4",
        semanticRole: "card_last4",
        wasOperatorCorrected: false,
      },
      { kind: "fixed", text: " was used for " },
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
    sanitizedShape: `${fixedText}<LAST4> was used for <CURRENCY> <AMOUNT>`,
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

describe("buildQaTemplateFamilies", () => {
  it("groups exact EGP and USD structures while retaining per-currency evidence", () => {
    const families = buildQaTemplateFamilies([
      candidate("egp-1", "EGP"),
      candidate("usd-1", "USD"),
    ]);
    expect(families).toHaveLength(1);
    expect(families[0]).toMatchObject({
      messageFamily: "card_purchase",
      supportedCurrencies: ["EGP", "USD"],
      evidenceDigestsByCurrency: {
        EGP: ["digest-egp-1"],
        USD: ["digest-usd-1"],
      },
      reviewState: "candidate",
      runtimeScope: "candidate",
      autoSelectPolicy: "never",
    });
  });

  it("splits material fixed-wording differences deterministically", () => {
    const first = buildQaTemplateFamilies([
      candidate("a", "EGP", "Your card "),
      candidate("b", "EGP", "The card "),
    ]);
    const second = buildQaTemplateFamilies([
      candidate("b", "EGP", "The card "),
      candidate("a", "EGP", "Your card "),
    ]);
    expect(first).toHaveLength(2);
    expect(first).toEqual(second);
  });

  it("groups approved equivalent QNB aliases but splits another sender family", () => {
    const families = buildQaTemplateFamilies([
      candidate("qnb", "EGP", "Your card ", "QNB"),
      candidate("qnb-alahli", "USD", "Your card ", "QNB ALAHLI"),
      candidate("other-family", "EGP", "Your card ", "QNB BUSINESS"),
    ]);

    expect(families).toHaveLength(2);
    expect(
      families.find(({ verifiedSenderAliases }) =>
        verifiedSenderAliases.includes("QNB ALAHLI")
      )?.verifiedSenderAliases
    ).toEqual(["QNB", "QNB ALAHLI"]);
  });

  it("rejects duplicate evidence even when candidate IDs differ", () => {
    const duplicate = {
      ...candidate("b", "EGP"),
      evidenceDigest: "digest-a",
    };
    expect(() =>
      buildQaTemplateFamilies([candidate("a", "EGP"), duplicate])
    ).toThrow("duplicate_evidence_digest");
  });
});
