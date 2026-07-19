import type {
  QaIntakeAuthorization,
  QaSanitizedCandidateDraft,
} from "../qa-sms-pattern-types";
import {
  applyQaRawRangeCorrections,
  applyQaRawRangeCorrection,
  approveQaSmsDraft,
  buildQaCandidateArtifact,
  type QaRawRangeSelection,
  validateQaSmsDraft,
} from "../qa-sms-draft-lifecycle";
import { sanitizeQaSmsCandidate } from "../qa-sms-candidate-sanitizer";
import { classifyQaSmsDraft } from "../qa-sms-draft-classification";
import {
  buildTestCandidateId,
  buildTestEvidenceDigest,
} from "./qa-sms-test-fixtures";

const authorization: QaIntakeAuthorization = {
  version: 1,
  authorizationClass: "qa_operator_explicit",
  authorizedAt: "2026-07-13T00:00:00.000Z",
  providerScope: "qnb-egypt",
  currencyScope: ["EGP", "USD"],
  messageFamilyScope: ["card_purchase"],
};

function createDraft(body: string): QaSanitizedCandidateDraft {
  return sanitizeQaSmsCandidate({
    draftId: "draft-local-only",
    body,
    providerId: "qnb-egypt",
    verifiedSenderAlias: "QNB",
    messageFamily: null,
    currency: null,
    expectedOutcome: null,
    evidenceDigest: buildTestEvidenceDigest("draft-local-only"),
    authorization,
  });
}

