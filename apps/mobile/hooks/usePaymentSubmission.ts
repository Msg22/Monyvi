/**
 * usePaymentSubmission Hook
 *
 * Encapsulates the validation + DB write logic for paying a recurring payment.
 * Extracted from PayNowModal to follow SRP (E3): the modal handles UI,
 * this hook handles business logic.
 *
 * @module usePaymentSubmission
 */

import type { CurrencyType, RecurringPayment } from "@monyvi/db";
import { useCallback, useState } from "react";
import { InteractionManager } from "react-native";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/Toast";
import { logger } from "@/utils/logger";
import { redactIdentifierForLog } from "@/utils/logger-redaction";
import { submitRecurringPayment } from "@/services/recurring-payment-service";

// =============================================================================
// Types
// =============================================================================

interface UsePaymentSubmissionParams {
  /** The recurring payment to pay */
  payment: RecurringPayment | null;
  /** The account to deduct from */
  accountId: string | null;
  /** Callback after successful payment — receives amount, payment name, and currency */
  onSuccess: (
    amount: number,
    paymentName: string,
    paymentCurrency: CurrencyType
  ) => void;
  /** Callback to close the modal */
  onClose: () => void;
}

interface UsePaymentSubmissionResult {
  /** Whether a submission is in progress */
  readonly isSubmitting: boolean;
  /** Current amount validation error, if any */
  readonly amountError: string;
  /** Clear the amount error */
  readonly clearAmountError: () => void;
  /** Set an amount error manually */
  readonly setAmountError: (error: string) => void;
  /** Submit the payment with the given amount string */
  readonly submit: (amountStr: string) => void;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Manages recurring payment submission: validates amount, creates a transaction,
 * advances the next due date, and handles errors with toast notifications.
 *
 * DB writes are deferred via `InteractionManager.runAfterInteractions()` to
 * avoid blocking modal close animations.
 */
export function usePaymentSubmission({
  payment,
  accountId,
  onSuccess,
  onClose,
}: UsePaymentSubmissionParams): UsePaymentSubmissionResult {
  const { t } = useTranslation("transactions");
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amountError, setAmountError] = useState("");

  const clearAmountError = useCallback((): void => {
    setAmountError("");
  }, []);

  const submit = useCallback(
    (amountStr: string): void => {
      if (!payment) return;
      if (accountId === null) return;

      const numericAmount = Number(amountStr.trim());
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        setAmountError(t("invalid_amount"));
        return;
      }

      setIsSubmitting(true);

      // Defer DB writes until animations complete to avoid jank
      InteractionManager.runAfterInteractions(async () => {
        try {
          await submitRecurringPayment({
            payment,
            accountId,
            amount: numericAmount,
            note: t("payment_for_name", { name: payment.name }),
          });

          setIsSubmitting(false);
          onClose();
          onSuccess(numericAmount, payment.name, payment.currency);
        } catch (error: unknown) {
          setIsSubmitting(false);
          const normalizedError =
            error instanceof Error ? error : new Error(String(error));
          logger.error("Error creating transaction", normalizedError, {
            redactedPaymentId: redactIdentifierForLog(payment.id),
            redactedAccountId: redactIdentifierForLog(accountId),
          });
          showToast({
            type: "error",
            title: t("payment_failed"),
            message: t("payment_failed_message"),
          });
        }
      });
    },
    [payment, accountId, onClose, onSuccess, showToast, t]
  );

  return {
    isSubmitting,
    amountError,
    clearAmountError,
    setAmountError,
    submit,
  };
}
