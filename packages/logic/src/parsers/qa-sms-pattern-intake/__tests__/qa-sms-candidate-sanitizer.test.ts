import type {
  QaIntakeAuthorization,
  QaSanitizedCandidateDraft,
} from "../qa-sms-pattern-types";
import {
  applyQaPlaceholderCorrection,
  containsQaSmsCurrencyLiteral,
  sanitizeQaSmsCandidate,
} from "../qa-sms-candidate-sanitizer";

const authorization: QaIntakeAuthorization = {
  version: 1,
  authorizationClass: "qa_operator_explicit",
  authorizedAt: "2026-07-13T00:00:00.000Z",
  providerScope: "qnb-egypt",
  currencyScope: ["EGP", "USD"],
  messageFamilyScope: ["card_purchase"],
};

function sanitize(body: string): QaSanitizedCandidateDraft {
  return sanitizeQaSmsCandidate({
    draftId: "draft-1",
    body,
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
    evidenceDigest: "digest-1",
    authorization,
  });
}

function sanitizeUnclassified(body: string): QaSanitizedCandidateDraft {
  return sanitizeQaSmsCandidate({
    draftId: "draft-unclassified",
    body,
    providerId: "qnb-egypt",
    verifiedSenderAlias: "QNB",
    messageFamily: null,
    currency: null,
    expectedOutcome: null,
    evidenceDigest: "digest-unclassified",
    authorization,
  });
}

