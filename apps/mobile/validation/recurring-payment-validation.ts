import type { CurrencyType } from "@monyvi/db";
import {
  getCurrencyPrecision,
  isOnOrBeforeDay,
  isRecurringStartDateAllowed,
  isValidDate,
  MAX_TRANSACTION_AMOUNT,
  parseStrictAmountInput,
  type StrictAmountParseFailureReason,
} from "@monyvi/logic";
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
  amount: z.string(),
  accountId: z.string().nullable().refine(Boolean, "Account is required"),
  categoryId: z.string().nullable().refine(Boolean, "Category is required"),
  startDate: z.instanceof(Date),
  endDate: z.instanceof(Date).nullable(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecurringPaymentFormData = z.infer<typeof recurringPaymentSchema>;

export interface RecurringPaymentValidationMessages {
  readonly invalidAmount: string;
  readonly positiveAmount: string;
  readonly amountMaximum: string;
  readonly amountPrecision: (precision: number) => string;
  readonly invalidStartDate: string;
  readonly startDateRange: string;
  readonly invalidEndDate: string;
  readonly endDateBeforeDue: string;
}

export interface RecurringPaymentValidationOptions {
  readonly currency?: CurrencyType;
  readonly referenceDate?: Date;
  readonly originalStartDate?: Date | null;
  readonly messages?: Partial<RecurringPaymentValidationMessages>;
}

/** Union of all possible form field keys for error display */
export type RecurringPaymentValidationErrors = Partial<
  Record<
    "name" | "amount" | "accountId" | "categoryId" | "startDate" | "endDate",
    string
  >
>;

const DEFAULT_CURRENCY: CurrencyType = "EGP";
const DEFAULT_MESSAGES: RecurringPaymentValidationMessages = {
  invalidAmount: "Please enter a valid amount",
  positiveAmount: "Amount must be greater than 0",
  amountMaximum: `Amount must be at most ${MAX_TRANSACTION_AMOUNT.toLocaleString(
    "en-US"
  )}`,
  amountPrecision: (precision) =>
    `Amount must have at most ${precision} decimal places`,
  invalidStartDate: "Please enter a valid Due payment date",
  startDateRange: "Due payment must be between today and one year from today",
  invalidEndDate: "Please enter a valid End date",
  endDateBeforeDue: "End date must be on or after Due payment.",
};

function getAmountValidationMessage(
  reason: StrictAmountParseFailureReason,
  precision: number,
  messages: RecurringPaymentValidationMessages
): string {
  switch (reason) {
    case "required":
      return "Amount is required";
    case "not-positive":
      return messages.positiveAmount;
    case "exceeds-maximum":
      return messages.amountMaximum;
    case "exceeds-precision":
      return messages.amountPrecision(precision);
    case "invalid-format":
    default:
      return messages.invalidAmount;
  }
}

// ---------------------------------------------------------------------------
// Validation Function
// ---------------------------------------------------------------------------

/**
 * Validates recurring payment form data using the shared amount and date
 * contracts plus the structural Zod schema.
 */
export function validateRecurringPaymentForm(
  data: {
    readonly name: string;
    readonly amount: string;
    readonly accountId: string | null;
    readonly categoryId: string | null;
    readonly startDate: Date;
    readonly endDate: Date | null;
    readonly endDateErrorMessage?: string;
  },
  options: RecurringPaymentValidationOptions = {}
): { isValid: boolean; errors: RecurringPaymentValidationErrors } {
  const { endDateErrorMessage, ...formData } = data;
  const messages: RecurringPaymentValidationMessages = {
    ...DEFAULT_MESSAGES,
    ...options.messages,
    endDateBeforeDue:
      endDateErrorMessage ??
      options.messages?.endDateBeforeDue ??
      DEFAULT_MESSAGES.endDateBeforeDue,
  };
  const result = recurringPaymentSchema.safeParse(formData);
  const errors: RecurringPaymentValidationErrors = {};

  if (!result.success) {
    result.error.issues.forEach((issue) => {
      const path = issue.path[0] as keyof RecurringPaymentValidationErrors;
      if (path && !errors[path]) {
        errors[path] = issue.message;
      }
    });
  }

  const currency = options.currency ?? DEFAULT_CURRENCY;
  const precision = getCurrencyPrecision(currency);
  const amountResult = parseStrictAmountInput(formData.amount, {
    maxAmount: MAX_TRANSACTION_AMOUNT,
    maxFractionDigits: precision,
  });
  if (!amountResult.success) {
    errors.amount = getAmountValidationMessage(
      amountResult.reason,
      precision,
      messages
    );
  }

  const referenceDate = options.referenceDate ?? new Date();
  if (!isValidDate(formData.startDate) || !isValidDate(referenceDate)) {
    errors.startDate = messages.invalidStartDate;
  } else if (
    !isRecurringStartDateAllowed({
      startDate: formData.startDate,
      referenceDate,
      originalStartDate: options.originalStartDate,
    })
  ) {
    errors.startDate = messages.startDateRange;
  }

  if (formData.endDate !== null && !isValidDate(formData.endDate)) {
    errors.endDate = messages.invalidEndDate;
  } else if (
    formData.endDate !== null &&
    isValidDate(formData.startDate) &&
    !isOnOrBeforeDay(formData.startDate, formData.endDate)
  ) {
    errors.endDate = messages.endDateBeforeDue;
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}
