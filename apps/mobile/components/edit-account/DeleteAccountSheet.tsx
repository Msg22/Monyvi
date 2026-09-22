/**
 * DeleteAccountSheet Component
 *
 * A confirmation bottom sheet for deleting an account. Shows a warning
 * with the account name, balance, and count of linked records that will
 * be cascade-deleted.
 *
 * Architecture & Design Rationale:
 * - Pattern: Presentational overlay component (no business logic)
 * - SOLID: SRP — displays delete confirmation UI, delegates action to parent
 * - Uses absolute overlay to avoid NativeWind v4 Modal race conditions
 *
 * @module DeleteAccountSheet
 */

import type { CurrencyType } from "@monyvi/db";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { formatLocalizedMoneyAmount } from "@/utils/localized-money-display";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
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
import type { TFunction } from "i18next";
import { palette } from "@/constants/colors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LinkedRecordsCounts {
  readonly transactions: number;
  readonly transfers: number;
  readonly debts: number;
  readonly recurringPayments: number;
}

interface DeleteAccountSheetProps {
  /** Whether the sheet is visible */
  readonly visible: boolean;
  /** Fires when the user confirms deletion */
  readonly onConfirm: () => void;
  /** Fires when the user cancels */
  readonly onCancel: () => void;
  /** The account name for display */
  readonly accountName: string;
  /** The account balance for display */
  readonly accountBalance: number;
  /** The account currency code */
  readonly currencyCode: CurrencyType;
  /** Counts of linked records that will be deleted */
  readonly linkedRecords: LinkedRecordsCounts;
  /** Whether a delete operation is in progress */
  readonly isDeleting?: boolean;
  /** Whether linked record counts are being loaded */
  readonly isLoadingCounts?: boolean;
}

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

/**
 * Builds a localized summary string of linked records that will be deleted.
 * Uses i18next pluralization with the accounts namespace.
 */
function buildLinkedSummary(
  counts: LinkedRecordsCounts,
  t: TFunction<"accounts">
): string {
  const parts: string[] = [];
  if (counts.transactions > 0) {
    parts.push(t("transaction_count", { count: counts.transactions }));
  }
  if (counts.transfers > 0) {
    parts.push(t("transfer_count", { count: counts.transfers }));
  }
  if (counts.debts > 0) {
    parts.push(t("debt_count", { count: counts.debts }));
  }
  if (counts.recurringPayments > 0) {
    parts.push(
      t("recurring_payment_count", { count: counts.recurringPayments })
    );
  }
  return parts.length > 0 ? parts.join(", ") : t("no_linked_records");
}

function LinkedRecordsSkeleton(): React.JSX.Element {
  return (
    <View className="rounded-2xl bg-slate-100 dark:bg-slate-800/70 p-4 mb-6">
      <View className="h-4 w-2/5 rounded-full bg-slate-200 dark:bg-slate-700 mb-3" />
      <View className="h-3 w-4/5 rounded-full bg-slate-200 dark:bg-slate-700 mb-2" />
      <View className="h-3 w-3/5 rounded-full bg-slate-200 dark:bg-slate-700" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeleteAccountSheet({
  visible,
  onConfirm,
  onCancel,
  accountName,
  accountBalance,
  currencyCode,
  linkedRecords,
  isDeleting = false,
  isLoadingCounts = false,
}: DeleteAccountSheetProps): React.JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { t } = useTranslation("accounts");
  const { t: tCommon } = useTranslation("common");
  const insets = useSafeAreaInsets();

  const totalLinked =
    linkedRecords.transactions +
    linkedRecords.transfers +
    linkedRecords.debts +
    linkedRecords.recurringPayments;

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

            {/* Warning Header */}
            <View className="items-center mb-6">
              <View className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-500/20 justify-center items-center mb-3">
                <Ionicons
                  name="trash-outline"
                  size={28}
                  color={palette.red[500]}
                />
              </View>
              <Text className="text-xl font-bold text-slate-800 dark:text-slate-100 text-center">
                {t("delete_account_title")}
              </Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1">
                {t("action_cannot_be_undone")}
              </Text>
            </View>

            {/* Account Info Card */}
            <View className="rounded-2xl bg-red-50 dark:bg-red-900/10 p-4 mb-4 border border-red-100 dark:border-red-800/30">
              <Text className="text-base font-bold text-slate-800 dark:text-white mb-1">
                {accountName}
              </Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400">
                {t("balance_label")}{" "}
                <Text className="font-semibold text-slate-700 dark:text-slate-200">
                  {formatLocalizedMoneyAmount({
                    amount: accountBalance,
                    currency: currencyCode,
                  })}
                </Text>
              </Text>
            </View>

            {isLoadingCounts && <LinkedRecordsSkeleton />}

            {/* Linked Records Warning */}
            {!isLoadingCounts && totalLinked > 0 && (
              <View className="rounded-2xl bg-amber-50 dark:bg-amber-900/10 p-4 mb-6 border border-amber-100 dark:border-amber-800/30">
                <View className="flex-row items-center mb-2">
                  <Ionicons
                    name="warning-outline"
                    size={18}
                    color={palette.gold[500]}
                  />
                  <Text className="ms-2 text-sm font-bold text-amber-700 dark:text-amber-300">
                    {t("deletion_warning_linked_data")}
                  </Text>
                </View>
                <Text className="text-sm text-amber-600 dark:text-amber-400 ms-6">
                  {buildLinkedSummary(linkedRecords, t)}
                </Text>
              </View>
            )}

            {!isLoadingCounts && totalLinked === 0 && (
              <View className="mb-6">
                <Text className="text-sm text-slate-400 dark:text-slate-500 text-center">
                  {t("no_linked_records")}
                </Text>
              </View>
            )}

            {/* Actions */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 py-3.5 rounded-xl items-center justify-center bg-slate-100 dark:bg-slate-800"
                onPress={onCancel}
                disabled={isDeleting}
              >
                <Text className="text-base font-semibold text-slate-600 dark:text-slate-300">
                  {tCommon("cancel")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="delete-account-confirm-button"
                accessibilityRole="button"
                accessibilityLabel={t("delete_account")}
                accessibilityState={{
                  disabled: isDeleting,
                  busy: isDeleting,
                }}
                className="flex-1 py-3.5 rounded-xl items-center justify-center bg-red-500"
                onPress={onConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-base font-semibold text-white">
                    {t("delete_account")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}
