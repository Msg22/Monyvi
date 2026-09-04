import type { CurrencyType } from "@monyvi/db";
import { validateRecurringPaymentForm } from "@/validation/recurring-payment-validation";

interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: Partial<
    Record<
      | "name"
      | "amount"
      | "accountId"
      | "categoryId"
      | "startDate"
      | "endDate",
      string
    >
  >;
}

type ValidateRecurringPaymentForm = (
  data: {
    readonly name: string;
    readonly amount: string;
    readonly accountId: string | null;
    readonly categoryId: string | null;
    readonly startDate: Date;
    readonly endDate: Date | null;
  },
  options?: {
    readonly currency?: CurrencyType;
    readonly referenceDate?: Date;
    readonly originalStartDate?: Date | null;
  }
) => ValidationResult;

const validate =
  validateRecurringPaymentForm as unknown as ValidateRecurringPaymentForm;
const referenceDate = new Date(2026, 7, 14, 12, 0, 0);
const validForm = {
  name: "Internet bill",
  amount: "120",
  accountId: "account-1",
  categoryId: "category-1",
  startDate: new Date(2026, 7, 14, 0, 0, 0),
  endDate: null,
};

function validateAmount(
  amount: string,
  currency: CurrencyType = "EGP"
): ValidationResult {
  return validate({ ...validForm, amount }, { currency, referenceDate });
}

describe("validateRecurringPaymentForm", () => {
  describe("amount grammar, maximum, and precision", () => {
    it.each(["120", "120.50", ".5", "1,234.50", "1,000,000,000"])(
      "accepts %s for a two-decimal currency",
      (amount) => {
        expect(validateAmount(amount).isValid).toBe(true);
      }
    );

    it.each([
      "12,5",
      "1,23",
      "1,2345",
      "1e3",
      "+5",
      "abc",
      "Infinity",
      "NaN",
      "1.2.3",
      "12abc",
      "12.",
    ])("rejects malformed amount %p", (amount) => {
      const result = validateAmount(amount);

      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBe("Please enter a valid amount");
    });

    it.each(["0", "-5"])("rejects non-positive amount %p", (amount) => {
      const result = validateAmount(amount);

      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBe("Amount must be greater than 0");
    });

    it("uses the transaction maximum inclusively", () => {
      expect(validateAmount("1000000000").isValid).toBe(true);

      const result = validateAmount("1000000000.01");
      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBe(
        "Amount must be at most 1,000,000,000"
      );
    });

    it("uses the existing two-, three-, and eight-decimal currency contract", () => {
      expect(validateAmount("12.34", "EGP").isValid).toBe(true);
      expect(validateAmount("12.345", "EGP").errors.amount).toBe(
        "Amount must have at most 2 decimal places"
      );

      expect(validateAmount("12.345", "KWD").isValid).toBe(true);
      expect(validateAmount("12.3456", "KWD").errors.amount).toBe(
        "Amount must have at most 3 decimal places"
      );

      expect(validateAmount("0.12345678", "BTC").isValid).toBe(true);
      expect(validateAmount("0.123456789", "BTC").errors.amount).toBe(
        "Amount must have at most 8 decimal places"
      );
    });
  });

  describe("Due payment date", () => {
    it("accepts today and the same local-calendar date one year ahead", () => {
      expect(
        validate(
          { ...validForm, startDate: new Date(2026, 7, 14, 23, 59, 59) },
          { currency: "EGP", referenceDate }
        ).isValid
      ).toBe(true);
      expect(
        validate(
          { ...validForm, startDate: new Date(2027, 7, 14, 0, 0, 0) },
          { currency: "EGP", referenceDate }
        ).isValid
      ).toBe(true);
    });

    it("rejects dates before today and after the one-year boundary", () => {
      for (const startDate of [
        new Date(2026, 7, 13, 23, 59, 59),
        new Date(2027, 7, 15, 0, 0, 0),
      ]) {
        const result = validate(
          { ...validForm, startDate },
          { currency: "EGP", referenceDate }
        );

        expect(result.isValid).toBe(false);
        expect(result.errors.startDate).toBe(
          "Due payment must be between today and one year from today"
        );
      }
    });

    it("rejects an invalid JavaScript date", () => {
      const result = validate(
        { ...validForm, startDate: new Date(Number.NaN) },
        { currency: "EGP", referenceDate }
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.startDate).toBe(
        "Please enter a valid Due payment date"
      );
    });

    it("allows an unchanged legacy date while rejecting a different invalid edit date", () => {
      const originalPastDate = new Date(2025, 4, 20, 8, 0, 0);
      const unchangedPastDate = new Date(2025, 4, 20, 18, 30, 0);
      const changedPastDate = new Date(2025, 4, 21, 8, 0, 0);
      const originalFutureDate = new Date(2028, 4, 20, 8, 0, 0);

      expect(
        validate(
          { ...validForm, startDate: unchangedPastDate },
          {
            currency: "EGP",
            referenceDate,
            originalStartDate: originalPastDate,
          }
        ).isValid
      ).toBe(true);
      expect(
        validate(
          { ...validForm, startDate: changedPastDate },
          {
            currency: "EGP",
            referenceDate,
            originalStartDate: originalPastDate,
          }
        ).errors.startDate
      ).toBe("Due payment must be between today and one year from today");
      expect(
        validate(
          { ...validForm, startDate: new Date(2028, 4, 20, 23, 0, 0) },
          {
            currency: "EGP",
            referenceDate,
            originalStartDate: originalFutureDate,
          }
        ).isValid
      ).toBe(true);
      expect(
        validate(
          { ...validForm, startDate: new Date(2028, 4, 21, 8, 0, 0) },
          {
            currency: "EGP",
            referenceDate,
            originalStartDate: originalFutureDate,
          }
        ).errors.startDate
      ).toBe("Due payment must be between today and one year from today");
    });
  });

  describe("End date", () => {
    it("accepts an unset End date and one equal to Due payment", () => {
      expect(
        validate(validForm, { currency: "EGP", referenceDate }).isValid
      ).toBe(true);
      expect(
        validate(
          { ...validForm, endDate: validForm.startDate },
          { currency: "EGP", referenceDate }
        ).isValid
      ).toBe(true);
      expect(
        validate(
          {
            ...validForm,
            startDate: new Date(2026, 7, 14, 18, 0, 0),
            endDate: new Date(2026, 7, 14, 0, 0, 0),
          },
          { currency: "EGP", referenceDate }
        ).isValid
      ).toBe(true);
    });

    it("rejects an End date before Due payment", () => {
      const result = validate(
        {
          ...validForm,
          endDate: new Date(2026, 7, 13, 0, 0, 0),
        },
        { currency: "EGP", referenceDate }
      );

      expect(result).toEqual({
        isValid: false,
        errors: { endDate: "End date must be on or after Due payment." },
      });
    });
  });
});
