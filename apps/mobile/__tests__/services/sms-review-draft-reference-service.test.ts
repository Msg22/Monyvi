import type { ParsedSmsTransaction } from "@monyvi/logic";

import type { SmsReviewDraftReadItem } from "@/services/sms-review-draft-repository";
import { revalidateSmsReviewDraftReferences } from "@/services/sms-review-draft-reference-service";

const mockAssertExpectedCurrentUser = jest.fn<Promise<void>, [string]>();
const mockAccountFetch = jest.fn<Promise<readonly { id: string }[]>, []>();
const mockCategoryFetch = jest.fn<Promise<readonly { id: string }[]>, []>();
const mockGetCurrentUserDataScope = jest.fn();

jest.mock("@monyvi/db", () => ({
  database: {
    get: (table: string): string => table,
  },
  Account: class Account {},
  Category: class Category {},
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    where: (...args: readonly unknown[]): readonly unknown[] => args,
  },
}));

jest.mock("@/services/user-data-access", () => ({
  assertExpectedCurrentUser: (userId: string): Promise<void> =>
    mockAssertExpectedCurrentUser(userId),
  getCurrentUserDataScope: (): unknown => mockGetCurrentUserDataScope(),
}));

function createTransaction(
  overrides: Partial<ParsedSmsTransaction> = {}
): ParsedSmsTransaction {
  return {
    amount: 100,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Merchant",
    date: new Date("2026-07-27T12:00:00.000Z"),
    categoryId: "category-1",
    categoryDisplayName: "Shopping",
    confidence: 0.95,
    originLabel: "QNB EGYPT",
    source: "SMS",
    smsFingerprint: "fingerprint-1",
    senderDisplayName: "QNB EGYPT",
    rawSmsBody: "message",
    ...overrides,
  };
}

function createItem(transaction: ParsedSmsTransaction): SmsReviewDraftReadItem {
  return {
    draftId: "draft-1",
    queueId: "queue-1",
    transaction,
    selectionOverride: null,
    position: 0,
    parsedAt: new Date("2026-07-27T12:00:00.000Z"),
    updatedAt: new Date("2026-07-27T12:00:00.000Z"),
  };
}

describe("revalidateSmsReviewDraftReferences", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAssertExpectedCurrentUser.mockResolvedValue();
    mockAccountFetch.mockResolvedValue([{ id: "account-1" }]);
    mockCategoryFetch.mockResolvedValue([{ id: "category-1" }]);
    mockGetCurrentUserDataScope.mockResolvedValue({
      userId: "user-1",
      queryOwned: () => ({ fetch: mockAccountFetch }),
      queryAccessibleCategories: () => ({ fetch: mockCategoryFetch }),
    });
  });

  it("defers a missing account to the normal SMS account matcher", async () => {
    const [result] = await revalidateSmsReviewDraftReferences(
      [createItem(createTransaction({ accountId: undefined }))],
      "user-1"
    );

    expect(result?.hardValidationReasons).toEqual([]);
  });

  it("rejects inaccessible referenced account and category IDs", async () => {
    const [result] = await revalidateSmsReviewDraftReferences(
      [
        createItem(
          createTransaction({
            accountId: "foreign-account",
            categoryId: "foreign-category",
          })
        ),
      ],
      "user-1"
    );

    expect(result?.hardValidationReasons).toEqual([
      "account_unavailable",
      "category_unavailable",
    ]);
  });

  it("accepts a durable pending account referenced by its temporary ID", async () => {
    const [result] = await revalidateSmsReviewDraftReferences(
      [
        createItem(
          createTransaction({
            accountId: "pending-qnb",
            pendingAccount: {
              tempId: "pending-qnb",
              name: "QNB EGYPT",
              currency: "EGP",
              type: "BANK",
              senderDisplayName: "QNB EGYPT",
            },
          })
        ),
      ],
      "user-1"
    );

    expect(result?.hardValidationReasons).toEqual([]);
  });

  it("rejects an inaccessible ATM destination account", async () => {
    const [result] = await revalidateSmsReviewDraftReferences(
      [
        createItem(
          createTransaction({
            accountId: "account-1",
            isAtmWithdrawal: true,
            toAccountId: "deleted-cash-account",
          })
        ),
      ],
      "user-1"
    );

    expect(result?.hardValidationReasons).toEqual([
      "destination_account_unavailable",
    ]);
  });

  it("fails closed when the current-user scope changes", async () => {
    mockGetCurrentUserDataScope.mockResolvedValue({
      userId: "user-2",
      queryOwned: () => ({ fetch: mockAccountFetch }),
      queryAccessibleCategories: () => ({ fetch: mockCategoryFetch }),
    });

    await expect(
      revalidateSmsReviewDraftReferences(
        [createItem(createTransaction())],
        "user-1"
      )
    ).rejects.toThrow("sms_review_draft_user_scope_changed");
  });
});
