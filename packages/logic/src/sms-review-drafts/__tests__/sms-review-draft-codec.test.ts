import type { ParsedSmsTransaction } from "../../types";
import {
  decodeSmsReviewDraft,
  encodeSmsReviewDraft,
  SmsReviewDraftCodecError,
  type SmsReviewDraftCodecErrorCode,
} from "../sms-review-draft-codec";

function createTransaction(
  overrides: Partial<ParsedSmsTransaction> = {}
): ParsedSmsTransaction {
  return {
    amount: 490,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Fawry Market",
    date: new Date("2026-07-27T09:12:00.000Z"),
    categoryId: "category-shopping",
    categoryDisplayName: "Shopping",
    confidence: 0.98,
    originLabel: "QNB EGYPT",
    source: "SMS",
    deduplicationHash: "fingerprint-1",
    accountId: "account-qnb",
    merchant: "Fawry Market",
    reviewStatus: "auto_selectable",
    reviewReasons: [],
    smsFingerprint: "fingerprint-1",
    senderDisplayName: "QNB EGYPT",
    rawSmsBody: "Your Debit Card had a transaction.",
    isAtmWithdrawal: false,
    cardLast4: "2132",
    ...overrides,
  };
}


const invalidPayloadCases: readonly [
  SmsReviewDraftCodecErrorCode,
  { readonly version: number; readonly json: string },
][] = [
  ["unsupported_version", { version: 2, json: "{}" }],
  ["malformed_payload", { version: 1, json: "not-json" }],
  [
    "invalid_date",
    {
      version: 1,
      json: JSON.stringify({
        version: 1,
        transaction: {
          ...JSON.parse(encodeSmsReviewDraft(createTransaction()).json).transaction,
          date: "not-a-date",
        },
      }),
    },
  ],
];

describe("SMS review draft codec", () => {
  it("round-trips the complete V1 payload and restores Date", () => {
    const transaction = createTransaction();

    const encoded = encodeSmsReviewDraft(transaction);
    const decoded = decodeSmsReviewDraft({
      version: encoded.version,
      json: encoded.json,
      expectedFingerprint: transaction.smsFingerprint,
    });

    expect(encoded.version).toBe(1);
    expect(decoded).toEqual(transaction);
    expect(decoded.date).toBeInstanceOf(Date);
  });

  it("serializes equivalent input deterministically", () => {
    const transaction = createTransaction();

    expect(encodeSmsReviewDraft(transaction)).toEqual(
      encodeSmsReviewDraft({ ...transaction, date: new Date(transaction.date) })
    );
  });

  it.each(invalidPayloadCases)(
    "rejects %s without exposing payload content",
    (code, input) => {
    expect(() =>
      decodeSmsReviewDraft({
        ...input,
        expectedFingerprint: "fingerprint-1",
      })
    ).toThrow(
      expect.objectContaining({
        code,
        message: expect.not.stringContaining("Your Debit Card"),
      })
    );
  });

  it("rejects a fingerprint mismatch", () => {
    const encoded = encodeSmsReviewDraft(createTransaction());

    expect(() =>
      decodeSmsReviewDraft({
        ...encoded,
        expectedFingerprint: "different-fingerprint",
      })
    ).toThrow(
      expect.objectContaining({
        code: "fingerprint_mismatch",
      })
    );
  });

  it.each([
    createTransaction({ amount: Number.POSITIVE_INFINITY }),
    createTransaction({ confidence: Number.NaN }),
    createTransaction({ smsFingerprint: "" }),
  ])("rejects invalid financial values and identifiers", (transaction) => {
    expect(() => encodeSmsReviewDraft(transaction)).toThrow(
      SmsReviewDraftCodecError
    );
  });
});
