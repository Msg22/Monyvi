import {
  buildPendingAccount,
  buildTransactionEdits,
  isDuplicateAccount,
} from "@/services/sms-edit-modal-service";
import type { AccountWithBankDetails } from "@/services/sms-account-matcher";

describe("sms-edit-modal-service", () => {
  function buildAccount(
    overrides: Partial<AccountWithBankDetails> = {}
  ): AccountWithBankDetails {
    return {
      id: "account-1",
      name: "Main",
      currency: "EGP",
      isDefault: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      type: "BANK",
      institutionId: "cib",
      smsSenderNames: [],
      bankName: "CIB",
      ...overrides,
    };
  }

  it("infers wallet pending accounts from known wallet senders", () => {
    const pendingAccount = buildPendingAccount("temp-wallet-1", {
      name: "Vodafone Cash",
      currency: "EGP",
      senderDisplayName: "VodafoneCash",
    });

    expect(pendingAccount).toMatchObject({
      tempId: "temp-wallet-1",
      type: "DIGITAL_WALLET",
      institutionId: "vodafone-cash",
      providerDisplayName: "Vodafone Cash",
    });
  });

  it("carries known bank identity into SMS-created pending accounts", () => {
    const pendingAccount = buildPendingAccount("temp-bank-1", {
      name: "CIB Bank",
      currency: "EGP",
      senderDisplayName: "CIB-EGYPT",
    });

    expect(pendingAccount).toMatchObject({
      tempId: "temp-bank-1",
      type: "BANK",
      institutionId: "cib",
      providerDisplayName: "CIB",
    });
  });

  it("keeps unknown SMS-created pending accounts as bank accounts", () => {
    const pendingAccount = buildPendingAccount("temp-bank-1", {
      name: "Unknown Bank",
      currency: "EGP",
      senderDisplayName: "UNKNOWN",
      cardLast4: "1234",
    });

    expect(pendingAccount).toMatchObject({
      tempId: "temp-bank-1",
      type: "BANK",
      cardLast4: "1234",
    });
    expect(pendingAccount.institutionId).toBeUndefined();
    expect(pendingAccount.providerDisplayName).toBeUndefined();
  });

  it("allows SMS-created accounts with the same name and currency for different known providers", () => {
    expect(
      isDuplicateAccount("Main", "EGP", [buildAccount()], [], {
        institutionId: "nbe",
        providerDisplayName: "NBE",
      })
    ).toBe(false);
  });

  it("rejects SMS-created accounts with the same provider-aware uniqueness key", () => {
    expect(
      isDuplicateAccount(" Main ", "EGP", [buildAccount()], [], {
        institutionId: "cib",
        providerDisplayName: "CIB",
      })
    ).toBe(true);
  });

  it("normalizes manual provider names when checking SMS-created duplicates", () => {
    expect(
      isDuplicateAccount(
        "Main",
        "EGP",
        [
          buildAccount({
            institutionId: undefined,
            bankName: "Manual   Bank",
          }),
        ],
        [],
        {
          providerDisplayName: " manual bank ",
        }
      )
    ).toBe(true);
  });

  it("preserves explicit account and category confirmations in edits", () => {
    expect(
      buildTransactionEdits({
        accountId: "account-1",
        accountName: "Main",
        accountConfirmed: true,
        categoryId: "cat-food",
        categoryConfirmed: true,
        amount: 100,
        type: "EXPENSE",
      })
    ).toMatchObject({
      accountConfirmed: true,
      categoryConfirmed: true,
    });
  });

  it("does not confirm an untouched account field", () => {
    expect(
      buildTransactionEdits({
        accountId: "account-1",
        accountName: "Main",
        categoryId: "cat-food",
        categoryConfirmed: false,
        amount: 100,
        type: "EXPENSE",
      }).accountConfirmed
    ).toBeUndefined();
  });

  it("clears a stale category confirmation only after an automatic category reset", () => {
    expect(
      buildTransactionEdits({
        accountId: "account-1",
        accountName: "Main",
        categoryId: "cat-income",
        categoryConfirmed: false,
        shouldClearCategoryConfirmation: true,
        amount: 100,
        type: "INCOME",
      }).categoryConfirmed
    ).toBe(false);

    expect(
      buildTransactionEdits({
        accountId: "account-1",
        accountName: "Main",
        categoryId: "cat-food",
        categoryConfirmed: false,
        shouldClearCategoryConfirmation: false,
        amount: 100,
        type: "EXPENSE",
      }).categoryConfirmed
    ).toBeUndefined();
  });
});
