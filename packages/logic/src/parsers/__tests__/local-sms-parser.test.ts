import { parseSmsWithLocalParser } from "../local-sms-parser";
import type {
  LocalSmsCandidate,
  LocalSmsParserRequest,
} from "../local-sms-parser-types";
import type { CategoryMapSource } from "../../utils/ai-parser-utils";

const RECEIVED_AT_MS = new Date(2026, 3, 8, 14, 30).getTime();

const categories: readonly CategoryMapSource[] = [
  { id: "cat-other", systemName: "other", displayName: "Other" },
  { id: "cat-shopping", systemName: "shopping", displayName: "Shopping" },
  { id: "cat-salary", systemName: "salary", displayName: "Salary" },
];

function candidate(
  body: string,
  overrides: Partial<LocalSmsCandidate> = {}
): LocalSmsCandidate {
  return {
    messageId: "sms-1",
    sender: "NBE",
    body,
    receivedAtMs: RECEIVED_AT_MS,
    smsFingerprint: "fingerprint-1",
    ...overrides,
  };
}

function request(
  candidates: readonly LocalSmsCandidate[],
  overrides: Partial<LocalSmsParserRequest> = {}
): LocalSmsParserRequest {
  return {
    candidates,
    categories,
    supportedCurrencies: ["EGP", "USD"],
    ...overrides,
  };
}

