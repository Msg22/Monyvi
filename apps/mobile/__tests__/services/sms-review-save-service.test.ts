import { prepareSavePayload } from "@/services/sms-review-save-service";
import type { TransactionEdits } from "@/services/sms-edit-modal-service";
import type { ReviewableTransaction } from "@monyvi/logic";

jest.mock("@/services/pending-account-service", () => ({
  persistPendingAccounts: jest.fn(),
}));

jest.mock("@/services/account-service", () => ({
  ensureCashAccount: jest.fn(),
}));

function createTransaction(): ReviewableTransaction {
  return {
    amount: 100,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Shop",
    date: new Date("2026-07-01T12:00:00.000Z"),
    categoryId: "cat-food",
    categoryDisplayName: "Food",
    confidence: 0.99,
    originLabel: "NBE",
    source: "SMS",
  };
}

function createOverride(
  accountId: string,
  overrides: Partial<TransactionEdits> = {}
): TransactionEdits {
  return {
    accountId,
    accountName: "Chosen account",
    accountConfirmed: true,
    amount: 100,
    categoryId: "cat-food",
    type: "EXPENSE",
    ...overrides,
  };
}

describe("prepareSavePayload", () => {
  it("rejects an unresolved fallback account match", async () => {
    const result = await prepareSavePayload({
      selectedIndices: new Set([0]),
      transactionOverrides: new Map(),
      accountMatches: new Map([
        [
          0,
          {
            accountId: "acc-default",
            accountName: "Default account",
            matchReason: "default",
          },
        ],
      ]),
      pendingAccounts: [],
      effectiveTransactions: [createTransaction()],
      userId: "user-1",
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        reason: "missing_accounts",
        missingIndices: new Set([0]),
      })
    );
  });

  it("accepts an explicit account override over an unresolved fallback", async () => {
    const result = await prepareSavePayload({
      selectedIndices: new Set([0]),
      transactionOverrides: new Map([[0, createOverride("acc-chosen")]]),
      accountMatches: new Map([
        [
          0,
          {
            accountId: "acc-default",
            accountName: "Default account",
            matchReason: "default",
          },
        ],
      ]),
      pendingAccounts: [],
      effectiveTransactions: [createTransaction()],
      userId: "user-1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.transactionAccountMap).toEqual(
        new Map([[0, "acc-chosen"]])
      );
    }
  });

  it("rejects an unchanged fallback account override without confirmation", async () => {
    const result = await prepareSavePayload({
      selectedIndices: new Set([0]),
      transactionOverrides: new Map([
        [0, createOverride("acc-default", { accountConfirmed: false })],
      ]),
      accountMatches: new Map([
        [
          0,
          {
            accountId: "acc-default",
            accountName: "Default account",
            matchReason: "default",
          },
        ],
      ]),
      pendingAccounts: [],
      effectiveTransactions: [createTransaction()],
      userId: "user-1",
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        reason: "missing_accounts",
        missingIndices: new Set([0]),
      })
    );
  });

  it("accepts an explicitly confirmed fallback account override", async () => {
    const result = await prepareSavePayload({
      selectedIndices: new Set([0]),
      transactionOverrides: new Map([[0, createOverride("acc-default")]]),
      accountMatches: new Map([
        [
          0,
          {
            accountId: "acc-default",
            accountName: "Default account",
            matchReason: "default",
          },
        ],
      ]),
      pendingAccounts: [],
      effectiveTransactions: [createTransaction()],
      userId: "user-1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.transactionAccountMap).toEqual(
        new Map([[0, "acc-default"]])
      );
    }
  });
});
