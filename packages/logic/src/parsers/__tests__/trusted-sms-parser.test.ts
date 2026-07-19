import { activateTrustedSmsCatalog } from "../trusted-sms-catalog-activation";
import { parseSmsWithTrustedCatalog } from "../trusted-sms-parser";
import { QNB_EGYPT_TRUSTED_SMS_CATALOG } from "../trusted-sms-patterns";
import type {
  TrustedSmsParserCandidate,
  TrustedSmsPattern,
} from "../trusted-sms-pattern-types";
import { renderTrustedPattern } from "./fixtures/trusted-sms/trusted-sms-builders";

function candidate(
  patternId: string,
  overrides: Record<string, string> = {}
): {
  readonly pattern: TrustedSmsPattern;
  readonly value: TrustedSmsParserCandidate;
} {
  const pattern = QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns.find(
    ({ patternId: id }) => id === patternId
  );
  if (pattern === undefined)
    throw new Error(`missing_test_pattern:${patternId}`);
  return {
    pattern,
    value: {
      candidateId: `candidate-${patternId}`,
      smsFingerprint: `fingerprint-${patternId}`,
      sender: pattern.verifiedSenderAliases[0] ?? "QNB EGYPT",
      body: renderTrustedPattern(pattern, overrides),
      receivedAtMs: new Date(2026, 6, 13, 15, 0).getTime(),
    },
  };
}

describe("trusted SMS parser", () => {
  const activation = activateTrustedSmsCatalog(QNB_EGYPT_TRUSTED_SMS_CATALOG);

  it("maps an exact purchase to a review-only transaction", () => {
    const { value } = candidate("qnb-egypt-card-purchase-egp-v1", {
      transaction_amount: "16.79",
      merchant_name: "myfawry",
      card_last4: "2132",
    });

    const result = parseSmsWithTrustedCatalog({
      candidates: [value],
      activation,
      supportedCurrencies: ["EGP", "USD"],
    });

    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]).toMatchObject({
      status: "matched",
      candidateId: value.candidateId,
      smsFingerprint: value.smsFingerprint,
      transaction: {
        amount: 16.79,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "myfawry",
        categorySystemName: "other",
        reviewStatus: "needs_review",
        reviewReasons: ["low_confidence"],
        cardLast4: "2132",
        messageFamily: "card_purchase",
        parserSource: "trusted_local",
      },
    });
  });

  it("maps the approved online-banking transfer request to a review-only expense", () => {
    const { value } = candidate(
      "qnb-egypt-outgoing-online-banking-transfer-egp-v1",
      { transaction_amount: "125.50" }
    );

    const result = parseSmsWithTrustedCatalog({
      candidates: [value],
      activation,
      supportedCurrencies: ["EGP"],
    });

    expect(result.outcomes[0]).toMatchObject({
      status: "matched",
      transaction: {
        amount: 125.5,
        currency: "EGP",
        type: "EXPENSE",
        counterparty: "",
        categorySystemName: "other",
        confidence: 0.8,
        reviewStatus: "needs_review",
        reviewReasons: ["low_confidence"],
        messageFamily: "outgoing_bank_transfer",
        parserSource: "trusted_local",
      },
    });
  });

  it("maps ATM semantics without persisting the terminal as counterparty", () => {
    const { value } = candidate("qnb-egypt-atm-card-egp-v1", {
      atm_terminal: "ATM-Inter",
    });

    const result = parseSmsWithTrustedCatalog({
      candidates: [value],
      activation,
      supportedCurrencies: ["EGP"],
    });

    expect(result.outcomes[0]).toMatchObject({
      status: "matched",
      transaction: {
        counterparty: "",
        isAtmWithdrawal: true,
        messageFamily: "atm_withdrawal",
        reviewReasons: ["low_confidence", "cash_transfer_review"],
      },
    });
  });

  it("combines reviewed date and time placeholders with the received year", () => {
    const { value } = candidate("qnb-egypt-incoming-ipn-egp-v1", {
      transaction_date: "13/07",
      transaction_time: "01:05 PM",
    });

    const result = parseSmsWithTrustedCatalog({
      candidates: [value],
      activation,
      supportedCurrencies: ["EGP"],
    });

    expect(result.outcomes[0]).toMatchObject({
      status: "matched",
      transaction: {
        categorySystemName: "income_other",
        date: new Date(2026, 6, 13, 13, 5),
        type: "INCOME",
      },
    });
  });

  it("does not infer a transaction date from date-like merchant text", () => {
    const { value } = candidate("qnb-egypt-card-purchase-egp-v1", {
      merchant_name: "7/11",
    });

    const result = parseSmsWithTrustedCatalog({
      candidates: [value],
      activation,
      supportedCurrencies: ["EGP"],
    });

    expect(result.outcomes[0]).toMatchObject({
      status: "matched",
      transaction: { date: new Date(value.receivedAtMs) },
    });
  });

  it("preserves rejected and unresolved candidate identities", () => {
    const otp = candidate("qnb-egypt-otp-card-purchase-v1").value;
    const unknown = {
      ...otp,
      candidateId: "unknown",
      smsFingerprint: "fp-unknown",
      body: "Unknown template",
    };

    const result = parseSmsWithTrustedCatalog({
      candidates: [otp, unknown],
      activation,
      supportedCurrencies: ["EGP", "USD"],
    });

    expect(result.outcomes).toEqual([
      expect.objectContaining({
        status: "rejected",
        candidateId: otp.candidateId,
        smsFingerprint: otp.smsFingerprint,
        reason: "otp",
      }),
      {
        status: "unresolved",
        candidateId: "unknown",
        smsFingerprint: "fp-unknown",
        reason: "no_match",
        patternIds: [],
      },
    ]);
  });

  it("fails closed when the catalog is inactive", () => {
    const { value } = candidate("qnb-egypt-card-purchase-egp-v1");

    const result = parseSmsWithTrustedCatalog({
      candidates: [value],
      activation: {
        status: "invalid",
        catalogVersion: null,
        patterns: [],
        issues: [{ code: "test" }],
      },
      supportedCurrencies: ["EGP"],
    });

    expect(result.outcomes[0]).toEqual({
      status: "catalog_error",
      candidateId: value.candidateId,
      smsFingerprint: value.smsFingerprint,
      reason: "catalog_inactive",
    });
  });
});
