import type { CurrencyType, TransactionType } from "@monyvi/db";
import {
  CURRENCY_PRECISION,
  DEFAULT_PRECISION,
  MAX_TRANSACTION_AMOUNT,
  parsePositiveFiniteAmountInput,
} from "@monyvi/logic";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export interface TransactionFormData {
  readonly amount: string;
  readonly accountId: string | null;
  readonly categoryId: string;
  readonly currency?: CurrencyType;
}

export interface TransferFormData {
  readonly amount: string;
  readonly fromAccountId: string | null;
  readonly toAccountId: string | null;
  readonly currency?: CurrencyType;
}

export interface TransactionValidationMessages {
  readonly accountRequired: string;
  readonly amountPrecision: string;
  readonly sourceAccountRequired: string;
  readonly destinationAccountRequired: string;
}

const defaultValidationMessages: TransactionValidationMessages = {
  accountRequired: "Account is required",
  amountPrecision: "Use no more than the currency's supported decimals",
  sourceAccountRequired: "Source account is required",
  destinationAccountRequired: "Destination account is required",
};

const TRANSACTION_AMOUNT_LIMIT_MESSAGE = `Amount must be at most ${MAX_TRANSACTION_AMOUNT.toLocaleString(
  "en-US"
)}`;
const INVALID_AMOUNT_MESSAGE = "Please enter a valid amount";
const FINITE_AMOUNT_INPUT_PATTERN = /^-?(?:\d+\.?\d*|\.\d+)$/;

function requiredIdSchema(message: string): z.ZodType<string | null> {
  return z
    .string()
    .nullable()
    .refine((value) => value !== null && value.length > 0, message);
}

function parseFiniteAmountInput(value: string): number | null {
  const normalized = value.trim().replace(/,/g, "");
  if (!FINITE_AMOUNT_INPUT_PATTERN.test(normalized)) {
    return null;
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function isFiniteAmountInput(value: string): boolean {
  return parseFiniteAmountInput(value) !== null;
}

function isPositiveAmountInput(value: string): boolean {
  const amount = parseFiniteAmountInput(value);
  return amount === null || amount > 0;
}

function isWithinTransactionAmountLimit(value: string): boolean {
  const amount = parsePositiveFiniteAmountInput(value);
  return amount === null || amount <= MAX_TRANSACTION_AMOUNT;
}

function hasSupportedCurrencyPrecision(
  value: string,
  currency: CurrencyType | undefined
): boolean {
  if (currency === undefined || !isFiniteAmountInput(value)) return true;
  const normalized = value.trim().replace(/,/g, "");
  const fractionalDigits = normalized.split(".")[1]?.length ?? 0;
  return fractionalDigits <= (CURRENCY_PRECISION[currency] ?? DEFAULT_PRECISION);
}

/**
 * Zod schema for expense/income transaction form validation.
 */
function createBaseTransactionSchema(
  messages: TransactionValidationMessages
): z.ZodType<TransactionFormData> {
  return z
    .object({
    amount: z
      .string()
      .min(1, "Amount is required")
      .refine((val) => isFiniteAmountInput(val), INVALID_AMOUNT_MESSAGE)
      .refine(
        (val) => isPositiveAmountInput(val),
        "Amount must be greater than 0"
      )
      .refine(
        (val) => isWithinTransactionAmountLimit(val),
        TRANSACTION_AMOUNT_LIMIT_MESSAGE
      ),
      accountId: requiredIdSchema(messages.accountRequired),
      categoryId: z.string().min(1, "Category is required"),
      currency: z.custom<CurrencyType>().optional(),
    })
    .superRefine((data, context) => {
      if (!hasSupportedCurrencyPrecision(data.amount, data.currency)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.amountPrecision,
          path: ["amount"],
        });
      }
    });
}

/**
 * Zod schema for transfer form validation.
 */
function createTransferSchema(
  messages: TransactionValidationMessages
): z.ZodType<TransferFormData> {
  return z
    .object({
      amount: z
        .string()
        .min(1, "Amount is required")
        .refine((val) => isFiniteAmountInput(val), INVALID_AMOUNT_MESSAGE)
        .refine(
          (val) => isPositiveAmountInput(val),
          "Amount must be greater than 0"
        )
        .refine(
          (val) => isWithinTransactionAmountLimit(val),
          TRANSACTION_AMOUNT_LIMIT_MESSAGE
        ),
      fromAccountId: requiredIdSchema(messages.sourceAccountRequired),
      toAccountId: requiredIdSchema(messages.destinationAccountRequired),
      currency: z.custom<CurrencyType>().optional(),
    })
    .superRefine((data, context) => {
      if (!hasSupportedCurrencyPrecision(data.amount, data.currency)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.amountPrecision,
          path: ["amount"],
        });
      }
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
 * @returns Object with `isValid` boolean and `errors` record
 */
export function validateTransactionForm(
  type: TransactionType | "TRANSFER",
  data: TransactionFormData | TransferFormData,
  messages: Partial<TransactionValidationMessages> = {}
): { isValid: boolean; errors: TransactionValidationErrors } {
  const validationMessages = { ...defaultValidationMessages, ...messages };
  const schema =
    type === "TRANSFER"
      ? createTransferSchema(validationMessages)
      : createBaseTransactionSchema(validationMessages);
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
