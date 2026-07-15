import type { QaSanitizedCandidateDraft } from "../qa-sms-pattern-types";
import {
  classifyQaSmsDraft,
  isQaSmsCurrencySupportedForFamily,
} from "../qa-sms-draft-classification";

const draft = {
  draftId: "draft-1",
  verifiedSenderAlias: "QNB",
  providerId: "qnb-egypt",
  messageFamily: null,
  currency: null,
  expectedOutcome: null,
  classificationStatus: "pending",
  segments: [{ kind: "fixed", text: "Safe fixed wording" }],
  evidenceDigest: "digest-1",
  authorization: {
    version: 1,
    authorizationClass: "qa_operator_explicit",
    authorizedAt: "2026-07-13T00:00:00.000Z",
    providerScope: "qnb-egypt",
    currencyScope: ["EGP", "USD"],
    messageFamilyScope: ["card_purchase", "otp"],
  },
  validationFindings: [],
  status: "draft",
} satisfies QaSanitizedCandidateDraft;

describe("classifyQaSmsDraft", () => {
  it("maps an operator-confirmed financial family to a review-only outcome", () => {
    const classified = classifyQaSmsDraft(draft, {
      messageFamily: "card_purchase",
      currency: "EGP",
    });

    expect(classified).not.toBe(draft);
    expect(classified).toMatchObject({
      messageFamily: "card_purchase",
      currency: "EGP",
      classificationStatus: "confirmed",
      status: "draft",
      expectedOutcome: {
        kind: "transaction",
        direction: "expense",
        confidenceCeiling: 0.8,
        reviewStatus: "needs_review",
      },
    });
  });

  it.each(["incoming_ipn_transfer", "outgoing_ipn_transfer"] as const)(
    "requires only the amount placeholder for %s templates",
    (messageFamily) => {
      const classified = classifyQaSmsDraft(draft, {
        messageFamily,
        currency: "EGP",
      });

      expect(classified.expectedOutcome).toMatchObject({
        kind: "transaction",
        requiredPlaceholderRoles: ["transaction_amount"],
        reviewReasons: ["candidate_pattern", "transfer_accounts_required"],
      });
    }
  );

  it("classifies a bank-to-wallet message as a review-only transfer", () => {
    const classified = classifyQaSmsDraft(draft, {
      messageFamily: "bank_to_wallet_transfer",
      currency: "EGP",
    });

    expect(classified.expectedOutcome).toMatchObject({
      kind: "transfer",
      direction: "bank_to_wallet",
      requiredPlaceholderRoles: ["transaction_amount"],
      reviewStatus: "needs_review",
      reviewReasons: ["candidate_pattern", "transfer_accounts_required"],
    });
  });

  it("rejects USD for the EGP-only bank-to-wallet family", () => {
    expect(
      isQaSmsCurrencySupportedForFamily("bank_to_wallet_transfer", "EGP")
    ).toBe(true);
    expect(
      isQaSmsCurrencySupportedForFamily("bank_to_wallet_transfer", "USD")
    ).toBe(false);
    expect(() =>
      classifyQaSmsDraft(draft, {
        messageFamily: "bank_to_wallet_transfer",
        currency: "USD",
      })
    ).toThrow("currency_not_supported_for_message_family");
  });

  it.each(["otp", "informational", "promotional"] as const)(
    "allows Not applicable only for %s",
    (messageFamily) => {
      expect(
        classifyQaSmsDraft(draft, { messageFamily, currency: null })
      ).toMatchObject({
        messageFamily,
        currency: null,
        expectedOutcome: { kind: "rejection", reason: messageFamily },
      });
    }
  );

  it("rejects a missing currency for financial families", () => {
    expect(() =>
      classifyQaSmsDraft(draft, {
        messageFamily: "atm_withdrawal",
        currency: null,
      })
    ).toThrow("currency_required_for_financial_family");
  });

  it("rejects currency for non-financial families", () => {
    expect(() =>
      classifyQaSmsDraft(draft, { messageFamily: "otp", currency: "USD" })
    ).toThrow("currency_not_applicable_for_non_financial_family");
  });

  it("invalidates prior approval when classification changes", () => {
    const approved = {
      ...draft,
      status: "approved",
      validationFindings: [
        {
          code: "required_placeholder_missing",
          severity: "blocking",
          segmentIndex: null,
          messageKey: "qaSmsIntake.privacy.required_placeholder_missing",
          semanticRole: "transaction_amount",
        },
      ],
    } as const;
    const classified = classifyQaSmsDraft(approved, {
      messageFamily: "incoming_ipn_transfer",
      currency: "USD",
    });
    expect(classified.status).toBe("draft");
    expect(classified.validationFindings).toEqual([]);
  });

  it("preserves blocking sanitizer findings when classification changes", () => {
    const blocked = {
      ...draft,
      status: "blocked",
      validationFindings: [
        {
          code: "unknown_dynamic_value",
          severity: "blocking",
          segmentIndex: null,
          messageKey: "qaSmsIntake.privacy.unknown_dynamic_value",
          semanticRole: null,
        },
      ],
    } as const;

    const classified = classifyQaSmsDraft(blocked, {
      messageFamily: "informational",
      currency: null,
    });

    expect(classified.status).toBe("blocked");
    expect(classified.validationFindings).toEqual(blocked.validationFindings);
  });
});
