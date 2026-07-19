/**
 * UpcomingPayments Section — Dashboard upcoming bills preview.
 *
 * Design: Featured payment card + side mini-items list + Pay Now modal.
 * Shows the next N upcoming expense payments sorted by due date.
 * The section does not render when there are no upcoming payments.
 */

import { useToast } from "@/components/ui/Toast";
import { palette } from "@/constants/colors";
import { UpcomingPaymentsSkeleton } from "@/components/dashboard/skeletons/UpcomingPaymentsSkeleton";
import {
  useRecurringPayments,
  getBillsPeriodDateRange,
  type BillsPeriodFilter,
} from "@/hooks/useRecurringPayments";
import type { CurrencyType, RecurringPayment } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { translateBillsPeriod } from "@/utils/period-translation";
import { useTranslation } from "react-i18next";
import {
  FeaturedPaymentCard,
  MiniPaymentItem,
  PayNowModal,
} from "./upcoming-payments";

// Constants

const PAYMENT_LIMIT = 5;
const SIDE_PAYMENTS_COUNT = 3;
const TOAST_DURATION_MS = 3500;
const DEFAULT_PERIOD: BillsPeriodFilter = "this_month";
const PERIOD_OPTIONS: readonly BillsPeriodFilter[] = [
  "this_week",
  "this_month",
  "six_months",
  "one_year",
];

/**
 * Render the "Upcoming Bills" section with a featured payment, side mini items, a total due row, and a Pay Now modal.
 *
 * Displays a loading indicator while payments are loading and renders nothing when there are no upcoming payments. When a payment is completed via the modal, a success toast is shown containing the payment name and formatted amount using the user's preferred currency.
 *
 * @returns The JSX element for the Upcoming Bills UI, or an empty fragment when there are no upcoming payments.
 */

function UpcomingPaymentsComponent(): React.JSX.Element {
  const { showToast } = useToast();
  const { preferredCurrency } = usePreferredCurrency();
  const { t } = useTranslation("common");

  // Period filter state (FR-007: default is "This Month")
  const [selectedPeriod, setSelectedPeriod] =
    useState<BillsPeriodFilter>(DEFAULT_PERIOD);

  const dateRange = useMemo(
    () => getBillsPeriodDateRange(selectedPeriod),
    [selectedPeriod]
  );

  const {
    filteredPayments: payments,
    totalDueFiltered,
    isLoading,
  } = useRecurringPayments({
    limit: PAYMENT_LIMIT,
    status: "ACTIVE",
    type: "EXPENSE",
    dateRange,
  });
  const [selectedPayment, setSelectedPayment] =
    useState<RecurringPayment | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const handlePayNow = useCallback((payment: RecurringPayment): void => {
    setSelectedPayment(payment);
    setModalVisible(true);
  }, []);

  const handleSuccess = useCallback(
    (
      amount: number,
      paymentName: string,
      paymentCurrency: CurrencyType
    ): void => {
      showToast({
        type: "success",
        title: t("payment_recorded"),
        message: `${paymentName} - ${formatCurrency({
          amount,
          currency: paymentCurrency,
        })}`,
        duration: TOAST_DURATION_MS,
      });
    },
    [showToast, t]
  );

  const handleSeeAll = useCallback((): void => {
    router.push("/recurring-payments");
  }, []);

  const handleModalClose = useCallback((): void => {
    setModalVisible(false);
  }, []);

  const handlePeriodSelect = useCallback((period: BillsPeriodFilter): void => {
    setSelectedPeriod(period);
  }, []);

  // Split payments for display
  const featuredPayment = payments[0];
  const sidePayments = payments.slice(1, SIDE_PAYMENTS_COUNT);

  // Don't render section if no payments exist at all (before filter)
  if (
    !isLoading &&
    payments.length === 0 &&
    selectedPeriod === DEFAULT_PERIOD
  ) {
    return <></>;
  }

  if (isLoading) {
    return <UpcomingPaymentsSkeleton />;
  }

  return (
    <View className="my-4 rounded-2xl border p-4 overflow-hidden bg-slate-100/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-lg font-bold text-slate-800 dark:text-slate-25">
          {t("upcoming_bills")}
        </Text>
        <TouchableOpacity
          onPress={handleSeeAll}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="flex-row items-center"
        >
          <Text className="text-sm font-semibold text-nileGreen-500">
            {t("see_all")}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={14}
            color={palette.nileGreen[500]}
            className="ms-1"
          />
        </TouchableOpacity>
      </View>

      {/* Period filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mb-3"
        contentContainerClassName="gap-2"
      >
        {PERIOD_OPTIONS.map((period) => (
          <TouchableOpacity
            key={period}
            onPress={() => handlePeriodSelect(period)}
            className={`px-3 py-1.5 rounded-full ${
              selectedPeriod === period
                ? "bg-nileGreen-500"
                : "bg-slate-200 dark:bg-slate-700"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                selectedPeriod === period
                  ? "text-white"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {translateBillsPeriod(t, period)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {payments.length === 0 ? (
        /* Empty state (FR-010) */
        <View className="h-[120px] items-center justify-center">
          <Ionicons
            name="receipt-outline"
            size={32}
            color={palette.slate[400]}
          />
          <Text className="text-sm text-slate-400 dark:text-slate-500 mt-2">
            {t("no_bills_due")}
          </Text>
        </View>
      ) : (
        <>
          {/* Featured + Side layout */}
          <View className="flex-row gap-3">
            {/* Featured Card */}
            {featuredPayment && (
              <FeaturedPaymentCard
                payment={featuredPayment}
                onPayNow={() => handlePayNow(featuredPayment)}
              />
            )}

            {/* Side Mini Items */}
            {sidePayments.length > 0 && (
              <View className="flex-1 gap-2 justify-center">
                {sidePayments.map((payment) => (
                  <MiniPaymentItem key={payment.id} payment={payment} />
                ))}
              </View>
            )}
          </View>

          {/* Total Due — uses filtered total */}
          <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <Text className="stat-label">{t("total_due")}</Text>
            <Text className="text-base font-bold text-nileGreen-500">
              {formatCurrency({
                amount: totalDueFiltered,
                currency: preferredCurrency,
              })}
            </Text>
          </View>
        </>
      )}

      {/* Pay Now Modal */}
      <PayNowModal
        payment={selectedPayment}
        visible={modalVisible}
        onClose={handleModalClose}
        onSuccess={handleSuccess}
      />
    </View>
  );
}

export const UpcomingPayments = React.memo(UpcomingPaymentsComponent);
