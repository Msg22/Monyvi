import {
  getPrimaryTransactionBadge,
  getTransactionBadges,
} from "@/components/transaction-review/get-transaction-badges";
import type { TransactionReviewMeta } from "@/contracts/transaction-review";

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

  it("describes the cash-account confirmation needed for ATM withdrawals", () => {
    expect(
      getPrimaryTransactionBadge(
        false,
        reviewMeta({ reasons: ["cash_transfer"] }),
        false
      )
    ).toEqual({
      labelKey: "review_badge_confirm_cash_account",
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

  it("prioritizes missing account or category blockers over advisory reasons", () => {
    expect(
      getPrimaryTransactionBadge(
        false,
        reviewMeta({
          reasons: ["cash_transfer", "low_confidence", "account_needed"],
        }),
        false
      )
    ).toEqual({
      labelKey: "review_badge_account_needed",
      color: "red",
    });
  });

  it("prioritizes save-blocking missing information over parser reasons", () => {
    expect(
      getPrimaryTransactionBadge(
        true,
        reviewMeta({ reasons: ["low_confidence"] }),
        false
      )
    ).toEqual({
      labelKey: "review_badge_missing_info",
      color: "red",
    });
  });
});
