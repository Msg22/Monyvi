import {
  RecurringPaymentForm,
  type RecurringPaymentFormHandle,
  type RecurringPaymentFormValues,
} from "@/components/recurring-payments";
import { PageHeader } from "@/components/navigation/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { createRecurringPayment } from "@/services/recurring-payment-service";
import {
  getRecurringPaymentErrorMessage,
  parseRecurringPaymentSubmissionAmount,
} from "@/utils/recurring-payment-submission";
import { router } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

export default function CreateRecurringPaymentScreen(): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const { t: tCommon } = useTranslation("common");
  const { accounts } = useAccounts();
  const { expenseCategories, incomeCategories } = useCategories();
  const { categories: allCategories } = useCategories({ topLevelOnly: false });
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<RecurringPaymentFormHandle>(null);

  const initialValues = useMemo<RecurringPaymentFormValues>(
    () => ({
      name: "",
      amount: "",
      type: "EXPENSE",
      accountId: accounts[0]?.id ?? null,
      categoryId: null,
      frequency: "MONTHLY",
      startDate: new Date(),
      endDate: null,
      reactivateAfterSaving: false,
      action: "NOTIFY",
      notes: "",
    }),
    [accounts]
  );

  const handleSubmit = async (
    values: RecurringPaymentFormValues
  ): Promise<void | false> => {
    const selectedAccount =
      accounts.find((account) => account.id === values.accountId) ?? null;

    if (!selectedAccount || !values.accountId || !values.categoryId) {
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
        title: t("failed_to_create_payment"),
        message: t("invalid_amount"),
      });
      return false;
    }

    setIsSubmitting(true);
    try {
      await createRecurringPayment({
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
      });
      showToast({
        type: "success",
        title: t("recurring_payment_created"),
        message: t("recurring_payment_created_message"),
      });
      router.back();
    } catch (error: unknown) {
      showToast({
        type: "error",
        title: t("failed_to_create_payment"),
        message: getRecurringPaymentErrorMessage({
          error,
          operation: "create",
          t,
          tCommon,
        }),
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View
      testID="create-recurring-payment-screen"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <PageHeader
        title={t("new_payment")}
        showBackButton
        backIcon="close"
        rightAction={{
          label: t("save"),
          onPress: () => formRef.current?.submit(),
          disabled: isSubmitting,
          loading: isSubmitting,
        }}
      />
      <RecurringPaymentForm
        ref={formRef}
        mode="create"
        initialValues={initialValues}
        accounts={accounts}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        allCategories={allCategories}
        isSubmitting={isSubmitting}
        submitLabel={t("add_recurring_payment")}
        onSubmit={handleSubmit}
      />
    </View>
  );
}
