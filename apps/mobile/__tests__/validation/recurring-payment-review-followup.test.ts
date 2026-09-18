import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { validateRecurringPaymentForm } from "@/validation/recurring-payment-validation";

const referenceDate = new Date(2026, 8, 6, 12, 0, 0);
const validForm = {
  name: "Internet bill",
  amount: "120",
  accountId: "account-1",
  categoryId: "category-1",
  startDate: new Date(2026, 8, 6, 0, 0, 0),
  endDate: null,
};

describe("recurring payment review follow-up regressions", () => {
  it("uses caller-provided localized copy for a required amount", () => {
    const result = validateRecurringPaymentForm(
      { ...validForm, amount: "" },
      {
        currency: "EGP",
        referenceDate,
        messages: {
          amountRequired: "المبلغ مطلوب",
        },
      }
    );

    expect(result.errors.amount).toBe("المبلغ مطلوب");
  });

  it("wires the recurring form required-amount translation into validation", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../../components/recurring-payments/RecurringPaymentForm.tsx"
      ),
      "utf8"
    );

    expect(source).toContain('amountRequired: t("amount_required")');
  });
});
