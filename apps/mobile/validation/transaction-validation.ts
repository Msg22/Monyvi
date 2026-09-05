import type { CurrencyType, TransactionType } from "@monyvi/db";
import {
  getCurrencyPrecision,
  MAX_TRANSACTION_AMOUNT,
  parseStrictAmountInput,
  type StrictAmountParseFailureReason,
} from "@monyvi/logic";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export interface TransactionFormData {
  readonly amount: string;
  readonly accountId: string | null;
  readonly categoryId: string;
}

export interface TransferFormData {
  readonly amount: string;
  readonly fromAccountId: string | null;
  readonly toAccountId: string | null;
}

export interface TransactionValidationMessages {
  readonly amountRequired: string;
  readonly invalidAmount: string;
  readonly amountMustBePositive: string;
  readonly amountMaximum: (maximum: number) => string;
  readonly amountPrecision: (precision: number) => string;
  readonly accountRequired: string;
  readonly sourceAccountRequired: string;
  readonly destinationAccountRequired: string;
}

export interface TransactionValidationOptions {
  readonly currency?: CurrencyType;
}

const defaultValidationMessages: TransactionValidationMessages = {
  amountRequired: "Amount is required",
  invalidAmount: "Please enter a valid amount",
  amountMustBePositive: "Amount must be greater than 0",
  amountMaximum: (maximum) =>
    `Amount must be at most ${maximum.toLocaleString("en-US")}`,
  amountPrecision: (precision) =>
    `Amount must have at most ${precision} decimal places`,
  accountRequired: "Account is required",
  sourceAccountRequired: "Source account is required",
  destinationAccountRequired: "Destination account is required",
};

function requiredIdSchema(message: string): z.ZodType<string | null> {
  return z
    .string()
    .nullable()
    .refine((value) => value !== null && value.length > 0, message);
}

function getAmountValidationMessage(
  reason: StrictAmountParseFailureReason,
  maxFractionDigits: number | undefined,
  messages: TransactionValidationMessages
): string {
  switch (reason) {
    case "required":
      return messages.amountRequired;
    case "not-positive":
      return messages.amountMustBePositive;
    case "exceeds-maximum":
      return messages.amountMaximum(MAX_TRANSACTION_AMOUNT);
    case "exceeds-precision":
      return messages.amountPrecision(maxFractionDigits ?? 0);
    case "invalid-format":
    default:
      return messages.invalidAmount;
  }
}

function createAmountSchema(
  options: TransactionValidationOptions,
  messages: TransactionValidationMessages
): z.ZodType<string> {
  const maxFractionDigits = options.currency
    ? getCurrencyPrecision(options.currency)
    : undefined;

  return z.string().superRefine((value, context) => {
    const result = parseStrictAmountInput(value, {
      maxAmount: MAX_TRANSACTION_AMOUNT,
      maxFractionDigits,
    });
    if (result.success) return;

    context.addIssue({
      code: "custom",
      message: getAmountValidationMessage(
        result.reason,
        maxFractionDigits,
        messages
      ),
    });
  });
}

/**
 * Zod schema for expense/income transaction form validation.
 */
function createBaseTransactionSchema(
  messages: TransactionValidationMessages,
  options: TransactionValidationOptions
): z.ZodType<TransactionFormData> {
  return z.object({
    amount: createAmountSchema(options, messages),
    accountId: requiredIdSchema(messages.accountRequired),
    categoryId: z.string().min(1, "Category is required"),
  });
}

/**
 * Zod schema for transfer form validation.
 */
function createTransferSchema(
  messages: TransactionValidationMessages,
  options: TransactionValidationOptions
): z.ZodType<TransferFormData> {
  return z
    .object({
      amount: createAmountSchema(options, messages),
      fromAccountId: requiredIdSchema(messages.sourceAccountRequired),
      toAccountId: requiredIdSchema(messages.destinationAccountRequired),
    })
    .refine((data) => data.fromAccountId !== data.toAccountId, {
      message: "Source and destination accounts must be different",
      path: ["toAccountId"],
    });
}

/** Union of all possible form field keys for error display */
export type TransactionValidationErrors = Partial<
  Record<
    "amount" | "accountId" | "categoryId" | "fromAccountId" | "toAccountId",
    string
  >
>;

// ---------------------------------------------------------------------------
// Validation Functions
// ---------------------------------------------------------------------------

/**
 * Validates transaction form data using the appropriate Zod schema
 * based on the transaction type.
 *
 * @param type - The current transaction type/mode
 * @param data - The form data to validate
 * @param messages - Optional localized validation messages
 * @param options - Currency-aware amount validation options
 * @returns Object with `isValid` boolean and `errors` record
 */
export function validateTransactionForm(
  type: TransactionType | "TRANSFER",
  data: TransactionFormData | TransferFormData,
  messages: Partial<TransactionValidationMessages> = {},
  options: TransactionValidationOptions = {}
): { isValid: boolean; errors: TransactionValidationErrors } {
  const validationMessages = { ...defaultValidationMessages, ...messages };
  const schema =
    type === "TRANSFER"
      ? createTransferSchema(validationMessages, options)
      : createBaseTransactionSchema(validationMessages, options);
  const result = schema.safeParse(data);

  if (result.success) {
    return { isValid: true, errors: {} };
  }

  const errors: TransactionValidationErrors = {};
  result.error.issues.forEach((issue) => {
    const path = issue.path[0] as keyof TransactionValidationErrors;
    // Keep only the first error per field
    if (path && !errors[path]) {
      errors[path] = issue.message;
    }
  });

  return { isValid: false, errors };
}
