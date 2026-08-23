/**
 * MiniPaymentItem — A compact row for secondary upcoming payments.
 *
 * Displayed beside the featured card to show the next 1-2 upcoming bills
 * in a condensed format with icon, name, and due-date status.
 */

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import { palette } from "@/constants/colors";
import { getDueText } from "@/utils/dateHelpers";
import { getPaymentIcon } from "@/utils/recurring-helpers";
import { calculateCalendarDaysUntil } from "@monyvi/logic";

import type { MiniPaymentItemProps } from "./types";

const URGENT_DAYS_THRESHOLD = 3;

function MiniPaymentItemComponent({
  payment,
}: MiniPaymentItemProps): React.JSX.Element {
  const dueText = getDueText(payment.nextDueDate);
  const iconName = getPaymentIcon(payment.name);

  const dueClass =
    calculateCalendarDaysUntil(payment.nextDueDate) <= URGENT_DAYS_THRESHOLD
      ? "text-red-400"
      : "text-slate-500 dark:text-slate-400";

  return (
    <View className="flex-row items-center rounded-xl p-3 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
      {/* Icon */}
      <View className="w-10 h-10 rounded-lg items-center justify-center me-3 bg-slate-200 dark:bg-slate-700/50">
        <Ionicons name={iconName} size={20} color={palette.nileGreen[400]} />
      </View>

      {/* Content */}
      <View className="flex-1">
        <Text
          className="text-sm font-semibold text-slate-900 dark:text-white mb-0.5"
          numberOfLines={1}
        >
          {payment.name}
        </Text>
        <Text className={`text-xs font-medium ${dueClass}`}>{dueText}</Text>
      </View>

      {/* Arrow */}
      <View className="w-6 h-6 rounded-full items-center justify-center bg-nileGreen-500/20">
        <Ionicons
          name="chevron-forward"
          size={14}
          color={palette.nileGreen[400]}
        />
      </View>
    </View>
  );
}

export const MiniPaymentItem = React.memo(MiniPaymentItemComponent);
