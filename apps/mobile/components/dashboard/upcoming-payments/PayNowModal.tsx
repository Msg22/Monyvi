/**
 * PayNowModal — Modal for confirming and executing a recurring payment.
 *
 * Allows the user to adjust the amount, select a deduction account,
 * and confirm. Business logic (validation, DB writes) is delegated to
 * the `usePaymentSubmission` hook (SRP).
 */

import { formatCurrency } from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { buildAccountDisplayNames } from "@/utils/account-display";
import { formatAccountBalance } from "@/utils/financial-display";
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  ScrollView,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TextField } from "@/components/ui/TextField";
import { palette } from "@/constants/colors";
import { useAccounts } from "@/hooks/useAccounts";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";
import { usePaymentSubmission } from "@/hooks/usePaymentSubmission";
import { getDueText } from "@/utils/dateHelpers";

import type { PayNowModalProps } from "./types";

function normalizeEntityId(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

/**
 * Render a full-screen overlay to confirm and execute a recurring payment.
 *
 * When visible and a `payment` is provided, displays inputs for amount and account selection,
 * shows payment details, and allows the user to confirm or cancel the payment.
 *
 * On confirmation, creates a transaction linked to the recurring payment, updates the
 * recurring payment's next due date, closes the overlay, and calls `onSuccess` with the paid amount.
 * If transaction creation fails, displays an error toast and keeps the overlay open.
 */
export function PayNowModal({
  payment,
  visible,
  onClose,
  onSuccess,
}: PayNowModalProps): React.JSX.Element | null {
  const { accounts } = useAccounts();
  // Resolve display names so duplicate-named accounts (e.g. two "Cash"
  // accounts in different currencies) are visually disambiguated in the
  // payment-account picker — per spec 026-followup.
  const displayNames = useMemo(
    (): Map<string, string> => buildAccountDisplayNames(accounts),
    [accounts]
  );
  const insets = useSafeAreaInsets();
  const bottomInset = useModalBottomInset();
  const { t } = useTranslation("transactions");
  const { t: tCommon } = useTranslation("common");
  const [amount, setAmount] = useState<string>("");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null
  );
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const selectedAccount = useMemo(
    () =>
      accounts.find(
        (account) =>
          account.id === selectedAccountId &&
          account.currency === payment?.currency
      ),
    [accounts, payment?.currency, selectedAccountId]
  );

  const { isSubmitting, amountError, clearAmountError, submit } =
    usePaymentSubmission({
      payment,
      accountId: selectedAccount?.id ?? null,
      onSuccess,
      onClose,
    });

  // Reset amount, error, and account when modal opens or payment changes
  useEffect(() => {
    if (visible && payment) {
      setAmount(payment.amount.toString());
      clearAmountError();
      setSelectedAccountId(normalizeEntityId(payment.accountId));
      setShowAccountPicker(false);
    }
  }, [visible, payment, clearAmountError]);

  useEffect(() => {
    if (!visible) return;

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        onClose();
        return true;
      }
    );

    return () => subscription.remove();
  }, [visible, onClose]);

  if (!visible || !payment) return null;

  const isConfirmDisabled = isSubmitting || !selectedAccount;

  const handleAmountChange = (text: string): void => {
    setAmount(text);
    if (amountError) {
      const num = parseFloat(text);
      if (!isNaN(num) && num > 0) {
        clearAmountError();
      }
    }
  };

  return (
    <View
      testID="pay-now-overlay"
      accessibilityViewIsModal
      importantForAccessibility="yes"
      className="absolute inset-0 z-[999] items-center justify-center px-5"
      style={{
        paddingTop: insets.top,
        paddingBottom: Math.max(bottomInset, 16),
      }}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="absolute inset-0 bg-black/60" />
      </TouchableWithoutFeedback>

      <View className="w-full max-w-[340px] rounded-[20px] border p-6 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
        {/* Header */}
        <Text className="text-lg font-bold text-center mb-5 text-slate-800 dark:text-slate-25">
          {t("pay_name", { name: payment.name })}
        </Text>

        {/* Amount Input — uses project TextField component */}
        <TextField
          label={t("amount_currency", { currency: payment.currency })}
          value={amount}
          onChangeText={handleAmountChange}
          keyboardType="decimal-pad"
          placeholder="0.00"
          error={amountError}
        />

        {/* Account Selector */}
        <View className="mb-4">
          <Text className="text-sm font-medium mb-2 text-slate-500 dark:text-slate-400">
            {t("deduct_from")}
          </Text>
          <TouchableOpacity
            onPress={() => setShowAccountPicker(!showAccountPicker)}
            className="px-4 py-3 rounded-xl border flex-row items-center justify-between bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600"
          >
            <View className="flex-row items-center">
              <Ionicons
                name="wallet-outline"
                size={18}
                color={palette.slate[500]}
                className="me-2"
              />
              <Text className="text-base font-medium text-slate-800 dark:text-white">
                {selectedAccount
                  ? (displayNames.get(selectedAccount.id) ??
                    selectedAccount.name)
                  : t("select_account")}
              </Text>
            </View>
            <Ionicons
              name={showAccountPicker ? "chevron-up" : "chevron-down"}
              size={18}
              color={palette.slate[500]}
            />
          </TouchableOpacity>

          {/* Account Picker Dropdown */}
          {showAccountPicker && (
            <View className="mt-2 rounded-xl border overflow-hidden bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600">
              <ScrollView style={{ maxHeight: 150 }}>
                {accounts
                  .filter((a) => a.currency === payment.currency)
                  .map((account) => (
                    <TouchableOpacity
                      key={account.id}
                      onPress={() => {
                        setSelectedAccountId(account.id);
                        setShowAccountPicker(false);
                      }}
                      className={`px-4 py-3 flex-row items-center justify-between border-b border-slate-200 dark:border-slate-600 ${
                        account.id === selectedAccountId
                          ? "bg-nileGreen-50 dark:bg-nileGreen-800/30"
                          : ""
                      }`}
                    >
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-slate-800 dark:text-white">
                          {displayNames.get(account.id) ?? account.name}
                        </Text>
                        <Text className="text-xs text-slate-500 dark:text-slate-400">
                          {formatAccountBalance(account)}
                        </Text>
                      </View>
                      {account.id === selectedAccountId && (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={palette.nileGreen[500]}
                        />
                      )}
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Balance Warning */}
        {selectedAccount &&
          !isNaN(parseFloat(amount)) &&
          parseFloat(amount) > 0 &&
          selectedAccount.balance < parseFloat(amount) && (
            <View className="mb-3 px-3 py-2.5 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/40 flex-row items-center">
              <Ionicons
                name="warning-outline"
                size={16}
                color={palette.orange[500]}
                style={{ marginEnd: 8 }}
              />
              <Text className="flex-1 text-xs text-orange-700 dark:text-orange-300">
                {t("balance_warning", {
                  balance: formatCurrency({
                    amount: selectedAccount.balance - parseFloat(amount),
                    currency: selectedAccount.currency,
                  }),
                })}
              </Text>
            </View>
          )}

        {/* Payment Info */}
        <View className="gap-2 mb-4">
          <View className="flex-row justify-between items-center">
            <Text className="text-sm text-slate-500 dark:text-slate-400">
              {t("original_amount")}
            </Text>
            <Text className="text-sm text-slate-600 dark:text-slate-300">
              {formatCurrency({
                amount: payment.amount,
                currency: payment.currency,
              })}
            </Text>
          </View>
          <View className="flex-row justify-between items-center">
            <Text className="text-sm text-slate-500 dark:text-slate-400">
              {t("due_label")}
            </Text>
            <Text
              className={`text-sm font-semibold ${
                payment.daysUntilDue <= 0
                  ? "text-red-500"
                  : "text-slate-800 dark:text-slate-25"
              }`}
            >
              {getDueText(payment.nextDueDate)}
            </Text>
          </View>
        </View>

        {/* Info text */}
        <Text className="text-xs text-center mb-5 leading-[18px] text-slate-500 dark:text-slate-400">
          {t("payment_confirmation_text")}
        </Text>

        {/* Buttons */}
        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3 rounded-xl border items-center border-slate-300 dark:border-slate-700"
          >
            <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {tCommon("cancel")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="pay-now-confirm"
            onPress={() => submit(amount)}
            disabled={isConfirmDisabled}
            className={`flex-1 py-3 rounded-xl items-center ${
              isSubmitting
                ? "bg-nileGreen-600"
                : !selectedAccount
                  ? "bg-slate-300 dark:bg-slate-700"
                  : "bg-nileGreen-500"
            }`}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-sm font-semibold text-white">
                {tCommon("confirm")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
