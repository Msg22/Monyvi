/**
 * BalanceChangedSheet Component
 *
 * A bottom-sheet overlay that appears when the user saves an account with a changed balance.
 * Displays the balance difference and offers two options:
 * 1. "Just update" - silently updates the balance
 * 2. "Track as Transaction" - creates a balance adjustment transaction
 *
 * Architecture & Design Rationale:
 * - Pattern: Presentational overlay component (no business logic)
 * - SOLID: SRP - only displays balance change UI, delegates action to parent
 * - Uses absolute overlay to avoid NativeWind v4 Modal race conditions
 *
 * @module BalanceChangedSheet
 */

import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import type { CurrencyType } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";
import React, { useEffect, useState } from "react";
import {
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useColorScheme,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette } from "@/constants/colors";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Size for the header swap-vertical icon. */
const HEADER_ICON_SIZE = 28;

/** Size for the arrow-forward icon between balance values. */
const ARROW_ICON_SIZE = 18;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  blurFill: {
    ...StyleSheet.absoluteFillObject,
  },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Whether to track the balance change as a transaction or silently update. */
type BalanceChangeOption = "silent" | "tracked";

interface BalanceChangedSheetProps {
  /** Whether the sheet is visible */
  readonly visible: boolean;
  /** Fires when the user confirms their choice */
  readonly onConfirm: (option: BalanceChangeOption) => void;
  /** Fires when the user dismisses the sheet */
  readonly onCancel: () => void;
  /** The balance before the edit */
  readonly previousBalance: number;
  /** The new balance after the edit */
  readonly newBalance: number;
  /** The account currency code (e.g., "EGP") for display */
  readonly currencyCode: CurrencyType;
  /** Whether a submission is in progress */
  readonly isSubmitting?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a balance amount with the centralized money display policy.
 * Whole values omit the fraction; meaningful fractions are retained.
 */
function formatAmount(amount: number, currency: CurrencyType): string {
  return formatCurrency({ amount, currency });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BalanceChangedSheet({
  visible,
  onConfirm,
  onCancel,
  previousBalance,
  newBalance,
  currencyCode,
  isSubmitting = false,
}: BalanceChangedSheetProps): React.JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { t } = useTranslation("accounts");
  const insets = useSafeAreaInsets();
  const [selectedOption, setSelectedOption] =
    useState<BalanceChangeOption>("silent");

  // Reset selection to default when modal opens
  useEffect(() => {
    if (visible) {
      setSelectedOption("silent");
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        onCancel();
        return true;
      }
    );

    return () => subscription.remove();
  }, [visible, onCancel]);

  const difference = newBalance - previousBalance;
  const isIncrease = difference > 0;
  const isDecrease = difference < 0;
  const changeLabel = isIncrease
    ? t("increase")
    : isDecrease
      ? t("decrease")
      : t("no_change");
  const changeColor = isIncrease
    ? palette.nileGreen[500]
    : isDecrease
      ? palette.red[500]
      : palette.slate[500];
  const changeSign = isIncrease ? "+" : isDecrease ? "-" : "";

  if (!visible) {
    return <></>;
  }

