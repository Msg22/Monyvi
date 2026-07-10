import type { AccountWithBankDetails } from "@/services/sms-account-matcher";

const mockFetchAccountsWithDetails = jest.fn<
  Promise<readonly AccountWithBankDetails[]>,
  [string, string?]
>();
const mockMatchAccountCore = jest.fn();
const mockExtractCardLast4 = jest.fn<string | null, [string]>();

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve("user-1"),
}));

jest.mock("@/services/sms-account-matcher", () => ({
  extractCardLast4: (smsBody: string): string | null =>
    mockExtractCardLast4(smsBody),
  fetchAccountsWithDetails: (
    userId: string,
    accountType?: string
  ): Promise<readonly AccountWithBankDetails[]> =>
    mockFetchAccountsWithDetails(userId, accountType),
  matchAccountCore: (...args: readonly unknown[]): unknown =>
    mockMatchAccountCore(...args),
}));

import { resolveAccountForSms } from "@/services/sms-account-resolver";

describe("sms-account-resolver", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExtractCardLast4.mockReturnValue(null);
    mockMatchAccountCore.mockReturnValue({
      accountId: "wallet-1",
      accountName: "Vodafone wallet",
      matchReason: "sms_sender",
    });
  });

  it("passes bank and wallet accounts to live SMS matching", async () => {
    const bankAccount: AccountWithBankDetails = {
      id: "bank-1",
      name: "CIB",
      currency: "EGP",
      isDefault: false,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      type: "BANK",
      smsSenderNames: ["CIB"],
    };
    const walletAccount: AccountWithBankDetails = {
      id: "wallet-1",
      name: "Vodafone wallet",
      currency: "EGP",
      isDefault: false,
      createdAt: new Date("2026-01-01T00:00:01Z"),
      type: "DIGITAL_WALLET",
      smsSenderNames: ["VodafoneCash"],
    };
    const cashAccount: AccountWithBankDetails = {
      id: "cash-1",
      name: "Cash",
      currency: "EGP",
      isDefault: false,
      createdAt: new Date("2026-01-01T00:00:02Z"),
      type: "CASH",
      smsSenderNames: [],
    };
    mockFetchAccountsWithDetails.mockResolvedValue([
      bankAccount,
      walletAccount,
      cashAccount,
    ]);

    const result = await resolveAccountForSms(
      "VodafoneCash",
      "Payment 100 EGP",
      "EGP"
    );

    expect(mockFetchAccountsWithDetails).toHaveBeenCalledWith(
      "user-1",
      undefined
    );
    expect(mockMatchAccountCore).toHaveBeenCalledWith(
      {
        senderDisplayName: "VodafoneCash",
        cardLast4: undefined,
        currency: "EGP",
      },
      [bankAccount, walletAccount]
    );
    expect(result).toEqual({
      accountId: "wallet-1",
      accountName: "Vodafone wallet",
    });
  });

  it("prefers the parsed card hint over re-extracting the raw SMS", async () => {
    mockFetchAccountsWithDetails.mockResolvedValue([]);

    await resolveAccountForSms(
      "QNB",
      "Purchase EGP 100 on card **** 4321",
      "EGP",
      "4321"
    );

    expect(mockExtractCardLast4).not.toHaveBeenCalled();
    expect(mockMatchAccountCore).toHaveBeenCalledWith(
      expect.objectContaining({ cardLast4: "4321" }),
      []
    );
  });
});
