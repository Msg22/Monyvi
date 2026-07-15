import type { QaCandidateArtifact } from "../qa-sms-pattern-types";
import { validateQaSmsCandidatePrivacy } from "../qa-sms-privacy-validator";

function buildCandidate(fixedText: string): QaCandidateArtifact {
  return {
    schemaVersion: 1,
    candidateId: "qa-candidate-safe",
    evidenceDigest: "digest-safe",
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
      { kind: "fixed", text: fixedText },
      {
        kind: "placeholder",
        token: "AMOUNT",
        semanticRole: "transaction_amount",
        wasOperatorCorrected: false,
      },
    ],
    sanitizedShape: `${fixedText}<AMOUNT>`,
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
}

describe("validateQaSmsCandidatePrivacy", () => {
  it("accepts fixed wording with canonical placeholders", () => {
    const result = validateQaSmsCandidatePrivacy(
      buildCandidate("Your card was used for ")
    );
    expect(result).toEqual({ isValid: true, findings: [] });
  });

  it("accepts generic withdrawal wording after private values are placeholdered", () => {
    const result = validateQaSmsCandidatePrivacy(
      buildCandidate(
        " was debited from your account for cash withdrawal. For More Information, please call "
      )
    );

    expect(result).toEqual({ isValid: true, findings: [] });
  });

  it("accepts a reference label when the value is already placeholdered", () => {
    const result = validateQaSmsCandidatePrivacy(
      buildCandidate("Your transaction reference number is ")
    );

    expect(result).toEqual({ isValid: true, findings: [] });
  });

  it.each([
    "تم تحويل المبلغ من حسابك وإضافته إلى محفظتك الإلكترونية",
    "يتم التسليم من خلال شركة الشحن في محل الإقامة",
    "لمزيد من المعلومات اتصل بالبنك",
    "ارسل اخر 4 ارقام من بطاقة الرقم القومي",
    "من الرقم المحمول المسجل لدى ",
  ])(
    "accepts generic Arabic wording without treating it as a person",
    (text) => {
      expect(validateQaSmsCandidatePrivacy(buildCandidate(text))).toEqual({
        isValid: true,
        findings: [],
      });
    }
  );

  it.each([
    ["amount", "Your card was used for EGP 123.45", "raw_numeric_value"],
    ["integer amount", "Offer amount EGP 500", "raw_numeric_value"],
    ["compact integer amount", "Offer EGP250", "raw_numeric_value"],
    ["compact USD amount", "Offer USD999", "raw_numeric_value"],
    ["compact decimal amount", "Offer EGP123.45", "raw_numeric_value"],
    ["grouped integer amount", "Offer amount USD 1,500", "raw_numeric_value"],
    [
      "suffix currency amount",
      "Transaction failed for 250 EGP",
      "raw_numeric_value",
    ],
    ["Arabic-Indic amount", "رصيد ١٢٣٫٤٥", "raw_numeric_value"],
    [
      "Arabic merchant",
      "عملية شراء لدى كارفور بتاريخ ",
      "raw_counterparty_value",
    ],
    ["balance", "Available balance 9,876.54", "raw_numeric_value"],
    ["short integer amount", "Transaction amount 250", "raw_numeric_value"],
    ["short integer balance", "Available balance 999", "raw_numeric_value"],
    ["card", "Card ending 4321", "raw_numeric_value"],
    ["account", "Account 001234567890", "raw_numeric_value"],
    ["space-grouped account", "Account 123 456 789", "raw_identifier_value"],
    ["hyphen-grouped account", "Account 123-456-789", "raw_identifier_value"],
    ["reference", "Reference AB12345678", "raw_identifier_value"],
    ["letter reference", "Reference ABCDEF", "raw_identifier_value"],
    ["punctuated letter reference", "Ref# ABCDEF", "raw_identifier_value"],
    ["merchant", "Merchant QA PRIVATE MARKET", "raw_counterparty_value"],
    [
      "punctuated merchant",
      "Your card was used at UBER*TRIP for ",
      "raw_counterparty_value",
    ],
    [
      "at-sign merchant",
      "Successful transaction @QA STORE,your available balance ",
      "raw_counterparty_value",
    ],
    ["person", "Transfer from TEST PERSON", "raw_counterparty_value"],
    [
      "mixed-case transfer person",
      "Transfer EGP placeholder to Test Person",
      "raw_counterparty_value",
    ],
    [
      "Arabic transfer counterparty",
      `\u062a\u062d\u0648\u064a\u0644 \u0625\u0644\u0649 \u0634\u062e\u0635 \u0627\u062e\u062a\u0628\u0627\u0631\u064a \u0641\u064a `,
      "raw_counterparty_value",
    ],
    ["email", "Contact support@example.test", "raw_email_value"],
    ["phone", "Call +201001234567", "raw_phone_value"],
    ["local Egyptian phone", "Call 01012345678", "raw_phone_value"],
    ["space-grouped phone", "Call 010 123 456 78", "raw_phone_value"],
    ["hyphen-grouped phone", "Call 010-123-456-78", "raw_phone_value"],
    ["date", "Completed on 13/07/2026", "raw_date_value"],
    [
      "Arabic-Indic date",
      "Completed on \u0661\u0664/\u0660\u0667/\u0662\u0666",
      "raw_date_value",
    ],
    [
      "Eastern Arabic-Indic date",
      "Completed on \u06f1\u06f4/\u06f0\u06f7/\u06f2\u06f6",
      "raw_date_value",
    ],
    ["month-name date", "Completed on 14 Jul 26", "raw_date_value"],
    ["time", "Completed at 14:35", "raw_time_value"],
    [
      "Arabic-Indic time",
      "Completed at \u0661\u0662:\u0663\u0664",
      "raw_time_value",
    ],
    ["compact meridiem time", "Completed at 2PM", "raw_time_value"],
    ["spaced meridiem time", "Completed at 2 PM", "raw_time_value"],
    [
      "title-cased recipient",
      "Transfer to Ahmed failed for ",
      "raw_counterparty_value",
    ],
  ])("blocks seeded %s values without echoing them", (_label, text, code) => {
    const result = validateQaSmsCandidatePrivacy(buildCandidate(text));
    expect(result.isValid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })])
    );
    expect(JSON.stringify(result)).not.toContain(text);
  });

  it("rejects unverified aliases and unknown placeholder tokens", () => {
    const candidate = buildCandidate("Safe phrase ");
    const unverified: QaCandidateArtifact = {
      ...candidate,
      verifiedSenderAlias: "personal-phone-sender",
    };
    const unknownToken = {
      ...candidate,
      segments: [
        {
          kind: "placeholder",
          token: "RAW_VALUE",
          semanticRole: "unknown",
          wasOperatorCorrected: false,
        },
      ],
    } as unknown as QaCandidateArtifact;

    expect(validateQaSmsCandidatePrivacy(unverified).isValid).toBe(false);
    expect(validateQaSmsCandidatePrivacy(unknownToken).isValid).toBe(false);
  });
});
