import {
  buildAutoSelectedIndices,
  getEditedTransactionReviewMeta,
  getTransactionReviewMeta,
  resolveEditedAccountMatch,
} from "@/services/transaction-review-selection";
import type { ReviewableTransaction } from "@monyvi/logic";

function createTransaction(
  overrides: Partial<ReviewableTransaction> = {}
): ReviewableTransaction {
  return {
    amount: 100,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Shop",
    date: new Date("2026-07-01T12:00:00.000Z"),
    categoryId: "cat-food",
    categoryDisplayName: "Food",
    confidence: 0.95,
    originLabel: "NBE",
    source: "SMS",
    deduplicationHash: "sms-fingerprint-1",
    ...overrides,
  };
}

describe("transaction-review-selection", () => {
  it("auto-selects only high-confidence transactions with a resolved account", () => {
    const transactions = [
      createTransaction({ confidence: 0.95 }),
      createTransaction({ confidence: 0.8 }),
      createTransaction({ confidence: 0.79 }),
      createTransaction({ confidence: 0.95 }),
    ];
    const accountMatches = new Map([
      [
        0,
        { accountId: "acc-1", accountName: "Bank", matchReason: "sms_sender" },
      ],
      [
        1,
        { accountId: "acc-1", accountName: "Bank", matchReason: "sms_sender" },
      ],
      [
        2,
        { accountId: "acc-1", accountName: "Bank", matchReason: "sms_sender" },
      ],
      [3, { accountId: null, accountName: null, matchReason: "none" }],
    ]);

    expect(buildAutoSelectedIndices(transactions, accountMatches)).toEqual(
      new Set([0])
    );
  });

  it("keeps ATM withdrawals and missing-category rows in needs review", () => {
    const atmWithdrawal = {
      ...createTransaction({ confidence: 0.99 }),
      isAtmWithdrawal: true,
    };
    const missingCategory = createTransaction({
      categoryId: undefined as unknown as string,
    });
    const accountMatch = {
      accountId: "acc-1",
      accountName: "Bank",
      matchReason: "sms_sender",
    };

    expect(getTransactionReviewMeta(atmWithdrawal, accountMatch)).toEqual({
      isAutoSelectable: false,
      reasons: ["cash_transfer"],
    });
    expect(getTransactionReviewMeta(missingCategory, accountMatch)).toEqual({
      isAutoSelectable: false,
      reasons: ["category_needed"],
    });
  });

  it("resolves ATM review only after the cash destination is explicitly confirmed", () => {
    const atmWithdrawal: ReviewableTransaction & {
      readonly isAtmWithdrawal: true;
    } = {
      ...createTransaction({
        confidence: 0.99,
        reviewStatus: "needs_review",
        reviewReasons: ["cash_transfer_review"],
      }),
      isAtmWithdrawal: true,
    };
    const accountMatch = {
      accountId: "bank-1",
      matchReason: "sms_sender",
    };

    expect(
      getEditedTransactionReviewMeta(atmWithdrawal, accountMatch, {
        amount: 100,
        categoryId: "cat-food",
        type: "EXPENSE",
        accountId: "bank-1",
        toAccountConfirmed: true,
      })
    ).toEqual({ isAutoSelectable: true, reasons: [] });
  });

  it("does not auto-select rows that only fell back to a default account", () => {
    const transaction = createTransaction({ confidence: 0.99 });
    const defaultMatch = {
      accountId: "acc-default",
      accountName: "Default bank",
      matchReason: "default",
    };

    expect(getTransactionReviewMeta(transaction, defaultMatch)).toEqual({
      isAutoSelectable: false,
      reasons: ["account_needed"],
    });
  });

  it("keeps an unchanged fallback account unresolved after another field is edited", () => {
    const defaultMatch = {
      accountId: "acc-default",
      accountName: "Default bank",
      matchReason: "default",
    };

    expect(resolveEditedAccountMatch(defaultMatch, "acc-default")).toEqual({
      accountId: "acc-default",
      matchReason: "default",
    });
    expect(resolveEditedAccountMatch(defaultMatch, "acc-chosen")).toEqual({
      accountId: "acc-chosen",
      matchReason: "account_name",
    });
  });

  it("treats an explicitly confirmed fallback account as resolved", () => {
    const defaultMatch = {
      accountId: "acc-default",
      accountName: "Default bank",
      matchReason: "default",
    };

    expect(
      resolveEditedAccountMatch(defaultMatch, "acc-default", true)
    ).toEqual({
      accountId: "acc-default",
      matchReason: "account_name",
    });
  });

  it("returns all review reasons when more than one safety condition fails", () => {
    const transaction = {
      ...createTransaction({ confidence: 0.4 }),
      isAtmWithdrawal: true,
    };

    expect(getTransactionReviewMeta(transaction, undefined)).toEqual({
      isAutoSelectable: false,
      reasons: ["cash_transfer", "low_confidence", "account_needed"],
    });
  });

  it("clears parser reasons for missing fields after the user resolves them", () => {
    const transaction = createTransaction({
      confidence: 0.99,
      reviewStatus: "needs_review",
      reviewReasons: ["account_needed", "category_needed"],
    });
    const accountMatch = {
      accountId: "acc-1",
      accountName: "Bank",
      matchReason: "sms_sender",
    };

    expect(
      getTransactionReviewMeta(transaction, accountMatch, {
        hasCategoryOverride: true,
      })
    ).toEqual({
      isAutoSelectable: true,
      reasons: [],
    });
  });

  it("keeps parser category-needed reasons until the user chooses a category", () => {
    const transaction = createTransaction({
      confidence: 0.99,
      reviewStatus: "needs_review",
      reviewReasons: ["category_needed"],
    });
    const accountMatch = {
      accountId: "acc-1",
      accountName: "Bank",
      matchReason: "sms_sender",
    };

    expect(getTransactionReviewMeta(transaction, accountMatch)).toEqual({
      isAutoSelectable: false,
      reasons: ["category_needed"],
    });
  });

  it("does not treat a prefilled category as an explicit category choice", () => {
    const currentTransaction = createTransaction({
      categoryId: "cat-food",
      reviewStatus: "needs_review",
      reviewReasons: ["category_needed"],
    });
    const accountMatch = {
      accountId: "acc-1",
      accountName: "Bank",
      matchReason: "sms_sender",
    };

    expect(
      getEditedTransactionReviewMeta(currentTransaction, accountMatch, {
        amount: 100,
        categoryId: "cat-food",
        type: "EXPENSE",
        accountId: "acc-1",
        accountConfirmed: true,
        categoryConfirmed: false,
      })
    ).toEqual({
      isAutoSelectable: false,
      reasons: ["category_needed"],
    });
  });

  it("clears category-needed only after an explicit category choice", () => {
    const currentTransaction = createTransaction({
      categoryId: "cat-food",
      reviewStatus: "needs_review",
      reviewReasons: ["category_needed"],
    });
    const accountMatch = {
      accountId: "acc-1",
      accountName: "Bank",
      matchReason: "sms_sender",
    };

    expect(
      getEditedTransactionReviewMeta(currentTransaction, accountMatch, {
        amount: 100,
        categoryId: "cat-food",
        type: "EXPENSE",
        accountId: "acc-1",
        accountConfirmed: true,
        categoryConfirmed: true,
      })
    ).toEqual({
      isAutoSelectable: true,
      reasons: [],
    });
  });

  it("preserves ambiguous amounts as a field-specific review reason", () => {
    const transaction = createTransaction({
      confidence: 0.99,
      reviewStatus: "needs_review",
      reviewReasons: ["ambiguous_amount"],
    });
    const accountMatch = {
      accountId: "acc-1",
      accountName: "Bank",
      matchReason: "sms_sender",
    };

    expect(getTransactionReviewMeta(transaction, accountMatch)).toEqual({
      isAutoSelectable: false,
      reasons: ["amount_review"],
    });
  });
});
