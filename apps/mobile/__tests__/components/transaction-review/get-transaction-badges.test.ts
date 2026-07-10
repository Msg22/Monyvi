import { getTransactionBadges } from "@/components/transaction-review/get-transaction-badges";
import type { TransactionReviewMeta } from "@/services/transaction-review-selection";

function reviewMeta(
  overrides: Partial<TransactionReviewMeta>
): TransactionReviewMeta {
  return {
    isAutoSelectable: false,
    reasons: [],
    ...overrides,
  };
}

describe("getTransactionBadges", () => {
  it("shows the localized parser review reason", () => {
    const badges = getTransactionBadges(
      false,
      reviewMeta({ reasons: ["low_confidence"] }),
      false
    );

    expect(badges).toContainEqual({
      labelKey: "review_badge_low_confidence",
      color: "amber",
    });
  });

  it("shows a generic badge for parser review signals without a specific mapping", () => {
    const badges = getTransactionBadges(
      false,
      reviewMeta({ reasons: ["parser_review"] }),
      false
    );

    expect(badges).toContainEqual({
      labelKey: "review_badge_needs_review",
      color: "amber",
    });
  });

  it("marks selected safe rows as auto-selected", () => {
    const badges = getTransactionBadges(
      false,
      reviewMeta({ isAutoSelectable: true }),
      true
    );

    expect(badges).toEqual([
      {
        labelKey: "review_badge_auto_selected",
        color: "emerald",
      },
    ]);
  });
});
