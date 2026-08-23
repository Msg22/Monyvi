/**
 * FeaturedPaymentCard — The main highlighted upcoming payment card.
 *
 * Displays a prominent card with a large icon, payment name, amount,
 * due-date status, and a "Pay Now" action button.
 */

import { palette } from "@/constants/colors";
import { getDueText } from "@/utils/dateHelpers";
import { getPaymentIcon } from "@/utils/recurring-helpers";
import { calculateCalendarDaysUntil, formatCurrency } from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";

import type { FeaturedPaymentCardProps } from "./types";

const URGENT_DAYS_THRESHOLD = 3;

function FeaturedPaymentCardComponent({
  payment,
  onPayNow,
}: FeaturedPaymentCardProps): React.JSX.Element {
  const { t } = useTranslation("common");
  const iconName = getPaymentIcon(payment.name);

  const dueClass =
    calculateCalendarDaysUntil(payment.nextDueDate) <= URGENT_DAYS_THRESHOLD
      ? "text-red-400"
      : "text-nileGreen-400";

  return (
    <View className="flex-1 rounded-2xl p-4 items-center border-2 border-nileGreen-600/50 bg-slate-100 dark:bg-slate-800/90 shadow-lg shadow-nileGreen-500/30">
      {/* Large Icon in Circle */}
      <View className="w-16 h-16 rounded-full items-center justify-center mb-3 bg-nileGreen-100 dark:bg-nileGreen-800/50 border border-nileGreen-600">
        <Ionicons name={iconName} size={32} color={palette.nileGreen[400]} />
      </View>

      {/* Name */}
      <Text
        className="text-base font-semibold text-slate-900 dark:text-white text-center mb-1"
        numberOfLines={1}
      >
        {payment.name}
      </Text>

      {/* Amount */}
      <Text className="text-xl font-bold text-nileGreen-400 mb-1">
        {formatCurrency({
          amount: payment.amount,
          currency: payment.currency,
        })}
      </Text>

      {/* Days until due */}
      <Text className={`text-sm font-medium mb-4 ${dueClass}`}>
        {getDueText(payment.nextDueDate)}
      </Text>

      {/* Pay Now Button */}
      <TouchableOpacity
        onPress={onPayNow}
        className="bg-nileGreen-400 w-full py-3 rounded-xl items-center"
        activeOpacity={0.8}
      >
        <Text className="text-base font-bold text-slate-900">
          {t("pay_now")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export const FeaturedPaymentCard = React.memo(FeaturedPaymentCardComponent);
