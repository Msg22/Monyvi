import type { CurrencyType } from "@monyvi/db";
import {
  getCurrencyPrecision,
  MAX_TRANSACTION_AMOUNT,
  parseStrictAmountInput,
} from "@monyvi/logic";

import { RECURRING_PAYMENT_SERVICE_ERROR_CODES } from "@/services/recurring-payment-service";
import { logger } from "@/utils/logger";

export type RecurringPaymentOperation =
  | "create"
  | "update"
  | "pause"
  | "resume"
  | "delete";

interface RecurringPaymentErrorMessageOptions {
  readonly error: unknown;
  readonly operation: RecurringPaymentOperation;
  readonly t: (key: string) => string;
  readonly tCommon: (key: string) => string;
}

/**
 * Parses a complete recurring-payment amount using the selected account's
 * currency precision and the shared transaction maximum.
 */
export function parseRecurringPaymentSubmissionAmount(
  value: string,
  currency: CurrencyType
): number | null {
  const result = parseStrictAmountInput(value, {
    maxAmount: MAX_TRANSACTION_AMOUNT,
    maxFractionDigits: getCurrencyPrecision(currency),
  });

  return result.success ? result.amount : null;
}

/**
 * Maps stable recurring-payment domain failures to localized copy. Unexpected
 * failures are logged with their original error and never exposed to the user.
 */
export function getRecurringPaymentErrorMessage({
  error,
  operation,
  t,
  tCommon,
}: RecurringPaymentErrorMessageOptions): string {
  const errorCode = error instanceof Error ? error.message : null;

  switch (errorCode) {
    case RECURRING_PAYMENT_SERVICE_ERROR_CODES.ACCOUNT_UNAVAILABLE:
      return t("recurring_payment_account_unavailable");
    case RECURRING_PAYMENT_SERVICE_ERROR_CODES.CATEGORY_UNAVAILABLE:
      return t("recurring_payment_category_unavailable");
    case RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_AMOUNT:
      return t("invalid_amount");
    case RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_START_DATE:
      return t("due_payment_date_range");
    case RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_END_DATE:
      return t("invalid_end_date");
    case RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_SCHEDULE:
      return t("end_date_before_due");
    case RECURRING_PAYMENT_SERVICE_ERROR_CODES.CURRENCY_MISMATCH:
      return t("account_currency_mismatch");
    case RECURRING_PAYMENT_SERVICE_ERROR_CODES.STALE_SCHEDULE:
      return t("recurring_payment_stale_schedule");
    case RECURRING_PAYMENT_SERVICE_ERROR_CODES.REACTIVATION_UNAVAILABLE:
      return t("reactivate_payment_unavailable");
    default:
      logger.error("Recurring payment operation failed", error, { operation });
      return tCommon("error_generic");
  }
}