describe("QA SMS draft lifecycle", () => {
  it("replaces only an explicitly selected raw range and retains no raw value", () => {
    const rawBody = "Purchase EGP 123.45 at PRIVATE SHOP";
    const startOffset = rawBody.indexOf("PRIVATE SHOP");
    const corrected = applyQaRawRangeCorrection(createDraft(rawBody), {
      rawBody,
      startOffset,
      endOffset: startOffset + "PRIVATE SHOP".length,
      token: "MERCHANT",
      semanticRole: "merchant_name",
    });

    expect(corrected.status).toBe("draft");
    expect(corrected.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "placeholder",
          token: "MERCHANT",
          wasOperatorCorrected: true,
        }),
      ])
    );
    expect(JSON.stringify(corrected)).not.toContain("PRIVATE SHOP");
  });

  it("applies cumulative non-overlapping corrections and rejects overlaps", () => {
    const rawBody = "Purchase EGP 123.45 balance 900.00 at PRIVATE SHOP";
    const balanceStart = rawBody.indexOf("900.00");
    const merchantStart = rawBody.indexOf("PRIVATE SHOP");
    const corrections = [
      {
        startOffset: balanceStart,
        endOffset: balanceStart + "900.00".length,
        token: "BALANCE" as const,
        semanticRole: "available_balance",
      },
      {
        startOffset: merchantStart,
        endOffset: merchantStart + "PRIVATE SHOP".length,
        token: "MERCHANT" as const,
        semanticRole: "merchant_name",
      },
    ] satisfies readonly QaRawRangeSelection[];

    const corrected = applyQaRawRangeCorrections(
      createDraft(rawBody),
      rawBody,
      corrections
    );

    expect(corrected.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "BALANCE",
          semanticRole: "available_balance",
          wasOperatorCorrected: true,
        }),
        expect.objectContaining({
          token: "MERCHANT",
          semanticRole: "merchant_name",
          wasOperatorCorrected: true,
        }),
      ])
    );
    expect(() =>
      applyQaRawRangeCorrections(createDraft(rawBody), rawBody, [
        corrections[0],
        {
          ...corrections[1],
          startOffset: balanceStart + 1,
          endOffset: merchantStart + 1,
        },
      ])
    ).toThrow("invalid_placeholder_boundary");
  });

  it("preserves an explicit ATM terminal correction without classifying the family", () => {
    const rawBody = "Terminal TEST ATM812";
    const startOffset = rawBody.indexOf("TEST ATM812");
    const corrected = applyQaRawRangeCorrection(createDraft(rawBody), {
      rawBody,
      startOffset,
      endOffset: rawBody.length,
      token: "ATM_TERMINAL",
      semanticRole: "atm_terminal",
    });

    expect(corrected.messageFamily).toBeNull();
    expect(corrected.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "ATM_TERMINAL",
          semanticRole: "atm_terminal",
          wasOperatorCorrected: true,
        }),
      ])
    );
    expect(JSON.stringify(corrected)).not.toContain("TEST ATM812");
  });

  it("preserves a reference correction without exposing correction sentinels", () => {
    const rawBody = "One-time code QA123456";
    const startOffset = rawBody.indexOf("QA123456");
    const corrected = applyQaRawRangeCorrection(createDraft(rawBody), {
      rawBody,
      startOffset,
      endOffset: rawBody.length,
      token: "REFERENCE",
      semanticRole: "otp_code",
    });

    expect(corrected.segments).toEqual([
      { kind: "fixed", text: "One-time code " },
      {
        kind: "placeholder",
        token: "REFERENCE",
        semanticRole: "otp_code",
        wasOperatorCorrected: true,
      },
    ]);
    expect(JSON.stringify(corrected)).not.toMatch(
      /operator_correction|\{\{REF/
    );
    expect(corrected.validationFindings).toEqual([]);
  });

  it("rejects raw text that collides with an internal correction marker", () => {
    const rawBody = "Value [[[QACORR_0]]] QA123";
    const startOffset = rawBody.indexOf("QA123");
    expect(() =>
      applyQaRawRangeCorrection(createDraft(rawBody), {
        rawBody,
        startOffset,
        endOffset: rawBody.length,
        token: "REFERENCE",
        semanticRole: "transaction_reference",
      })
    ).toThrow("invalid_placeholder_boundary");
  });

  it("requires complete validation before approval", () => {
    const classified = classifyQaSmsDraft(
      createDraft("Purchase EGP 123.45 at QA SHOP"),
      { messageFamily: "card_purchase", currency: "EGP" }
    );
    const validated = validateQaSmsDraft(classified);
    expect(validated.status).toBe("validated");
    expect(approveQaSmsDraft(validated).status).toBe("approved");
    expect(() => approveQaSmsDraft(classified)).toThrow(
      "candidate_not_validated"
    );
  });

  it("identifies the specific missing required placeholder role", () => {
    const classified = classifyQaSmsDraft(createDraft("Safe fixed wording"), {
      messageFamily: "card_purchase",
      currency: "EGP",
    });

    expect(validateQaSmsDraft(classified).validationFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "required_placeholder_missing",
          semanticRole: "transaction_amount",
        }),
      ])
    );
  });

  it("requires transaction values for bank-to-wallet transfer candidates", () => {
    const classified = classifyQaSmsDraft(
      createDraft("Safe transfer wording"),
      {
        messageFamily: "bank_to_wallet_transfer",
        currency: "EGP",
      }
    );

    expect(validateQaSmsDraft(classified).validationFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "required_placeholder_missing",
          semanticRole: "transaction_amount",
        }),
      ])
    );
  });

  it("validates an IPN template without balance or counterparty placeholders", () => {
    const rawBody =
      "IPN transfer sent with amount of EGP 999.99 from 1234 on 21/08 at 07:35 PM. Ref# QA9X7Z. For more details call 19000.";
    const classified = classifyQaSmsDraft(createDraft(rawBody), {
      messageFamily: "outgoing_ipn_transfer",
      currency: "EGP",
    });
    const validated = validateQaSmsDraft(classified);

    expect(validated.validationFindings).toEqual([]);
    expect(validated.status).toBe("validated");
  });

  it.each([
    ["QNB OTP: 369154 at Orange for EGP 1572", "otp"],
    ["For lost/stolen card call 18564", "informational"],
  ] as const)(
    "validates and approves a contextually sanitized %s candidate",
    (body, messageFamily) => {
      const classified = classifyQaSmsDraft(createDraft(body), {
        messageFamily,
        currency: null,
      });
      const validated = validateQaSmsDraft(classified);

      expect(validated.validationFindings).toEqual([]);
      expect(validated.status).toBe("validated");
      expect(approveQaSmsDraft(validated).status).toBe("approved");
    }
  );

  it("validates promotional public-variable placeholders", () => {
    const classified = classifyQaSmsDraft(
      createDraft(
        "QNB offer 13.5% during 2024. Details https://example.test/offer. Terms ref 204899052."
      ),
      { messageFamily: "promotional", currency: null }
    );
    const validated = validateQaSmsDraft(classified);

    expect(validated.validationFindings).toEqual([]);
    expect(validated.status).toBe("validated");
  });

  it("validates an informational public reference placeholder", () => {
    const classified = classifyQaSmsDraft(
      createDraft("يرجى عدم مشاركة البيانات الخاصة مع أي شخص. ت. ض: 204899052"),
      { messageFamily: "informational", currency: null }
    );
    const validated = validateQaSmsDraft(classified);

    expect(validated.validationFindings).toEqual([]);
    expect(validated.status).toBe("validated");
  });

  it("recomputes validation instead of retaining a stale dynamic-value finding", () => {
    const classified = classifyQaSmsDraft(
      createDraft("يرجى عدم مشاركة البيانات الخاصة مع أي شخص. ت. ض: 204899052"),
      { messageFamily: "informational", currency: null }
    );
    const staleFindingDraft: QaSanitizedCandidateDraft = {
      ...classified,
      validationFindings: [
        {
          code: "unknown_dynamic_value",
          severity: "blocking",
          segmentIndex: null,
          messageKey: "qaSmsIntake.privacy.unknown_dynamic_value",
          semanticRole: null,
        },
      ],
      status: "blocked",
    };

    const validated = validateQaSmsDraft(staleFindingDraft);

    expect(validated.validationFindings).toEqual([]);
    expect(validated.status).toBe("validated");
  });

  it("rediscovers a dynamic value that remains in the current fixed text", () => {
    const classified = classifyQaSmsDraft(createDraft("Use value 18564"), {
      messageFamily: "informational",
      currency: null,
    });

    const validated = validateQaSmsDraft(classified);

    expect(validated.validationFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unknown_dynamic_value" }),
      ])
    );
    expect(validated.status).toBe("blocked");
  });

  it("allows an operator to mark a public loyalty-points amount", () => {
    const rawBody = "Earn up to 150.000 loyalty points";
    const valueStart = rawBody.indexOf("150.000");
    const corrected = applyQaRawRangeCorrection(createDraft(rawBody), {
      rawBody,
      startOffset: valueStart,
      endOffset: valueStart + "150.000".length,
      token: "AMOUNT",
      semanticRole: "promotional_amount",
    });
    const classified = classifyQaSmsDraft(corrected, {
      messageFamily: "promotional",
      currency: null,
    });

    expect(validateQaSmsDraft(classified).status).toBe("validated");
  });

  it("builds a strict artifact without draft or authorization scope fields", () => {
    const candidateId = buildTestCandidateId("artifact");
    const classified = classifyQaSmsDraft(
      createDraft("Purchase EGP 123.45 at QA SHOP"),
      { messageFamily: "card_purchase", currency: "EGP" }
    );
    const approved = approveQaSmsDraft(validateQaSmsDraft(classified));
    const artifact = buildQaCandidateArtifact(approved, {
      candidateId,
      createdAt: "2026-07-13T01:00:00.000Z",
    });

    expect(artifact).toMatchObject({
      candidateId,
      sourceType: "qa-real-sms",
      runtimeScope: "candidate",
      autoSelectPolicy: "never",
      authorization: {
        authorizationClass: "qa_operator_explicit",
        providerScope: "qnb-egypt",
      },
    });
    expect(JSON.stringify(artifact)).not.toMatch(
      /draft-local-only|currencyScope|messageFamilyScope|rawBody|smsFingerprint/
    );
  });
});
