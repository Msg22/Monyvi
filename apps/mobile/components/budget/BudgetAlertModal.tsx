/**
 * BudgetAlertModal Component
 *
 * In-app alert modal shown when spending crosses a budget threshold.
 * Two variants: WARNING (amber) and DANGER (red).
 * Includes "View Budget" and "Got It" buttons.
 *
 * @module BudgetAlertModal
 */

import React from "react";
import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/constants/colors";
import type { BudgetAlert } from "@/services/budget-alert-service";
import { formatCurrency } from "@monyvi/logic";
import { useTranslation } from "react-i18next";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BudgetAlertModalProps {
  readonly visible: boolean;
  readonly alert: BudgetAlert | null;
  readonly onDismiss: () => void;
  readonly onViewBudget: (budgetId: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Level configuration is now derived dynamically using translations

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BudgetAlertModal({
  visible,
  alert,
  onDismiss,
  onViewBudget,
}: BudgetAlertModalProps): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const bottomInset = useModalBottomInset();

  if (!alert) return <></>;

  const percentage = Math.round(alert.percentage);
  const overage = alert.spent - alert.limit;

  // Dynamic level config using translations
  const levelConfig = {
    WARNING: {
      icon: "warning-outline" as const,
      headerBg: palette.gold[600],
      iconBg: palette.gold[100],
      iconColor: palette.gold[800],
      title: t("alert_warning_title"),
      dismissLabel: t("alert_got_it"),
    },
    DANGER: {
      icon: "alert-circle-outline" as const,
      headerBg: palette.red[500],
      iconBg: palette.red[100],
      iconColor: palette.red[600],
      title: t("alert_over_budget_title"),
      dismissLabel: t("alert_dismiss"),
    },
  };

  const config = levelConfig[alert.level];

  // Dynamic subtitle with specific numbers
  const subtitle =
    alert.level === "WARNING"
      ? t("alert_warning_subtitle", { percentage })
      : t("alert_over_budget_subtitle", {
          overage: formatCurrency({
            amount: overage,
            currency: alert.currency,
            maximumFractionDigits: 0,
          }),
        });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable
        className="flex-1 bg-black/50 justify-center items-center px-6"
        style={{ paddingBottom: bottomInset }}
        onPress={onDismiss}
      >
        <Pressable
          className="w-full max-w-[340px] rounded-3xl overflow-hidden bg-white dark:bg-slate-800"
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View
            className="items-center py-6 px-4"
            style={{ backgroundColor: config.headerBg }}
          >
            <View
              className="w-16 h-16 rounded-full items-center justify-center mb-3"
              style={{ backgroundColor: config.iconBg }}
            >
              <Ionicons name={config.icon} size={32} color={config.iconColor} />
            </View>
            <Text className="text-xl font-bold text-white">{config.title}</Text>
            <Text className="text-sm text-white/80 mt-1">{subtitle}</Text>
          </View>

          {/* Content */}
          <View className="p-5">
            <Text className="text-base font-semibold text-slate-800 dark:text-white text-center mb-3">
              {alert.budgetName}
            </Text>

            {/* Progress bar */}
            <View className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-2">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(percentage, 100)}%`,
                  backgroundColor: config.headerBg,
                }}
              />
            </View>

            {/* Stats — show actual amounts */}
            <View className="flex-row justify-between mb-4">
              <Text
                className="text-sm font-bold"
                style={{ color: config.headerBg }}
              >
                {formatCurrency({
                  amount: alert.spent,
                  currency: alert.currency,
                })}
              </Text>
              <Text className="text-sm font-semibold text-slate-800 dark:text-white">
                {formatCurrency({
                  amount: alert.limit,
                  currency: alert.currency,
                })}
              </Text>
            </View>

            {/* S-12: Buttons — View Budget left, dismiss right */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => {
                  onViewBudget(alert.budgetId);
                }}
                className="flex-1 py-3 rounded-xl items-center bg-slate-100 dark:bg-slate-700"
              >
                <Text className="text-base font-semibold text-slate-600 dark:text-slate-300">
                  {t("view_budget")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onDismiss}
                className="flex-1 py-3 rounded-xl items-center"
                style={{ backgroundColor: config.headerBg }}
              >
                <Text className="text-base font-semibold text-white">
                  {config.dismissLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
