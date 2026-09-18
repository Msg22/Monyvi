import { validateTransactionForm } from "@/validation/transaction-validation";

const transaction = {
  amount: "100",
  accountId: "account-1",
  categoryId: "category-1",
};

describe("transaction recurring-name validation", () => {
  it.each(["EXPENSE", "INCOME"] as const)(
    "requires a non-blank recurring name for %s",
    (type) => {
      for (const recurringName of [undefined, "", " \t\n "]) {
        const data = { ...transaction, isRecurring: true, recurringName };

        expect(validateTransactionForm(type, data)).toEqual({
          isValid: false,
          errors: {
            recurringName: "Enter a name for this recurring payment.",
          },
        });
      }
    }
  );

  it("uses caller-provided localized recurring-name guidance", () => {
    const data = { ...transaction, isRecurring: true, recurringName: " " };
    const messages = {
      accountRequired: "Account is required",
      recurringNameRequired: "أدخل اسمًا للدفعة المتكررة.",
    };

    expect(validateTransactionForm("EXPENSE", data, messages)).toEqual({
      isValid: false,
      errors: { recurringName: messages.recurringNameRequired },
    });
  });

  it("accepts a named recurring payment", () => {
    const data = {
      ...transaction,
      isRecurring: true,
      recurringName: "  Internet bill  ",
    };

    expect(validateTransactionForm("EXPENSE", data)).toEqual({
      isValid: true,
      errors: {},
    });
  });

  it("keeps a name optional when recurring is disabled or absent", () => {
    for (const isRecurring of [false, undefined]) {
      const data = { ...transaction, isRecurring, recurringName: "" };

      expect(validateTransactionForm("EXPENSE", data)).toEqual({
        isValid: true,
        errors: {},
      });
    }
  });

  it("does not apply remembered recurring fields to transfers", () => {
    const data = {
      amount: "100",
      fromAccountId: "account-1",
      toAccountId: "account-2",
      isRecurring: true,
      recurringName: "",
    };

    expect(validateTransactionForm("TRANSFER", data)).toEqual({
      isValid: true,
      errors: {},
    });
  });
});
