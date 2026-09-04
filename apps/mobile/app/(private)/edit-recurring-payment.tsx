import { ConfirmationModal } from "@/components/modals/ConfirmationModal";
import { PageHeader } from "@/components/navigation/PageHeader";
import {
  RecurringPaymentForm,
  type RecurringPaymentFormHandle,
  type RecurringPaymentFormValues,
} from "@/components/recurring-payments";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useRecurringPayment } from "@/hooks/useRecurringPayment";
import {
  deleteRecurringPayment,
  pauseRecurringPayment,
  resumeRecurringPayment,
  updateRecurringPayment,
} from "@/services/recurring-payment-service";
import {
  getRecurringPaymentErrorMessage,
  parseRecurringPaymentSubmissionAmount,
  type RecurringPaymentOperation,
} from "@/utils/recurring-payment-submission";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

export default function EditRecurringPaymentScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation("transactions");
  const { t: tCommon } = useTranslation("common");
  const { payment, isLoading } = useRecurringPayment(id);
  const { accounts, isLoading: isAccountsLoading } = useAccounts();
  const { expenseCategories, incomeCategories } = useCategories();
  const { categories: allCategories } = useCategories({
    topLevelOnly: false,
    includeHidden: true,
  });
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleteVisible, setIsDeleteVisible] = useState(false);
  const [isPauseResumeVisible, setIsPauseResumeVisible] = useState(false);
  const formRef = useRef<RecurringPaymentFormHandle>(null);

  const initialValues = useMemo<RecurringPaymentFormValues | null>(() => {
    if (!payment) return null;

    return {
      name: payment.name,
      amount: String(payment.amount),
      type: payment.type,
      accountId: payment.accountId,
      categoryId: payment.categoryId,
      frequency: payment.frequency,
      startDate: payment.startDate,
      endDate: payment.endDate ?? null,
      reactivateAfterSaving: false,
      action: payment.action,
      notes: payment.notes ?? "",
    };
  }, [
    payment,
    payment?.accountId,
    payment?.action,
    payment?.amount,
    payment?.categoryId,
    payment?.frequency,
    payment?.name,
    payment?.notes,
    payment?.startDate,
    payment?.endDate,
    payment?.type,
  ]);

  const handleSubmit = async (
    values: RecurringPaymentFormValues
  ): Promise<void | false> => {
    const selectedAccount =
      accounts.find((account) => account.id === values.accountId) ?? null;

    if (
      !payment ||
      !selectedAccount ||
      !values.accountId ||
      !values.categoryId
    ) {
      showToast({
        title: tCommon("error"),
        message: t("account_not_found"),
        type: "error",
      });
      return false;
    }

    const amount = parseRecurringPaymentSubmissionAmount(
      values.amount,
      selectedAccount.currency
    );
    if (amount === null) {
      showToast({
        type: "error",
        title: t("failed_to_update_payment"),
        message: t("invalid_amount"),
      });
      return false;
    }

    setIsSubmitting(true);
    try {
      await updateRecurringPayment(payment.id, {
        name: values.name.trim(),
        amount,
        currency: selectedAccount.currency,
        type: values.type,
        frequency: values.frequency,
        startDate: values.startDate,
        endDate: values.endDate,
        accountId: values.accountId,
        categoryId: values.categoryId,
        action: values.action,
        notes: values.notes.trim() || undefined,
        reactivateAfterSaving: values.reactivateAfterSaving,
      });
      showToast({
        type: "success",
        title: t("recurring_payment_updated"),
        message: t("recurring_payment_updated_message"),
      });
      router.back();
    } catch (error: unknown) {
      showToast({
        type: "error",
        title: t("failed_to_update_payment"),
        message: getRecurringPaymentErrorMessage({
          error,
          operation: "update",
          t,
          tCommon,
        }),
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePauseToggle = async (): Promise<void> => {
    if (!payment) return;

    setIsPauseResumeVisible(false);

    const isResuming = payment.status === "PAUSED";
    const operation: RecurringPaymentOperation = isResuming
      ? "resume"
      : "pause";

    try {
      if (isResuming) {
        await resumeRecurringPayment(payment.id);
      } else {
        await pauseRecurringPayment(payment.id);
      }

      showToast({
        type: "success",
        title: t(
          isResuming ? "recurring_payment_resumed" : "recurring_payment_paused"
        ),
        message: t(
          isResuming
            ? "recurring_payment_resumed_message"
            : "recurring_payment_paused_message"
        ),
      });
    } catch (error: unknown) {
      showToast({
        type: "error",
        title: t("failed_to_update_payment"),
        message: getRecurringPaymentErrorMessage({
          error,
          operation,
          t,
          tCommon,
        }),
      });
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!payment) return;

    try {
      await deleteRecurringPayment(payment.id);
      showToast({
        type: "success",
        title: t("recurring_payment_deleted"),
        message: t("recurring_payment_deleted_message"),
      });
      router.back();
    } catch (error: unknown) {
      showToast({
        type: "error",
        title: t("failed_to_delete_payment"),
        message: getRecurringPaymentErrorMessage({
          error,
          operation: "delete",
          t,
          tCommon,
        }),
      });
    }
  };

  if (isLoading || isAccountsLoading) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark">
        <PageHeader title={t("edit_payment")} showBackButton />
        <View className="px-5 pt-4">
          <Skeleton width="100%" height={132} borderRadius={24} />
          <View className="mt-5">
            <Skeleton width="100%" height={48} borderRadius={24} />
          </View>
          <View className="mt-5">
            <Skeleton width="100%" height={180} borderRadius={16} />
          </View>
        </View>
      </View>
    );
  }

  if (!payment || !initialValues) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark">
        <PageHeader title={t("edit_payment")} showBackButton />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-base font-semibold text-text-secondary dark:text-text-secondary-dark text-center">
            {t("recurring_payment_not_found")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <PageHeader
        title={t("edit_payment")}
        showBackButton
        rightAction={{
          label: t("save"),
          onPress: () => formRef.current?.submit(),
          disabled: isSubmitting,
          loading: isSubmitting,
        }}
      />
      <RecurringPaymentForm
        ref={formRef}
        key={payment.id}
        mode="edit"
        initialValues={initialValues}
        accounts={accounts}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        allCategories={allCategories}
        status={payment.status}
        dueDate={payment.nextDueDate}
        isSubmitting={isSubmitting}
        submitLabel={t("save_changes")}
        onSubmit={handleSubmit}
        onPauseToggle={
          payment.status === "COMPLETED"
            ? undefined
            : () => {
                setIsPauseResumeVisible(true);
                return Promise.resolve();
              }
        }
        onDelete={() => {
          setIsDeleteVisible(true);
          return Promise.resolve();
        }}
      />
      <ConfirmationModal
        visible={isPauseResumeVisible && payment.status !== "COMPLETED"}
        title={
          payment.status === "PAUSED" ? t("resume_payment") : t("pause_payment")
        }
        message={
          payment.status === "PAUSED"
            ? t("resume_payment_message")
            : t("pause_payment_message")
        }
        confirmLabel={
          payment.status === "PAUSED" ? t("resume_payment") : t("pause_payment")
        }
        cancelLabel={tCommon("cancel")}
        variant={payment.status === "PAUSED" ? "success" : "warning"}
        icon={
          payment.status === "PAUSED"
            ? "play-circle-outline"
            : "pause-circle-outline"
        }
        onConfirm={() => void handlePauseToggle()}
        onCancel={() => setIsPauseResumeVisible(false)}
      />
      <ConfirmationModal
        visible={isDeleteVisible}
        title={t("delete_payment")}
        message={t("delete_payment_message")}
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        onConfirm={() => void handleDelete()}
        onCancel={() => setIsDeleteVisible(false)}
      />
    </View>
  );
}
