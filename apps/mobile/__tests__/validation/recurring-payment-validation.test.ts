import { validateRecurringPaymentForm } from "@/validation/recurring-payment-validation";

const validForm = {
  name: "Internet bill",
  amount: "120",
  accountId: "account-1",
  categoryId: "category-1",
  startDate: new Date("2026-08-14T00:00:00.000Z"),
};

describe("validateRecurringPaymentForm", () => {
  it("accepts an unset End date and one equal to Due payment", () => {
    expect(
      validateRecurringPaymentForm({ ...validForm, endDate: null }).isValid
    ).toBe(true);
    expect(
      validateRecurringPaymentForm({
        ...validForm,
        endDate: validForm.startDate,
      }).isValid
    ).toBe(true);
    expect(
      validateRecurringPaymentForm({
        ...validForm,
        startDate: new Date("2026-08-14T18:00:00.000Z"),
        endDate: new Date("2026-08-14T00:00:00.000Z"),
      }).isValid
    ).toBe(true);
  });

  it("rejects an End date before Due payment", () => {
    const result = validateRecurringPaymentForm({
      ...validForm,
      endDate: new Date("2026-08-13T00:00:00.000Z"),
    });

    expect(result).toEqual({
      isValid: false,
      errors: { endDate: "End date must be on or after Due payment." },
    });
  });
});
