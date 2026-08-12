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
  it("uses review-details copy for non-specific low confidence", () => {
    const badges = getTransactionBadges(
      false,
      reviewMeta({ reasons: ["low_confidence"] }),
      false
    );

    expect(badges).toContainEqual({
      labelKey: "review_badge_review_details",
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
      labelKey: "review_badge_review_details",
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
      labelKey: "review_badge_review_cash_account",
      color: "amber",
    });
  });

  it("describes an ambiguous amount without a generic warning", () => {
    expect(
      getPrimaryTransactionBadge(
        false,
        reviewMeta({ reasons: ["amount_review"] }),
        false
      )
    ).toEqual({
      labelKey: "review_badge_review_amount",
      color: "amber",
    });
  });

  it("shows review category when category is the only concern", () => {
    expect(
      getPrimaryTransactionBadge(
        false,
        reviewMeta({ reasons: ["category_needed"] }),
        false
      )
    ).toEqual({
      labelKey: "review_badge_review_category",
      color: "red",
    });
  });

  it("shows review details when category and another concern need review", () => {
    expect(
      getPrimaryTransactionBadge(
        false,
        reviewMeta({ reasons: ["category_needed", "account_needed"] }),
        false
      )
    ).toEqual({
      labelKey: "review_badge_review_details",
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

  it("prioritizes concrete account guidance over generic missing information", () => {
    expect(
      getPrimaryTransactionBadge(
        true,
        reviewMeta({
          reasons: ["cash_transfer", "low_confidence", "account_needed"],
        }),
        false
      )
    ).toEqual({
      labelKey: "review_badge_review_account",
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
