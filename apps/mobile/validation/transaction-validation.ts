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
  readonly accountRequired: string;
  readonly sourceAccountRequired: string;
  readonly destinationAccountRequired: string;
}

export interface TransactionValidationOptions {
  readonly currency?: CurrencyType;
}

const defaultValidationMessages: TransactionValidationMessages = {
  accountRequired: "Account is required",
  sourceAccountRequired: "Source account is required",
  destinationAccountRequired: "Destination account is required",
};

const TRANSACTION_AMOUNT_LIMIT_MESSAGE = `Amount must be at most ${MAX_TRANSACTION_AMOUNT.toLocaleString(
  "en-US"
)}`;
const INVALID_AMOUNT_MESSAGE = "Please enter a valid amount";
const POSITIVE_AMOUNT_MESSAGE = "Amount must be greater than 0";

function requiredIdSchema(message: string): z.ZodType<string | null> {
  return z
    .string()
    .nullable()
    .refine((value) => value !== null && value.length > 0, message);
}

function getAmountValidationMessage(
  reason: StrictAmountParseFailureReason,
  maxFractionDigits: number | undefined
): string {
  switch (reason) {
    case "required":
      return "Amount is required";
    case "not-positive":
      return POSITIVE_AMOUNT_MESSAGE;
    case "exceeds-maximum":
      return TRANSACTION_AMOUNT_LIMIT_MESSAGE;
    case "exceeds-precision":
      return `Amount must have at most ${maxFractionDigits ?? 0} decimal places`;
    case "invalid-format":
    default:
      return INVALID_AMOUNT_MESSAGE;
  }
}

function createAmountSchema(
  options: TransactionValidationOptions
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
      message: getAmountValidationMessage(result.reason, maxFractionDigits),
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
    amount: createAmountSchema(options),
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
      amount: createAmountSchema(options),
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
 * @param messages - Optional localized required-account messages
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
