import type { CurrencyType, TransactionType } from "@monyvi/db";
import { validateTransactionForm } from "@/validation/transaction-validation";

type ValidateTransactionForm = (
  type: TransactionType | "TRANSFER",
  data:
    | {
        readonly amount: string;
        readonly accountId: string | null;
        readonly categoryId: string;
      }
    | {
        readonly amount: string;
        readonly fromAccountId: string | null;
        readonly toAccountId: string | null;
      },
  messages?: Record<string, string>,
  options?: { readonly currency?: CurrencyType }
) => ReturnType<typeof validateTransactionForm>;

const validateWithOptions =
  validateTransactionForm as unknown as ValidateTransactionForm;

describe("validateTransactionForm", () => {
  // ---------------------------------------------------------------------------
  // EXPENSE / INCOME validation (baseTransactionSchema)
  // ---------------------------------------------------------------------------
  describe("EXPENSE type", () => {
    const validPayload = {
      amount: "150",
      accountId: "acc-1",
      categoryId: "cat-1",
    };

    it("should pass with a valid payload", () => {
      const result = validateTransactionForm("EXPENSE", validPayload);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it("should fail when amount is empty", () => {
      const result = validateTransactionForm("EXPENSE", {
        ...validPayload,
        amount: "",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBeDefined();
    });

    it("should fail when amount is zero", () => {
      const result = validateTransactionForm("EXPENSE", {
        ...validPayload,
        amount: "0",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBe("Amount must be greater than 0");
    });

    it("should fail when amount is negative", () => {
      const result = validateTransactionForm("EXPENSE", {
        ...validPayload,
        amount: "-5",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBe("Amount must be greater than 0");
    });

    it("should fail when amount is non-numeric", () => {
      const result = validateTransactionForm("EXPENSE", {
        ...validPayload,
        amount: "abc",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBe("Please enter a valid amount");
    });

    it("should fail when amount contains trailing calculator operators", () => {
      const result = validateTransactionForm("EXPENSE", {
        ...validPayload,
        amount: "12+",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBe("Please enter a valid amount");
    });

    it("should fail when amount is not finite", () => {
      const result = validateTransactionForm("EXPENSE", {
        ...validPayload,
        amount: "Infinity",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBe("Please enter a valid amount");
    });

    it("should fail when amount exceeds 1 billion", () => {
      const result = validateTransactionForm("EXPENSE", {
        ...validPayload,
        amount: "2000000000",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBe("Amount must be at most 1,000,000,000");
    });

    it("should fail when accountId is empty", () => {
      const result = validateTransactionForm("EXPENSE", {
        ...validPayload,
        accountId: "",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.accountId).toBeDefined();
    });

    it("should fail with required account copy when accountId is null", () => {
      const result = validateTransactionForm("EXPENSE", {
        ...validPayload,
        accountId: null,
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.accountId).toBe("Account is required");
    });

    it("should use localized required account copy when provided", () => {
      const result = validateTransactionForm(
        "EXPENSE",
        {
          ...validPayload,
          accountId: null,
        },
        { accountRequired: "localized account required" }
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.accountId).toBe("localized account required");
    });

    it("should fail when categoryId is empty", () => {
      const result = validateTransactionForm("EXPENSE", {
        ...validPayload,
        categoryId: "",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.categoryId).toBeDefined();
    });

    it("uses the shared strict amount grammar", () => {
      expect(
        validateWithOptions(
          "EXPENSE",
          { ...validPayload, amount: "1,234.50" },
          undefined,
          { currency: "EGP" }
        ).isValid
      ).toBe(true);

      for (const amount of [
        "12,5",
        "1,23",
        "1,2345",
        "1e3",
        "+5",
        "NaN",
        "1.2.3",
        "12abc",
        "12.",
      ]) {
        const result = validateWithOptions(
          "EXPENSE",
          { ...validPayload, amount },
          undefined,
          { currency: "EGP" }
        );

        expect(result.isValid).toBe(false);
        expect(result.errors.amount).toBe("Please enter a valid amount");
      }
    });

    it("uses the selected account currency precision without rounding", () => {
      expect(
        validateWithOptions(
          "EXPENSE",
          { ...validPayload, amount: "12.34" },
          undefined,
          { currency: "EGP" }
        ).isValid
      ).toBe(true);
      expect(
        validateWithOptions(
          "EXPENSE",
          { ...validPayload, amount: "12.345" },
          undefined,
          { currency: "EGP" }
        ).errors.amount
      ).toBe("Amount must have at most 2 decimal places");
      expect(
        validateWithOptions(
          "EXPENSE",
          { ...validPayload, amount: "12.345" },
          undefined,
          { currency: "KWD" }
        ).isValid
      ).toBe(true);
      expect(
        validateWithOptions(
          "EXPENSE",
          { ...validPayload, amount: "12.3456" },
          undefined,
          { currency: "KWD" }
        ).errors.amount
      ).toBe("Amount must have at most 3 decimal places");
      expect(
        validateWithOptions(
          "EXPENSE",
          { ...validPayload, amount: "0.12345678" },
          undefined,
          { currency: "BTC" }
        ).isValid
      ).toBe(true);
      expect(
        validateWithOptions(
          "EXPENSE",
          { ...validPayload, amount: "0.123456789" },
          undefined,
          { currency: "BTC" }
        ).errors.amount
      ).toBe("Amount must have at most 8 decimal places");
    });

    it("uses localized precision copy when provided", () => {
      const messages = {
        amountPrecision: (precision: number): string =>
          `localized precision ${precision}`,
      } as unknown as Parameters<typeof validateTransactionForm>[2];

      const result = validateTransactionForm(
        "EXPENSE",
        { ...validPayload, amount: "12.345" },
        messages,
        { currency: "EGP" }
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBe("localized precision 2");
    });

    it("accepts the exact transaction maximum and rejects values above it", () => {
      expect(
        validateWithOptions(
          "EXPENSE",
          { ...validPayload, amount: "1,000,000,000" },
          undefined,
          { currency: "EGP" }
        ).isValid
      ).toBe(true);
      expect(
        validateWithOptions(
          "EXPENSE",
          { ...validPayload, amount: "1000000000.01" },
          undefined,
          { currency: "EGP" }
        ).errors.amount
      ).toBe("Amount must be at most 1,000,000,000");
    });

    it("should accept decimal amounts", () => {
      const result = validateTransactionForm("EXPENSE", {
        ...validPayload,
        amount: "99.99",
      });
      expect(result.isValid).toBe(true);
    });
  });

  describe("INCOME type", () => {
    it("should pass with a valid payload", () => {
      const result = validateTransactionForm("INCOME", {
        amount: "5000",
        accountId: "acc-2",
        categoryId: "cat-salary",
      });
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // TRANSFER validation (transferSchema)
  // ---------------------------------------------------------------------------
  describe("TRANSFER type", () => {
    const validTransfer = {
      amount: "500",
      fromAccountId: "acc-from",
      toAccountId: "acc-to",
    };

    it("should pass with a valid payload", () => {
      const result = validateTransactionForm("TRANSFER", validTransfer);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it("should fail when amount is empty", () => {
      const result = validateTransactionForm("TRANSFER", {
        ...validTransfer,
        amount: "",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBeDefined();
    });

    it("should fail when amount is zero", () => {
      const result = validateTransactionForm("TRANSFER", {
        ...validTransfer,
        amount: "0",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBe("Amount must be greater than 0");
    });

    it("rejects comma-decimal input in transfers", () => {
      const result = validateWithOptions(
        "TRANSFER",
        { ...validTransfer, amount: "12,5" },
        undefined,
        { currency: "EGP" }
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBe("Please enter a valid amount");
    });

    it("should fail when amount is not finite", () => {
      const result = validateTransactionForm("TRANSFER", {
        ...validTransfer,
        amount: "Infinity",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBe("Please enter a valid amount");
    });

    it("should fail when fromAccountId is empty", () => {
      const result = validateTransactionForm("TRANSFER", {
        ...validTransfer,
        fromAccountId: "",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.fromAccountId).toBeDefined();
    });

    it("should fail with required source account copy when fromAccountId is null", () => {
      const result = validateTransactionForm("TRANSFER", {
        ...validTransfer,
        fromAccountId: null,
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.fromAccountId).toBe("Source account is required");
    });

    it("should fail when toAccountId is empty", () => {
      const result = validateTransactionForm("TRANSFER", {
        ...validTransfer,
        toAccountId: "",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.toAccountId).toBeDefined();
    });

    it("should fail with required destination account copy when toAccountId is null", () => {
      const result = validateTransactionForm("TRANSFER", {
        ...validTransfer,
        toAccountId: null,
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.toAccountId).toBe("Destination account is required");
    });

    it("should use localized transfer account copy when provided", () => {
      const result = validateTransactionForm(
        "TRANSFER",
        {
          ...validTransfer,
          fromAccountId: null,
          toAccountId: null,
        },
        {
          sourceAccountRequired: "localized source required",
          destinationAccountRequired: "localized destination required",
        }
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.fromAccountId).toBe("localized source required");
      expect(result.errors.toAccountId).toBe("localized destination required");
    });

    it("should fail when from and to accounts are the same", () => {
      const result = validateTransactionForm("TRANSFER", {
        ...validTransfer,
        fromAccountId: "same-acc",
        toAccountId: "same-acc",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.toAccountId).toBe(
        "Source and destination accounts must be different"
      );
    });

    it("should fail when amount exceeds 1 billion", () => {
      const result = validateTransactionForm("TRANSFER", {
        ...validTransfer,
        amount: "2000000000",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBe("Amount must be at most 1,000,000,000");
    });

    it("should pass with amount at exactly 1 billion", () => {
      const result = validateTransactionForm("TRANSFER", {
        ...validTransfer,
        amount: "1000000000",
      });
      expect(result.isValid).toBe(true);
    });

    it("should only return the first error per field", () => {
      // Empty string triggers both min(1) and the refine — only first should show
      const result = validateTransactionForm("TRANSFER", {
        amount: "",
        fromAccountId: "",
        toAccountId: "",
      });
      expect(result.isValid).toBe(false);
      // Each field should have exactly one error message
      expect(typeof result.errors.amount).toBe("string");
      expect(typeof result.errors.fromAccountId).toBe("string");
      expect(typeof result.errors.toAccountId).toBe("string");
    });
  });
});
