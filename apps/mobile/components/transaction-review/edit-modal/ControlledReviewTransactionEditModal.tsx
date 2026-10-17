/**
 * #395 FR-019 — controlled V2 branch of the existing TransactionEditModal.
 * The approved field surfaces are retained, but no legacy
 * useTransactionEditState / PendingAccount / onTransactionChange authority is
 * mounted. Only a typed canonical command patch exits this component.
 */
import { Ionicons } from "@expo/vector-icons";
import type { Category } from "@monyvi/db";
import {
  formatAmountInput,
  formatStoredAmountInput,
  getCurrencyPrecision,
  MAX_TRANSACTION_AMOUNT,
  parseAmountInput,
  parseStrictAmountInput,
} from "@monyvi/logic";
import Decimal from "decimal.js";
import React, { useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { palette } from "@/constants/colors";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";
import { formatToLocalDateString } from "@/utils/dateHelpers";
import { TypeTabs } from "../../add-transaction/TypeTabs";
import { CategorySelectorModal } from "../../modals/CategorySelectorModal";
import { getEditFormConfig } from "./get-edit-form-config";
import { SmsEditIcon } from "./SmsEditIcon";
import type {
  AccountReviewCommand,
  AccountReviewRow,
} from "../../../../../packages/logic/src/account-review/review-schemas";

type TransactionEditPatch = Extract<
  AccountReviewCommand,
  { kind: "edit_row_transaction" }
>["patch"];

export interface ControlledReviewTransactionEditModalProps {
  readonly controlledReview: true;
  readonly visible: boolean;
  readonly ownerId: string;
  readonly row: AccountReviewRow;
  readonly signal?: AbortSignal;
  readonly isBusy?: boolean;
  /** Resolve true only after canonical reducer/service accepted the command. */
  readonly onSubmit: (patch: TransactionEditPatch) => Promise<boolean>;
  readonly onClose: () => void;
}

export interface ControlledReviewTransactionEditPresentationProps extends ControlledReviewTransactionEditModalProps {
  /** Shaped by the owner-scoped hook, never queried by this component. */
  readonly categories: readonly Category[];
  readonly categoriesLoaded: boolean;
  readonly categoryLoadFailed: boolean;
}

export function ControlledReviewTransactionEditModal({
  visible,
  row,
  signal,
  isBusy = false,
  onSubmit,
  onClose,
  categories,
  categoriesLoaded,
  categoryLoadFailed,
}: ControlledReviewTransactionEditPresentationProps): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const bottomInset = useModalBottomInset();
  const config = useMemo(
    () => getEditFormConfig(row.transaction),
    [row.transaction]
  );
  const [amount, setAmount] = useState(() =>
    formatStoredAmountInput(row.transaction.amount)
  );
  const [amountTouched, setAmountTouched] = useState(false);
  const [counterparty, setCounterparty] = useState(
    row.transaction.counterparty ?? ""
  );
  const [note, setNote] = useState(
    row.source === "VOICE" ? row.transaction.note : ""
  );
  const [type, setType] = useState(row.transaction.type);
  const [categoryId, setCategoryId] = useState<string | null>(
    row.transaction.categoryId
  );
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A ref gates even the same frame between a Save tap and React rerender.
  const submitting = useRef(false);
  const sms = row.source === "SMS";
  const inactive =
    !visible ||
    isBusy ||
    saving ||
    submitting.current ||
    signal?.aborted === true;
  const dismiss = (): void => {
    // All four dismiss surfaces share this rule; an accepted command may
    // complete durably after its outward promise is initially pending.
    if (isBusy || saving || submitting.current) return;
    onClose();
  };

  const category = categories.find(
    (candidate) => candidate.id === categoryId && candidate.type === type
  );
  const categoryLabel =
    category?.displayName ??
    (categoryId === row.transaction.categoryId && type === row.transaction.type
      ? row.transaction.categoryDisplayName
      : t("select_category_label"));
  const pickerCategories = categories.filter(
    (candidate) =>
      candidate.type === type && (candidate.level === 1 || !candidate.parentId)
  );

  const submit = async (): Promise<void> => {
    if (inactive || signal?.aborted) return;
    setFormError(null);
    // Build only the fields the user actually changed. An unresolved
    // currency must NOT prevent independent note/counterparty/category edits,
    // or clear the original currency-needed blocker.
    const patch: {
      amountDecimal?: string;
      categoryId?: string;
      counterparty?: string;
      type?: "EXPENSE" | "INCOME";
      note?: string;
    } = {};
    if (
      config.showCounterparty &&
      counterparty !== (row.transaction.counterparty ?? "")
    ) {
      patch.counterparty = counterparty;
    }
    if (row.source === "VOICE") {
      if (note !== row.transaction.note) patch.note = note;
      if (config.showTypeToggle && type !== row.transaction.type)
        patch.type = type;
    }
    if (
      config.showCategory &&
      (categoryTouched ||
        categoryId !== row.transaction.categoryId ||
        type !== row.transaction.type)
    ) {
      // UI knows selectable IDs only. The real command writer independently
      // reloads current active category ownership/type before committing.
      if (!categoriesLoaded || !categoryId || !category) {
        setFormError(t("select_category_label"));
        return;
      }
      patch.categoryId = categoryId;
    }

    const amountNeedsValidation =
      amount !== formatStoredAmountInput(row.transaction.amount) ||
      (amountTouched && row.reviewReasons.includes("ambiguous_amount"));
    if (amountNeedsValidation) {
      // Strict financial currency + precision admission applies ONLY to an
      // actual amount patch (including explicit ambiguous-amount correction).
      const effectiveCurrency =
        row.currency.state === "known" ? row.currency.code : null;
      if (
        !effectiveCurrency ||
        effectiveCurrency !== row.transaction.currency
      ) {
        setFormError(t("invalid_amount"));
        return;
      }
      const parsed = parseStrictAmountInput(amount, {
        maxAmount: MAX_TRANSACTION_AMOUNT,
        maxFractionDigits: getCurrencyPrecision(effectiveCurrency),
      });
      if (!parsed.success) {
        setFormError(
          parsed.reason === "exceeds-precision"
            ? t("amount_precision_error", {
                precision: getCurrencyPrecision(effectiveCurrency),
              })
            : t("invalid_amount")
        );
        return;
      }
      const value = new Decimal(parsed.canonical).toFixed();
      if (
        value !== row.amountDecimal ||
        (amountTouched && row.reviewReasons.includes("ambiguous_amount"))
      ) {
        patch.amountDecimal = value;
      }
    }

    if (Object.keys(patch).length === 0) {
      dismiss();
      return;
    }
    if (signal?.aborted || submitting.current || isBusy) return;
    submitting.current = true;
    setSaving(true);
    try {
      if (signal?.aborted) return;
      const accepted = await onSubmit(patch);
      // Only the accepted canonical command may dismiss a submitted edit.
      if (accepted && !signal?.aborted) onClose();
    } catch {
      if (!signal?.aborted) setFormError(t("voice_error_default"));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal
      testID="account-review-edit-modal"
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={dismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-end"
      >
        <TouchableOpacity
          testID="account-review-edit-backdrop"
          onPress={dismiss}
          disabled={isBusy || saving}
          activeOpacity={1}
          className="flex-1 bg-black/50"
        />
        <View
          className={
            sms
              ? "max-h-[78%] rounded-t-3xl bg-white dark:bg-slate-900"
              : "max-h-[85%] rounded-t-3xl bg-white dark:bg-slate-900"
          }
        >
          <View className="items-center pb-2 pt-3">
            <View className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
          </View>
          <View className="mb-3 flex-row items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700/50">
            <TouchableOpacity
              testID="account-review-edit-cancel"
              onPress={dismiss}
              accessibilityRole="button"
              disabled={isBusy || saving}
            >
              <Text className="text-base font-bold text-slate-500">
                {t("cancel")}
              </Text>
            </TouchableOpacity>
            <Text className="text-lg font-bold text-slate-800 dark:text-white">
              {t("edit_transaction")}
            </Text>
            <TouchableOpacity
              testID="account-review-edit-save"
              onPress={() => void submit()}
              disabled={inactive}
              accessibilityRole="button"
              className="rounded-full bg-nileGreen-500 px-5 py-1.5"
            >
              <Text className="text-sm font-semibold text-white">
                {t("save")}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            className="px-7"
          >
            <View className="mb-4 flex-row items-center gap-3 px-1 py-2">
              <View className="me-3 h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20">
                <Ionicons
                  name="business-outline"
                  size={25}
                  color={palette.nileGreen[400]}
                />
              </View>
              <View className="flex-1">
                <Text className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {t("from_label")}
                </Text>
                <Text
                  numberOfLines={1}
                  className="text-sm font-semibold text-slate-800 dark:text-white"
                >
                  {row.transaction.originLabel}
                </Text>
                <Text className="mt-0.5 text-[10px] text-slate-400">
                  {formatToLocalDateString(row.transaction.date)}
                </Text>
              </View>
            </View>

            {!sms && config.showTypeToggle && (
              <View className="mb-2">
                <TypeTabs
                  selectedType={type}
                  hideTransfer
                  containerClassName="mx-0"
                  onSelect={(chosen) => {
                    if (inactive) return;
                    if (chosen === "EXPENSE" || chosen === "INCOME") {
                      setType(chosen);
                      if (chosen !== type) {
                        setCategoryId(null);
                        setCategoryTouched(false);
                      }
                    }
                  }}
                />
              </View>
            )}
            {config.sourceTypeBadge && (
              <View className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/15 p-3">
                <Text className="text-sm font-bold text-amber-500">
                  {config.sourceTypeBadge.label}
                </Text>
              </View>
            )}

            <View
              className={
                sms
                  ? "overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                  : "mb-3"
              }
            >
              <View
                testID="account-review-edit-amount"
                className={
                  sms
                    ? "min-h-16 flex-row items-center border-b border-slate-200 px-4 py-3 dark:border-slate-700"
                    : "mb-4 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 dark:border-slate-700/50 dark:bg-slate-800/60"
                }
              >
                {sms && (
                  <SmsEditIcon
                    name="cash-outline"
                    color={palette.nileGreen[500]}
                  />
                )}
                <View className="ms-3 flex-1">
                  <Text className="text-xs font-medium text-text-muted dark:text-text-muted-dark">
                    {t("amount")}
                  </Text>
                  <View className="flex-row items-center">
                    <Text className="me-2 text-base font-semibold text-text-primary dark:text-text-primary-dark">
                      {row.transaction.currency}
                    </Text>
                    <TextInput
                      testID="account-review-edit-amount-input"
                      editable={!inactive}
                      value={formatAmountInput(amount)}
                      onChangeText={(value) => {
                        setAmountTouched(true);
                        setAmount(parseAmountInput(value, amount));
                      }}
                      keyboardType="numeric"
                      returnKeyType="next"
                      className="min-h-8 flex-1 p-0 text-base font-semibold text-text-primary dark:text-text-primary-dark"
                      placeholder="0.00"
                      placeholderTextColor={palette.slate[500]}
                    />
                  </View>
                </View>
              </View>

              {config.showCounterparty && (
                <View
                  testID="account-review-edit-counterparty"
                  className={
                    sms
                      ? "min-h-16 flex-row items-center border-b border-slate-200 px-4 py-3 dark:border-slate-700"
                      : "mb-4 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 dark:border-slate-700/50 dark:bg-slate-800/60"
                  }
                >
                  {sms && (
                    <SmsEditIcon
                      name="storefront-outline"
                      color={palette.blue[500]}
                    />
                  )}
                  <View className="ms-3 flex-1">
                    <Text className="text-xs font-medium text-text-muted dark:text-text-muted-dark">
                      {type === "EXPENSE" ? t("merchant") : t("payee")}
                    </Text>
                    <TextInput
                      testID="account-review-edit-counterparty-input"
                      value={counterparty}
                      editable={!inactive}
                      onChangeText={setCounterparty}
                      placeholder={t("counterparty_placeholder")}
                      placeholderTextColor={palette.slate[500]}
                      className="min-h-8 p-0 text-base font-semibold text-text-primary dark:text-text-primary-dark"
                    />
                  </View>
                </View>
              )}

              {row.source === "VOICE" && (
                <View className="mb-4 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 dark:border-slate-700/50 dark:bg-slate-800/60">
                  <Text className="text-xs text-slate-500">
                    {t("note_label")}
                  </Text>
                  <TextInput
                    testID="account-review-edit-note"
                    multiline
                    value={note}
                    onChangeText={setNote}
                    editable={!inactive}
                    placeholder={t("note_edit_placeholder")}
                    placeholderTextColor={palette.slate[500]}
                    className="text-base font-semibold text-text-primary dark:text-text-primary-dark"
                  />
                </View>
              )}

              {config.showCategory && (
                <TouchableOpacity
                  testID="account-review-edit-category"
                  disabled={inactive || !categoriesLoaded}
                  onPress={() => setCategoryPickerOpen(true)}
                  activeOpacity={0.7}
                  className={
                    sms
                      ? "min-h-16 flex-row items-center border-b border-slate-200 px-4 py-3 dark:border-slate-700"
                      : "mb-4 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 dark:border-slate-700/50 dark:bg-slate-800/60"
                  }
                >
                  {sms && (
                    <SmsEditIcon
                      name="pricetag-outline"
                      color={palette.violet[500]}
                    />
                  )}
                  <View className="ms-3 flex-1">
                    <Text className="text-xs font-medium text-text-muted dark:text-text-muted-dark">
                      {t("category")}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="text-base font-semibold text-text-primary dark:text-text-primary-dark"
                    >
                      {categoryLabel}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={22}
                    color={palette.slate[400]}
                  />
                </TouchableOpacity>
              )}
            </View>
            {categoryLoadFailed && config.showCategory && (
              <Text
                testID="account-review-edit-categories-error"
                className="mt-2 text-xs text-red-500"
              >
                {t("voice_error_default")}
              </Text>
            )}
            {formError && (
              <Text
                testID="account-review-edit-error"
                className="mt-2 text-xs text-red-500"
              >
                {formError}
              </Text>
            )}
            <View style={{ height: bottomInset + 32 }} />
          </ScrollView>
        </View>
        <CategorySelectorModal
          visible={categoryPickerOpen && categoriesLoaded && !inactive}
          rootCategories={pickerCategories}
          selectedId={categoryId}
          type={type}
          onSelect={(id) => {
            if (
              !inactive &&
              categories.some(
                (record) => record.id === id && record.type === type
              )
            ) {
              setCategoryId(id);
              setCategoryTouched(true);
            }
          }}
          onClose={() => setCategoryPickerOpen(false)}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}
