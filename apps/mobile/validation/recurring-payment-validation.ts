import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for recurring payment form validation.
 * Mirrors required DB columns from `recurring_payments`.
 */
const recurringPaymentSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be under 100 characters"),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine(
      (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
      "Amount must be greater than 0"
    ),
  accountId: z.string().nullable().refine(Boolean, "Account is required"),
  categoryId: z.string().nullable().refine(Boolean, "Category is required"),
  startDate: z.date(),
  endDate: z.date().nullable(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecurringPaymentFormData = z.infer<typeof recurringPaymentSchema>;

/** Union of all possible form field keys for error display */
export type RecurringPaymentValidationErrors = Partial<
  Record<"name" | "amount" | "accountId" | "categoryId" | "endDate", string>
>;

// ---------------------------------------------------------------------------
// Validation Function
// ---------------------------------------------------------------------------

/**
 * Validates recurring payment form data using the Zod schema.
 *
 * @param data - The form data to validate
 * @returns Object with `isValid` boolean and `errors` record
 */
export function validateRecurringPaymentForm(data: {
  name: string;
  amount: string;
  accountId: string | null;
  categoryId: string | null;
  startDate: Date;
  endDate: Date | null;
  endDateErrorMessage?: string;
}): { isValid: boolean; errors: RecurringPaymentValidationErrors } {
  const { endDateErrorMessage, ...formData } = data;
  const result = recurringPaymentSchema.safeParse(formData);

  const errors: RecurringPaymentValidationErrors = {};
  if (!result.success) {
    result.error.issues.forEach((issue) => {
      const path = issue.path[0] as keyof RecurringPaymentValidationErrors;
      // Keep only the first error per field
      if (path && !errors[path]) {
        errors[path] = issue.message;
      }
    });
  }

  if (
    formData.endDate !== null &&
    formData.endDate.getTime() < formData.startDate.getTime()
  ) {
    errors.endDate =
      endDateErrorMessage ?? "End date must be on or after Due payment.";
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}