describe("parseSmsWithLocalParser", () => {
  it("returns a configuration error for missing categories", () => {
    const result = parseSmsWithLocalParser(request([], { categories: [] }));

    expect(result.error?.kind).toBe("invalid_categories");
    expect(result.transactions).toEqual([]);
  });

  it("returns a configuration error for unsupported currencies", () => {
    const result = parseSmsWithLocalParser(
      request([], { supportedCurrencies: ["EUR"] })
    );

    expect(result.error?.kind).toBe("invalid_supported_currencies");
  });

  it("parses a dev/test debit purchase template", () => {
    const result = parseSmsWithLocalParser(
      request([
        candidate(
          "Purchase EGP 250.00 on card **** 4321 at CARREFOUR CAIRO on 08/04 14:23. Avail bal EGP 12,430.55"
        ),
      ])
    );

    expect(result.error).toBeUndefined();
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      amount: 250,
      currency: "EGP",
      type: "EXPENSE",
      counterparty: "CARREFOUR CAIRO",
      categorySystemName: "shopping",
      confidence: 0.96,
      reviewStatus: "auto_selectable",
      reviewReasons: [],
      cardLast4: "4321",
      parserSource: "local",
      patternId: "nbe-debit-purchase",
      patternRuntimeScope: "dev_test",
    });
    expect(result.matchedPatternIds).toEqual(["nbe-debit-purchase"]);
  });

  it("extracts the required review fields from supported fixture patterns", () => {
    const result = parseSmsWithLocalParser(
      request([
        candidate(
          "CIB: EGP 1,299.00 charged on your credit card ending 9988 at AMAZON.EG on 08-APR-2026. Bal: EGP 4,201.00",
          { sender: "CIB", messageId: "sms-cib", smsFingerprint: "fp-cib" }
        ),
        candidate(
          "QNB Alahli: ATM cash withdrawal EGP 2,000.00 from card **** 5566 on 08/04/2026 15:02. Avail bal EGP 8,000.00",
          { sender: "QNB", messageId: "sms-atm", smsFingerprint: "fp-atm" }
        ),
      ])
    );

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({
      amount: 1299,
      currency: "EGP",
      type: "EXPENSE",
      counterparty: "AMAZON.EG",
      categorySystemName: "shopping",
      cardLast4: "9988",
      patternRuntimeScope: "dev_test",
      reviewStatus: "needs_review",
      reviewReasons: ["low_confidence"],
    });
    expect(result.transactions[0]?.date).toEqual(new Date(2026, 3, 8));
    expect(result.transactions[1]).toMatchObject({
      amount: 2000,
      currency: "EGP",
      type: "EXPENSE",
      counterparty: "ATM Withdrawal",
      categorySystemName: "other",
      isAtmWithdrawal: true,
      cardLast4: "5566",
      patternRuntimeScope: "dev_test",
      reviewStatus: "needs_review",
      reviewReasons: ["cash_transfer_review"],
    });
  });

  it("falls back to the received timestamp when slash dates are invalid", () => {
    const result = parseSmsWithLocalParser(
      request([
        candidate(
          "Purchase EGP 250.00 on card **** 4321 at CARREFOUR CAIRO on 31/02 14:23. Avail bal EGP 12,430.55"
        ),
      ])
    );

    expect(result.transactions[0]?.date).toEqual(new Date(RECEIVED_AT_MS));
  });

  it("falls back to the received timestamp when month-name dates are invalid", () => {
    const result = parseSmsWithLocalParser(
      request([
        candidate(
          "CIB: EGP 1,299.00 charged on your credit card ending 9988 at AMAZON.EG on 31-FEB-2026. Bal: EGP 4,201.00",
          { sender: "CIB" }
        ),
      ])
    );

    expect(result.transactions[0]?.date).toEqual(new Date(RECEIVED_AT_MS));
  });

  it("parses dates from broad dev/test bank patterns", () => {
    const result = parseSmsWithLocalParser(
      request([
        candidate(
          "Purchase EGP 100.00 on card **** 4321 at TEST MART on 08/04 14:23. Avail bal EGP 2,000.00",
          { sender: "QNB" }
        ),
      ])
    );

    expect(result.transactions[0]).toMatchObject({
      amount: 100,
      counterparty: "TEST MART",
      patternId: "egypt-bank-card-purchase",
    });
    expect(result.transactions[0]?.date).toEqual(new Date(2026, 3, 8, 14, 23));
  });

  it("keeps broad bank purchases without account evidence in review", () => {
    const result = parseSmsWithLocalParser(
      request([
        candidate("Purchase EGP 100.00 at TEST MART on 08/04 14:23", {
          sender: "QNB",
        }),
      ])
    );

    expect(result.transactions[0]).toMatchObject({
      amount: 100,
      counterparty: "TEST MART",
      reviewStatus: "needs_review",
      reviewReasons: ["account_needed"],
      patternId: "egypt-bank-card-purchase",
    });
  });

  it("keeps the live fixture merchant separate from card hints", () => {
    const result = parseSmsWithLocalParser(
      request([
        candidate(
          "Purchase EGP 63.21 at BACKGROUND LIVE SMS TEST using card ending 1234",
          { sender: "QNB" }
        ),
      ])
    );

    expect(result.transactions[0]).toMatchObject({
      amount: 63.21,
      counterparty: "BACKGROUND LIVE SMS TEST",
      cardLast4: "1234",
    });
  });

  it("returns deterministic results for repeated parses", () => {
    const sms = candidate(
      "Purchase EGP 250.00 on card **** 4321 at CARREFOUR CAIRO on 08/04 14:23. Avail bal EGP 12,430.55"
    );

    const outputs = Array.from(
      { length: 10 },
      () => parseSmsWithLocalParser(request([sms])).transactions[0]
    );

    expect(new Set(outputs.map((output) => JSON.stringify(output))).size).toBe(
      1
    );
  });

  it("marks ATM withdrawals as requiring review", () => {
    const result = parseSmsWithLocalParser(
      request([
        candidate(
          "QNB Alahli: ATM cash withdrawal EGP 2,000.00 from card **** 5566 on 08/04/2026 15:02. Avail bal EGP 8,000.00",
          { sender: "QNB" }
        ),
      ])
    );

    expect(result.transactions[0]).toMatchObject({
      amount: 2000,
      reviewStatus: "needs_review",
      reviewReasons: ["cash_transfer_review"],
      isAtmWithdrawal: true,
      cardLast4: "5566",
    });
  });

  it("meets the phase-1 fixture acceptance metrics", () => {
    const supported = [
      candidate(
        "Purchase EGP 250.00 on card **** 4321 at CARREFOUR CAIRO on 08/04 14:23. Avail bal EGP 12,430.55",
        { messageId: "supported-1", smsFingerprint: "fp-supported-1" }
      ),
      candidate(
        "CIB: EGP 1,299.00 charged on your credit card ending 9988 at AMAZON.EG on 08-APR-2026. Bal: EGP 4,201.00",
        {
          sender: "CIB",
          messageId: "supported-2",
          smsFingerprint: "fp-supported-2",
        }
      ),
      candidate(
        "QNB Alahli: ATM cash withdrawal EGP 2,000.00 from card **** 5566 on 08/04/2026 15:02. Avail bal EGP 8,000.00",
        {
          sender: "QNB",
          messageId: "supported-3",
          smsFingerprint: "fp-supported-3",
        }
      ),
      candidate(
        "Purchase EGP 63.21 at BACKGROUND LIVE SMS TEST using card ending 1234",
        {
          sender: "QNB",
          messageId: "supported-4",
          smsFingerprint: "fp-supported-4",
        }
      ),
    ];
    const unsupported = [
      candidate("Your OTP is 123456 for card purchase verification", {
        messageId: "unsupported-1",
        smsFingerprint: "fp-unsupported-1",
      }),
      candidate("Get cashback offer on wallet payments this weekend", {
        messageId: "unsupported-2",
        smsFingerprint: "fp-unsupported-2",
      }),
      candidate("Your monthly statement is ready", {
        messageId: "unsupported-3",
        smsFingerprint: "fp-unsupported-3",
      }),
      candidate("Card wallet transfer balance EGP 500 reminder", {
        messageId: "unsupported-4",
        smsFingerprint: "fp-unsupported-4",
      }),
    ];

    const supportedResult = parseSmsWithLocalParser(request(supported));
    const unsupportedResult = parseSmsWithLocalParser(request(unsupported));

    const supportedSuggestionRate =
      supportedResult.transactions.length / supported.length;
    const unsupportedRejectionRate =
      unsupportedResult.unsupportedCount / unsupported.length;

    expect(supportedSuggestionRate).toBeGreaterThanOrEqual(0.85);
    expect(unsupportedRejectionRate).toBeGreaterThanOrEqual(0.95);
    expect(supportedResult.error).toBeUndefined();
    expect(unsupportedResult.error).toBeUndefined();
  });

  it("ignores unsupported messages instead of inventing a suggestion", () => {
    const result = parseSmsWithLocalParser(
      request([
        candidate("Your Vodafone data bundle expires in 2 days", {
          sender: "VODAFONE",
        }),
      ])
    );

    expect(result.transactions).toEqual([]);
    expect(result.unsupportedCount).toBe(1);
  });

  it.each([
    "Your OTP is 123456 for card purchase verification",
    "Get cashback offer on wallet payments this weekend",
    "Your card activation is complete",
    "Transaction failed for EGP 200 at TEST SHOP",
    "Your monthly statement is ready",
  ])("runs negative classification before extraction for %s", (body) => {
    const result = parseSmsWithLocalParser(request([candidate(body)]));

    expect(result.transactions).toEqual([]);
    expect(result.unsupportedCount).toBe(1);
  });

  it("does not create suggestions from broad financial keywords alone", () => {
    const result = parseSmsWithLocalParser(
      request([
        candidate(
          "Card balance transfer wallet cashback EGP 500 account reminder"
        ),
      ])
    );

    expect(result.transactions).toEqual([]);
  });

  it("does not parse the generic live fixture shape from unknown senders", () => {
    const result = parseSmsWithLocalParser(
      request([
        candidate(
          "Purchase EGP 63.21 at BACKGROUND LIVE SMS TEST using card ending 1234",
          { sender: "PROMO" }
        ),
      ])
    );

    expect(result.transactions).toEqual([]);
    expect(result.unsupportedCount).toBe(1);
  });

  it("keeps requests text-only without audio payload fields", () => {
    const sms = candidate("Purchase EGP 25 at TEST using card ending 1234");

    expect(Object.keys(sms)).not.toContain("audioUri");
    expect(Object.keys(sms)).not.toContain("audioBase64");
  });
});