  return (
    <View style={styles.overlay}>
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <TouchableWithoutFeedback>
        <View style={styles.sheet}>
          <BlurView
            intensity={20}
            tint={isDark ? "dark" : "light"}
            style={styles.blurFill}
          />
          <View className="absolute inset-0 bg-white/95 dark:bg-slate-900/95" />

          <View
            className="px-6 pt-6"
            style={{ paddingBottom: Math.max(insets.bottom + 24, 40) }}
          >
            {/* Handle bar */}
            <View className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 self-center mb-6" />

            {/* Header */}
            <View className="items-center mb-6">
              <View className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-500/20 justify-center items-center mb-3">
                <Ionicons
                  name="swap-vertical"
                  size={HEADER_ICON_SIZE}
                  color={palette.gold[500]}
                />
              </View>
              <Text className="text-xl font-bold text-slate-800 dark:text-slate-100 text-center">
                {t("balance_changed")}
              </Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1">
                {t("balance_change_question")}
              </Text>
            </View>

            {/* Balance Summary Card */}
            <View className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 mb-6 border border-slate-100 dark:border-slate-700/40">
              {/* Previous to New */}
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-1">
                  <Text className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                    {t("previous")}
                  </Text>
                  <Text className="text-base font-bold text-slate-600 dark:text-slate-300">
                    {formatAmount(previousBalance, currencyCode)}
                  </Text>
                </View>
                <Ionicons
                  name="arrow-forward"
                  size={ARROW_ICON_SIZE}
                  color={isDark ? palette.slate[500] : palette.slate[400]}
                />
                <View className="flex-1 items-end">
                  <Text className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                    {t("new_label")}
                  </Text>
                  <Text className="text-base font-bold text-slate-800 dark:text-white">
                    {formatAmount(newBalance, currencyCode)}
                  </Text>
                </View>
              </View>

              {/* Divider */}
              <View className="h-px bg-slate-200 dark:bg-slate-700 my-2" />

              {/* Difference */}
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  {changeLabel}
                </Text>
                <Text
                  className="text-lg font-black"
                  style={{ color: changeColor }}
                >
                  {changeSign}
                  {formatAmount(Math.abs(difference), currencyCode)}
                </Text>
              </View>
            </View>

            {/* Options */}
            <View className="mb-6">
              {/* Option 1: Silent */}
              <TouchableOpacity
                onPress={() => setSelectedOption("silent")}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityLabel={t("just_update_balance")}
                accessibilityState={{
                  checked: selectedOption === "silent",
                }}
                className={`flex-row items-center p-4 rounded-xl mb-2 border ${
                  selectedOption === "silent"
                    ? "border-nileGreen-500 bg-nileGreen-50 dark:bg-nileGreen-900/20"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              >
                <View
                  className={`w-5 h-5 rounded-full border-2 me-3 items-center justify-center ${
                    selectedOption === "silent"
                      ? "border-nileGreen-500"
                      : "border-slate-300 dark:border-slate-600"
                  }`}
                >
                  {selectedOption === "silent" && (
                    <View className="w-2.5 h-2.5 rounded-full bg-nileGreen-500" />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-slate-800 dark:text-white">
                    {t("just_update_balance")}
                  </Text>
                  <Text className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {t("silent_adjust_description")}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Option 2: Tracked */}
              <TouchableOpacity
                onPress={() => setSelectedOption("tracked")}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityLabel={t("track_as_transaction")}
                accessibilityState={{
                  checked: selectedOption === "tracked",
                }}
                className={`flex-row items-center p-4 rounded-xl border ${
                  selectedOption === "tracked"
                    ? "border-nileGreen-500 bg-nileGreen-50 dark:bg-nileGreen-900/20"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              >
                <View
                  className={`w-5 h-5 rounded-full border-2 me-3 items-center justify-center ${
                    selectedOption === "tracked"
                      ? "border-nileGreen-500"
                      : "border-slate-300 dark:border-slate-600"
                  }`}
                >
                  {selectedOption === "tracked" && (
                    <View className="w-2.5 h-2.5 rounded-full bg-nileGreen-500" />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-slate-800 dark:text-white">
                    {t("track_as_transaction")}
                  </Text>
                  <Text className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {t("track_as_transaction_description")}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Action Button */}
            <TouchableOpacity
              onPress={() => onConfirm(selectedOption)}
              disabled={isSubmitting}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t("confirm_balance_change")}
              className={`py-4 rounded-xl items-center ${
                isSubmitting ? "bg-nileGreen-400" : "bg-nileGreen-500"
              }`}
            >
              <Text className="text-base font-bold text-white">
                {isSubmitting ? t("saving") : t("confirm_balance_change")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}
