import React from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTranslation } from "react-i18next";
import { CategorySelectorModal } from "@/components/modals/CategorySelectorModal";
import { ConfirmationModal } from "@/components/modals/ConfirmationModal";
import { CurrencyPicker } from "@/components/currency/CurrencyPicker";
import type { BudgetFormController } from "./budget-form-controller";

function BudgetSelectionOverlays({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  return (
    <>
      <CategorySelectorModal
        visible={controller.isCategoryModalOpen}
        rootCategories={controller.expenseCategories}
        selectedId={controller.form.categoryId}
        type="EXPENSE"
        onSelect={controller.selectCategory}
        onClose={controller.closeCategoryModal}
      />
      <CurrencyPicker
        visible={controller.isCurrencyPickerOpen}
        selectedCurrency={
          controller.form.currency ?? controller.preferredCurrency
        }
        onSelect={controller.selectCurrency}
        onClose={controller.closeCurrencyPicker}
      />
    </>
  );
}

function BudgetRenewalConfirmation({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  const { t } = useTranslation("budgets");
  return (
    <ConfirmationModal
      visible={controller.showRenewalConfirmation}
      title={t("confirm_budget_renewal_title")}
      message={t("confirm_budget_renewal_message")}
      confirmLabel={t("confirm_budget_renewal_action")}
      cancelLabel={t("cancel")}
      onConfirm={() => void controller.handleConfirmRenewal()}
      onCancel={controller.cancelRenewalConfirmation}
      variant="success"
      icon="refresh-outline"
      isConfirming={controller.isSubmitting}
    />
  );
}

function BudgetDatePickers({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  return (
    <>
      {controller.showStartPicker ? (
        <DateTimePicker
          value={controller.form.periodStart}
          mode="date"
          display="default"
          onChange={(_, date) => {
            controller.closeStartPicker();
            if (date) controller.updateField("periodStart", date);
          }}
        />
      ) : null}
      {controller.showEndPicker ? (
        <DateTimePicker
          value={controller.form.periodEnd}
          mode="date"
          display="default"
          minimumDate={controller.form.periodStart}
          onChange={(_, date) => {
            controller.closeEndPicker();
            if (date) controller.updateField("periodEnd", date);
          }}
        />
      ) : null}
    </>
  );
}

export function BudgetFormOverlays({
  controller,
}: {
  readonly controller: BudgetFormController;
}): React.JSX.Element {
  return (
    <>
      <BudgetSelectionOverlays controller={controller} />
      <BudgetRenewalConfirmation controller={controller} />
      <BudgetDatePickers controller={controller} />
    </>
  );
}