describe("sanitizeQaSmsCandidate", () => {
  it.each(["EGP 10", "10 ج.م", "10 جم", "10 جنيه"])(
    "recognizes EGP currency literal in %s",
    (body) => {
      expect(containsQaSmsCurrencyLiteral(body, "EGP")).toBe(true);
      expect(containsQaSmsCurrencyLiteral(body, "USD")).toBe(false);
    }
  );

  it("prefills one unambiguous currency without confirming classification", () => {
    const egpDraft = sanitizeUnclassified("Amount EGP250 at QA SHOP");
    const usdDraft = sanitizeUnclassified("Amount of usd 15.00 at QA SHOP");

    expect(egpDraft.currency).toBe("EGP");
    expect(usdDraft.currency).toBe("USD");
    expect(egpDraft.classificationStatus).toBe("pending");
    expect(usdDraft.classificationStatus).toBe("pending");
  });

  it("does not prefill currency when the message contains mixed currencies", () => {
    const draft = sanitizeUnclassified(
      "Transaction EGP 250 with a displayed USD 5 equivalent"
    );

    expect(draft.currency).toBeNull();
    expect(draft.classificationStatus).toBe("pending");
  });

  it("does not restore currency after a non-financial classification", () => {
    const draft = sanitizeQaSmsCandidate({
      draftId: "draft-otp",
      body: "QNB OTP 123456 for an EGP 250 purchase",
      providerId: "qnb-egypt",
      verifiedSenderAlias: "QNB",
      messageFamily: "otp",
      currency: null,
      expectedOutcome: { kind: "rejection", reason: "otp" },
      evidenceDigest: "digest-otp",
      authorization,
    });

    expect(draft.currency).toBeNull();
    expect(draft.classificationStatus).toBe("confirmed");
  });

  it("replaces every canonical private value with ordered placeholders", () => {
    const draft = sanitize(
      "Card 4321 account 001234567890 used for EGP 123.45; balance EGP 987.65 at QA SHOP for TEST PERSON phone +201001234567 ref AB12345678 on 13/07/2026 14:35"
    );

    expect(draft.segments.filter(({ kind }) => kind === "placeholder")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ token: "CURRENCY" }),
        expect.objectContaining({ token: "LAST4" }),
        expect.objectContaining({ token: "ACCOUNT" }),
        expect.objectContaining({ token: "AMOUNT" }),
        expect.objectContaining({ token: "BALANCE" }),
        expect.objectContaining({ token: "MERCHANT" }),
        expect.objectContaining({ token: "PERSON" }),
        expect.objectContaining({ token: "PHONE" }),
        expect.objectContaining({ token: "REFERENCE" }),
        expect.objectContaining({ token: "DATE" }),
        expect.objectContaining({ token: "TIME" }),
      ])
    );
    expect(JSON.stringify(draft.segments)).not.toMatch(
      /123\.45|987\.65|4321|001234567890|201001234567|AB12345678|TEST PERSON|QA SHOP/
    );
  });

  it("normalizes Arabic-Indic digits and mixed-language dynamic values", () => {
    const draft = sanitize(
      "عملية شراء EGP ١٢٣٫٤٥ باستخدام البطاقة ٤٣٢١ لدى QA SHOP بتاريخ ١٣/٠٧/٢٠٢٦ ١٤:٣٥"
    );
    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "placeholder", token: "AMOUNT" }),
        expect.objectContaining({ kind: "placeholder", token: "LAST4" }),
        expect.objectContaining({ kind: "placeholder", token: "DATE" }),
        expect.objectContaining({ kind: "placeholder", token: "TIME" }),
      ])
    );
  });

  it("replaces Arabic merchant names after لدى", () => {
    const draft = sanitize("خصم EGP 250 لدى كارفور بتاريخ 14/07/26");

    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "placeholder", token: "MERCHANT" }),
      ])
    );
    expect(JSON.stringify(draft.segments)).not.toContain("كارفور");
  });

  it.each(["2PM", "2 PM", "02:30 PM"])(
    "replaces meridiem time %s before review",
    (time) => {
      const draft = sanitize(`Purchase completed at ${time}`);

      expect(draft.segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "placeholder", token: "TIME" }),
        ])
      );
      expect(JSON.stringify(draft.segments)).not.toContain(time);
    }
  );

  it("sanitizes the reviewed IPN date, time, reference, and account suffix structure", () => {
    const draft = sanitize(
      "IPN transfer sent with amount of EGP 999.99 from 1234 on 21/08 at 07:35 PM. Ref# QA9X7Z. For more details call 19000."
    );

    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "ACCOUNT",
          semanticRole: "source_account_suffix",
        }),
        expect.objectContaining({
          token: "DATE",
          semanticRole: "transaction_date",
        }),
        expect.objectContaining({
          token: "TIME",
          semanticRole: "transaction_time",
        }),
        expect.objectContaining({
          token: "REFERENCE",
          semanticRole: "transaction_reference",
        }),
      ])
    );
    expect(draft.status).toBe("draft");
    expect(JSON.stringify(draft.segments)).not.toMatch(
      /1234|21\/08|07:35|QA9X7Z|19000/
    );
  });

  it("sanitizes an outgoing IPN account suffix and Arabic counterparty", () => {
    const draft = sanitize(
      "Dear Client, you transferred EGP 1800.00 from 7660 to \u0625\u064a\u0647\u0627\u0628 \u0639\u0628\u062f\u0647 \u0646\u0641\u0627\u062f\u064a. Your transaction reference number is 6acc618b."
    );

    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "ACCOUNT",
          semanticRole: "source_account_suffix",
        }),
        expect.objectContaining({
          token: "PERSON",
          semanticRole: "counterparty_person",
        }),
        expect.objectContaining({
          token: "REFERENCE",
          semanticRole: "transaction_reference",
        }),
      ])
    );
    expect(draft.status).toBe("draft");
    expect(JSON.stringify(draft.segments)).not.toMatch(/7660|6acc618b/);
  });

  it("sanitizes Arabic bank-to-wallet amounts and provider hotlines", () => {
    const draft = sanitize(
      "\u062a\u0645 \u062a\u062d\u0648\u064a\u0644 \u0645\u0628\u0644\u063a:17634 \u062c\u0645 \u0645\u0646 \u062d\u0633\u0627\u0628\u0643 \u0648 \u0625\u0636\u0627\u0641\u062a\u0647 \u0644\u0645\u062d\u0641\u0638\u062a\u0643 \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a\u0629. \u064a\u0631\u062c\u0649 \u0627\u0644\u0627\u062a\u0635\u0627\u0644 \u0639\u0644\u0649 19700"
    );

    expect(draft.currency).toBe("EGP");
    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ token: "CURRENCY" }),
        expect.objectContaining({
          token: "AMOUNT",
          semanticRole: "transaction_amount",
        }),
        expect.objectContaining({
          token: "PHONE",
          semanticRole: "provider_hotline",
        }),
      ])
    );
    expect(draft.segments).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ token: "PERSON" })])
    );
    expect(draft.status).toBe("draft");
  });

  it("uses public variable roles for changing promotional values", () => {
    const draft = sanitize(
      "QNB offer 13.5% during 2024. Details https://example.test/offer. Terms ref 204899052."
    );

    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "PERCENTAGE",
          semanticRole: "promotional_rate",
        }),
        expect.objectContaining({
          token: "DATE",
          semanticRole: "campaign_year",
        }),
        expect.objectContaining({
          token: "URL",
          semanticRole: "public_url",
        }),
        expect.objectContaining({
          token: "REFERENCE",
          semanticRole: "public_reference",
        }),
      ])
    );
    expect(draft.status).toBe("draft");
  });

  it("does not treat generic Arabic account or information wording as a person", () => {
    const draft = sanitize(
      "\u0639\u0632\u064a\u0632\u064a \u0627\u0644\u0639\u0645\u064a\u0644 \u064a\u062a\u0645 \u0627\u0644\u062a\u0633\u0644\u064a\u0645 \u0645\u0646 \u062e\u0644\u0627\u0644 \u0634\u0631\u0643\u0629 \u0627\u0644\u0634\u062d\u0646. \u0644\u0645\u0632\u064a\u062f \u0645\u0646 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u062a\u0635\u0644 \u0628\u0627\u0644\u0628\u0646\u0643."
    );

    expect(draft.segments).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ token: "PERSON" }),
        expect.objectContaining({ token: "MERCHANT" }),
      ])
    );
    expect(draft.status).toBe("draft");
  });

  it("sanitizes the reviewed compact balance and at-sign merchant structure", () => {
    const draft = sanitize(
      "Your Debit Card **9876 had a Successful transaction of EGP 42.50 @QA STORE,your available bal.EGP12345.67 for lost/stolen card call 19000"
    );

    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "MERCHANT",
          semanticRole: "merchant_name",
        }),
        expect.objectContaining({
          token: "BALANCE",
          semanticRole: "available_balance",
        }),
        expect.objectContaining({
          token: "PHONE",
          semanticRole: "provider_hotline",
        }),
      ])
    );
    expect(JSON.stringify(draft.segments)).not.toMatch(
      /QA STORE|12345\.67|19000/
    );
    expect(
      draft.segments.filter(
        (segment) =>
          segment.kind === "placeholder" && segment.token === "CURRENCY"
      )
    ).toHaveLength(2);
    expect(
      draft.segments
        .filter((segment) => segment.kind === "fixed")
        .map(({ text }) => text)
        .join("")
    ).not.toContain("bal.EGP");
  });

  it("sanitizes a card-style ATM withdrawal without retaining terminal values", () => {
    const draft = sanitize(
      "Your Debit Card **9876 had a Successful transaction of EGP 3500.00 @TEST ATM812,your available bal.EGP17650.25 for lost/stolen card call 19000"
    );

    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ token: "LAST4" }),
        expect.objectContaining({ token: "AMOUNT" }),
        expect.objectContaining({
          token: "ATM_TERMINAL",
          semanticRole: "atm_terminal",
        }),
        expect.objectContaining({ token: "BALANCE" }),
        expect.objectContaining({ token: "PHONE" }),
      ])
    );
    expect(JSON.stringify(draft.segments)).not.toMatch(
      /9876|3500\.00|TEST ATM812|17650\.25|19000/
    );
  });

  it("sanitizes an ATM location descriptor with a trailing terminal code", () => {
    const draft = sanitize(
      "Your Debit Card **9876 had a Successful transaction of EGP 3500.00 @ATM-QA DISTRICT-TEST-Z55,your available bal.EGP17650.25"
    );

    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "ATM_TERMINAL",
          semanticRole: "atm_terminal",
        }),
      ])
    );
    expect(draft.segments).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ token: "MERCHANT" })])
    );
    expect(JSON.stringify(draft.segments)).not.toContain(
      "ATM-QA DISTRICT-TEST-Z55"
    );
  });

  it("sanitizes an explicit ATM-prefixed descriptor without a numeric code", () => {
    const draft = sanitize(
      "Your Debit Card **9876 had a Successful transaction of EGP 3500.00 @ATM-Inter,your available bal.EGP17650.25"
    );

    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "ATM_TERMINAL",
          semanticRole: "atm_terminal",
        }),
      ])
    );
    expect(draft.segments).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ token: "MERCHANT" })])
    );
    expect(JSON.stringify(draft.segments)).not.toContain("ATM-Inter");
  });

  it("keeps ordinary at-sign purchase counterparties as merchants", () => {
    const draft = sanitize(
      "Your Debit Card **9876 had a Successful transaction of EGP 42.50 @QA STORE,your available bal.EGP12345.67"
    );

    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "MERCHANT",
          semanticRole: "merchant_name",
        }),
      ])
    );
    expect(draft.segments).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ token: "ATM_TERMINAL" }),
      ])
    );
  });

  it("keeps an ATM-named merchant without a terminal code as a merchant", () => {
    const draft = sanitize(
      "Your Debit Card **9876 had a Successful transaction of EGP 42.50 @ATM CAFE,your available bal.EGP12345.67"
    );

    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "MERCHANT",
          semanticRole: "merchant_name",
        }),
      ])
    );
    expect(draft.segments).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ token: "ATM_TERMINAL" }),
      ])
    );
  });

  it("sanitizes compact currency amounts without treating ordinary prose as a person", () => {
    const draft = sanitize(
      "Dear customer, Amount of EGP275000 was debited from your account for cash withdrawal. For More Information, please call 19000."
    );

    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "CURRENCY",
          semanticRole: "transaction_currency",
        }),
        expect.objectContaining({
          token: "AMOUNT",
          semanticRole: "transaction_amount",
        }),
        expect.objectContaining({
          token: "PHONE",
          semanticRole: "provider_hotline",
        }),
      ])
    );
    expect(draft.segments).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "PERSON",
          semanticRole: "counterparty_person",
        }),
      ])
    );
    expect(JSON.stringify(draft.segments)).not.toMatch(/275000|19000/);
    expect(JSON.stringify(draft.segments)).toContain("your account");
    expect(JSON.stringify(draft.segments)).toContain("More Information");
  });

  it("replaces a complete transaction date without leaving a partial fragment", () => {
    const draft = sanitize("Transfer completed on 14/07/26");

    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "DATE",
          semanticRole: "transaction_date",
        }),
      ])
    );
    expect(JSON.stringify(draft.segments)).not.toMatch(/14\/0|7\/26/);
  });

  it("replaces mixed-case transfer counterparties after bare prepositions", () => {
    const draft = sanitize("Transfer EGP 250 to Test Person");

    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: "PERSON",
          semanticRole: "counterparty_person",
        }),
      ])
    );
    expect(JSON.stringify(draft.segments)).not.toContain("Test Person");
  });

  it("replaces integer currency amounts and letter-only references", () => {
    const draft = sanitize("Offer EGP 500 or USD 1,500 with reference ABCDEF");

    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "placeholder", token: "AMOUNT" }),
        expect.objectContaining({ kind: "placeholder", token: "REFERENCE" }),
      ])
    );
    expect(JSON.stringify(draft.segments)).not.toMatch(/500|1,500|ABCDEF/);
  });

  it("replaces labeled OTP codes with an otp_code reference", () => {
    const draft = sanitize("QNB OTP: 369154 at Orange for EGP 1572");

    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "placeholder",
          token: "REFERENCE",
          semanticRole: "otp_code",
        }),
        expect.objectContaining({ kind: "placeholder", token: "MERCHANT" }),
        expect.objectContaining({ kind: "placeholder", token: "CURRENCY" }),
        expect.objectContaining({ kind: "placeholder", token: "AMOUNT" }),
      ])
    );
    expect(draft.status).toBe("draft");
    expect(JSON.stringify(draft.segments)).not.toContain("369154");
  });

  it("replaces contextual short provider hotlines with a phone placeholder", () => {
    const draft = sanitize("For lost/stolen card call 18564");

    expect(draft.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "placeholder",
          token: "PHONE",
          semanticRole: "provider_hotline",
        }),
      ])
    );
    expect(draft.status).toBe("draft");
    expect(JSON.stringify(draft.segments)).not.toContain("18564");
  });

  it("keeps unlabeled short numeric values blocked", () => {
    const draft = sanitize("Use value 18564");

    expect(draft.status).toBe("blocked");
    expect(draft.validationFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unknown_dynamic_value" }),
      ])
    );
  });

  it("blocks ambiguous and unknown residual dynamic spans", () => {
    const draft = sanitize(
      "Purchase values 123.45 and 456.78 with code ZX987654"
    );
    expect(draft.status).toBe("blocked");
    expect(draft.validationFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ambiguous_dynamic_value" }),
      ])
    );
  });

  it("returns immutable corrections and invalidates validation and approval", () => {
    const draft = {
      ...sanitize("Purchase EGP 123.45 at QA SHOP on 13/07/2026 14:35"),
      status: "approved" as const,
      validationFindings: [],
    };
    const originalSegments = draft.segments;
    const placeholderIndex = draft.segments.findIndex(
      (segment) =>
        segment.kind === "placeholder" && segment.token === "MERCHANT"
    );
    const corrected = applyQaPlaceholderCorrection(draft, {
      segmentIndex: placeholderIndex,
      token: "PERSON",
      semanticRole: "counterparty_person",
    });

    expect(corrected).not.toBe(draft);
    expect(corrected.segments).not.toBe(originalSegments);
    expect(corrected.status).toBe("draft");
    expect(corrected.validationFindings).toEqual([]);
    expect(draft.status).toBe("approved");
  });

  it("sanitizes 50 synthetic messages within one second", () => {
    const startedAt = performance.now();
    for (let index = 0; index < 50; index += 1) {
      sanitize(
        `Purchase EGP ${100 + index}.25 card 4321 at QA SHOP on 13/07/2026 14:35`
      );
    }
    expect(performance.now() - startedAt).toBeLessThan(1000);
  });
});
