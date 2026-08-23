/**
 * Recurring Payments Dashboard
 * Displays recurring payments with status filtering, sorting, and due groups.
 */

import {
  HeroSummary,
  NextPaymentInsight,
  PaymentRow,
  RecurringPaymentsSkeleton,
  SortControl,
  SortPaymentsModal,
  StatusTabs,
} from "@/components/recurring-payments/RecurringPaymentsDashboard";
import { PayNowModal } from "@/components/dashboard/upcoming-payments";
import { EmptyStateCard } from "@/components/ui/EmptyStateCard";
import { PageHeader } from "@/components/navigation/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { palette } from "@/constants/colors";
import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";
import { useMarketRates } from "@/hooks/useMarketRates";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { useRecurringPayments } from "@/hooks/useRecurringPayments";
import {
  groupPaymentsByDueDate,
  sortPayments,
  type PaymentSection,
  type SortOption,
} from "@/services/recurring-payments-dashboard-read-model";
import { Ionicons } from "@expo/vector-icons";
import type {
  CurrencyType,
  RecurringPayment,
  RecurringStatus,
} from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SectionList, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function RecurringPaymentsScreen(): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const { t: tCommon } = useTranslation("common");
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [selectedSort, setSelectedSort] = useState<SortOption>("next_due");
  const [isSortModalVisible, setIsSortModalVisible] = useState(false);
  const [payNowPayment, setPayNowPayment] =
    useState<RecurringPayment | null>(null);
  const {
    allPayments = [],
    filteredPayments,
    counts,
    next7DaysTotal,
    totalDueThisMonth,
    isLoading,
    statusFilter,
    setStatusFilter,
  } = useRecurringPayments();
  const { preferredCurrency } = usePreferredCurrency();
  const { latestRates } = useMarketRates();

  const sortOptions = useMemo(
    () => (latestRates ? { preferredCurrency, latestRates } : {}),
    [latestRates, preferredCurrency]
  );

  const sortedPayments = useMemo(
    () => sortPayments(filteredPayments, selectedSort, sortOptions),
    [filteredPayments, selectedSort, sortOptions]
  );

  const paymentSections = useMemo((): PaymentSection[] => {
    if (selectedSort === "next_due") {
      return groupPaymentsByDueDate(sortedPayments);
    }

    return [{ key: "sorted-payments", title: "", data: sortedPayments }];
  }, [selectedSort, sortedPayments]);

  const billPayments = useMemo(
    () => allPayments.filter((payment) => payment.isExpense),
    [allPayments]
  );

  const nextPayment = useMemo(
    () =>
      sortPayments(
        billPayments.filter(
          (payment) => payment.isActive && !payment.isOverdue
        ),
        "next_due"
      )[0] ?? null,
    [billPayments]
  );

  const overdueCount = useMemo(
    () =>
      billPayments.filter((payment) => payment.isActive && payment.isOverdue)
        .length,
    [billPayments]
  );

  const statusLabelMap = useMemo<Record<RecurringStatus, string>>(
    () => ({
      ACTIVE: t("status_active"),
      PAUSED: t("status_paused"),
      COMPLETED: t("status_completed"),
    }),
    [t]
  );

  const handlePaymentPress = useCallback((payment: RecurringPayment): void => {
    router.push(`/edit-recurring-payment?id=${payment.id}`);
  }, []);

  const handleCreatePress = useCallback((): void => {
    router.push("/create-recurring-payment");
  }, []);

  const handlePayNow = useCallback((payment: RecurringPayment): void => {
    setPayNowPayment(payment);
  }, []);

  const handlePayNowClose = useCallback((): void => {
    setPayNowPayment(null);
  }, []);

  const handlePaymentSuccess = useCallback(
    (
      amount: number,
      paymentName: string,
      paymentCurrency: CurrencyType
    ): void => {
      showToast({
        type: "success",
        title: tCommon("payment_recorded"),
        message: `${paymentName} - ${formatCurrency({
          amount,
          currency: paymentCurrency,
        })}`,
      });
    },
    [showToast, tCommon]
  );

  const handleSortSelect = useCallback((sort: SortOption): void => {
    setSelectedSort(sort);
    setIsSortModalVisible(false);
  }, []);

  const renderPaymentItem = useCallback(
    ({ item }: { readonly item: RecurringPayment }) => (
      <PaymentRow
        payment={item}
        onPress={() => handlePaymentPress(item)}
        onPayNow={() => handlePayNow(item)}
      />
    ),
    [handlePayNow, handlePaymentPress]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { readonly section: PaymentSection }) =>
      section.title ? (
        <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-4 mb-2">
          {section.title}
        </Text>
      ) : null,
    []
  );

  return (
    <View
      testID="recurring-payments-screen"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <PageHeader
        title={t("my_bills")}
        centerTitle={true}
        showBackButton={true}
        showDrawer={false}
      />

      <View className="flex-1 px-5 pt-4">
        <HeroSummary
          next7Days={next7DaysTotal}
          overdueCount={overdueCount}
          thisMonth={totalDueThisMonth}
          currencyCode={preferredCurrency}
        />

        <NextPaymentInsight
          payment={nextPayment}
          onPress={handlePaymentPress}
        />

        <StatusTabs
          activeTab={statusFilter}
          onTabChange={setStatusFilter}
          counts={counts}
        />

        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-lg font-bold text-text-primary dark:text-text-primary-dark">
            {t("upcoming")}
          </Text>
          <SortControl
            selectedSort={selectedSort}
            onPress={() => setIsSortModalVisible(true)}
          />
        </View>

        {isLoading ? (
          <RecurringPaymentsSkeleton />
        ) : filteredPayments.length === 0 ? (
          <EmptyStateCard
            onPress={handleCreatePress}
            icon="receipt-outline"
            title={t("no_status_payments", {
              status: statusLabelMap[statusFilter],
            })}
            description={t("tap_to_add_recurring")}
            height={120}
          />
        ) : (
          <SectionList
            sections={paymentSections}
            keyExtractor={keyExtractor}
            renderItem={renderPaymentItem}
            renderSectionHeader={renderSectionHeader}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}
            stickySectionHeadersEnabled={false}
            {...ANDROID_SAFE_LIST_PROPS}
          />
        )}

        <TouchableOpacity
          testID="recurring-payments-add-button"
          onPress={handleCreatePress}
          className="absolute end-5 w-14 h-14 rounded-full items-center justify-center"
          // eslint-disable-next-line react-native/no-inline-styles
          style={{
            bottom: insets.bottom + 20,
            backgroundColor: palette.nileGreen[500],
            shadowColor: palette.slate[900],
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 5,
          }}
        >
          <Ionicons name="add" size={28} color={palette.slate[25]} />
        </TouchableOpacity>
      </View>

      <SortPaymentsModal
        visible={isSortModalVisible}
        selectedSort={selectedSort}
        onSelect={handleSortSelect}
        onClose={() => setIsSortModalVisible(false)}
      />
      <PayNowModal
        payment={payNowPayment}
        visible={payNowPayment !== null}
        onClose={handlePayNowClose}
        onSuccess={handlePaymentSuccess}
      />
    </View>
  );
}

function keyExtractor(item: RecurringPayment): string {
  return item.id;
}
