import type { ReviewableTransaction } from "@monyvi/logic";

import { resolveTransactionReviewProvider } from "@/utils/transaction-review-provider";

function transaction(
  overrides: Partial<ReviewableTransaction> & {
    readonly senderDisplayName?: string;
  } = {}
): ReviewableTransaction {
  return {
    amount: 100,
    currency: "EGP",
    type: "EXPENSE",
    date: new Date("2026-07-12T10:00:00.000Z"),
    categoryId: "cat-food",
    categoryDisplayName: "Food",
    confidence: 0.98,
    originLabel: "QNBALAHLI",
    source: "SMS",
    ...overrides,
  };
}

describe("transaction review provider presentation", () => {
  it("resolves a known SMS sender to the shared institution asset", () => {
    expect(
      resolveTransactionReviewProvider(
        transaction({ senderDisplayName: "VodafoneCash" })
      )?.institutionId
    ).toBe("vodafone-cash");
  });

  it("falls back to the origin label when sender metadata is unavailable", () => {
    expect(
      resolveTransactionReviewProvider(
        transaction({ originLabel: "QNBALAHLI" })
      )?.institutionId
    ).toBe("qnb-egypt");
  });

  it("does not invent a provider for voice or unknown senders", () => {
    expect(
      resolveTransactionReviewProvider(
        transaction({ source: "VOICE", originLabel: "Voice" })
      )
    ).toBeNull();
    expect(
      resolveTransactionReviewProvider(transaction({ originLabel: "UNKNOWN" }))
    ).toBeNull();
  });
});
