import type { ReviewableTransaction } from "@monyvi/logic";
import { getTransactionBadges } from "@/components/transaction-review/get-transaction-badges";

const baseTransaction: ReviewableTransaction = {
  amount: 1299,
  currency: "EGP",
  type: "EXPENSE",
  counterparty: "AMAZON.EG",
  date: new Date(2026, 3, 8),
  categoryId: "cat-shopping",
  categoryDisplayName: "Shopping",
  confidence: 0.94,
  originLabel: "CIB",
  source: "SMS",
};

describe("getTransactionBadges", () => {
  it("shows needs-review for explicit parser review metadata even with high confidence", () => {
    const badges = getTransactionBadges(
      {
        ...baseTransaction,
        reviewStatus: "needs_review",
        reviewReasons: ["low_confidence"],
      },
      false
    );

    expect(badges).toContainEqual({
      label: "Needs Review",
      color: "amber",
    });
  });

  it("keeps high-confidence auto-selectable rows unbadged when no review signal exists", () => {
    const badges = getTransactionBadges(
      {
        ...baseTransaction,
        reviewStatus: "auto_selectable",
        reviewReasons: [],
      },
      false
    );

    expect(badges).toEqual([]);
  });
});
