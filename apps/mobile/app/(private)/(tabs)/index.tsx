import { CurrencyPicker } from "@/components/currency/CurrencyPicker";
import { AccountsSection } from "@/components/dashboard/AccountsSection";
import { CashAccountTooltip } from "@/components/dashboard/CashAccountTooltip";
import { MicButtonTooltip } from "@/components/dashboard/MicButtonTooltip";
import { LiveRates } from "@/components/dashboard/LiveRates";
import { OnboardingGuideCard } from "@/components/dashboard/OnboardingGuideCard";
import { DashboardSkeleton } from "@/components/dashboard/skeletons/DashboardSkeleton";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { ThisMonth } from "@/components/dashboard/ThisMonth";
import { TopNav } from "@/components/dashboard/TopNav";
import { TotalNetWorthCard } from "@/components/dashboard/TotalNetWorthCard";
import { UpcomingPayments } from "@/components/dashboard/UpcomingPayments";
import { AppDrawer } from "@/components/navigation/AppDrawer";
import { SmsPermissionPrompt } from "@/components/sms-sync/SmsPermissionPrompt";
import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary";
import { StarryBackground } from "@/components/ui/StarryBackground";
import { useToast } from "@/components/ui/Toast";
import { palette } from "@/constants/colors";
import { usePayNowOverlay } from "@/context/PayNowOverlayContext";
import type { InstitutionLogo } from "@/constants/egyptian-institution-assets";
import { TAB_BAR_HEIGHT } from "@/constants/ui";

import { useAccounts } from "@/hooks/useAccounts";
import { useMarketRates } from "@/hooks/useMarketRates";
import { useMonthlyPercentageChange, useNetWorth } from "@/hooks/useNetWorth";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { useProfile } from "@/hooks/useProfile";
import { useSmsPermission } from "@/hooks/useSmsPermission";
import { useSmsSync } from "@/hooks/useSmsSync";
import { useRecentTransactions } from "@/hooks/useTransactions";
import { useDatabaseReady } from "@/providers/DatabaseProvider";
import { useSync } from "@/providers/SyncProvider";
import { resolveAccountInstitutionPresentation } from "@/utils/account-institution-presentation";
import { logger } from "@/utils/logger";
import type { CurrencyType } from "@monyvi/db";
import { CURRENCY_INFO_MAP } from "@monyvi/logic";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

// Static style objects — extracted to module scope to keep referential
// stability across re-renders and avoid recreating them on every render.
const SCROLL_CONTENT_STYLE = {
  paddingBottom: TAB_BAR_HEIGHT + 20,
} as const;

const REFRESH_TINT_COLOR = palette.nileGreen[500];
const REFRESH_COLORS: string[] = [REFRESH_TINT_COLOR];

/**
 * Returns a time-based greeting key for i18n.
 */
function getGreetingKey(): "good_morning" | "good_afternoon" | "good_evening" {
  const hours = new Date().getHours();
  if (hours < 12) return "good_morning";
  if (hours < 18) return "good_afternoon";
  return "good_evening";
}

/**
 * Renders the main dashboard screen including total net worth, live market rates, accounts,
 * recent transactions, upcoming payments, and UI for selecting the preferred currency.
 * Supports pull-to-refresh to trigger a Supabase sync.
 */
export default function DashboardScreen(): React.JSX.Element {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCurrencyPickerOpen, setIsCurrencyPickerOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const cashAccountRef = useRef<View>(null);
  // Forwarded to CashAccountTooltip so it can scroll the cash-account
  // card into view before showing — otherwise on first-run the user is
  // at scroll-top and the cash card sits below the fold, which makes
  // the AnchoredTooltip arrow land off-screen (user-reported 2026-04-26).
  const scrollViewRef = useRef<ScrollView>(null);
  const isDbReady = useDatabaseReady();
  const { t } = useTranslation("common");
  const { profile } = useProfile();
  const { sync } = useSync();
  const { accounts, isLoading: accountsLoading } = useAccounts();
  const {
    latestRates,
    previousDayRate,
    isLoading: ratesLoading,
    lastUpdated,
    isStale,
  } = useMarketRates();
  const { transactions, isLoading: transactionsLoading } =
    useRecentTransactions(3);

  const {
    totalNetWorth,
    totalNetWorthUsd,
    isLoading: netWorthLoading,
  } = useNetWorth();
  const { monthlyPercentageChange } = useMonthlyPercentageChange();
  const {
    preferredCurrency,
    setPreferredCurrency,
    isLoading: isCurrencyLoading,
  } = usePreferredCurrency();

  const currencyInfo = CURRENCY_INFO_MAP[preferredCurrency];

  // SMS sync prompt
  const router = useRouter();
  const { shouldShowPrompt, dismissPrompt } = useSmsSync();
  const { requestPermission } = useSmsPermission();
  const { openPayNow } = usePayNowOverlay();

  // Greeting row — use first name for a personal touch, fallback to display name
  const greetingName = profile?.firstName || profile?.displayName || "";
  const greetingText = t(getGreetingKey());

  const handleMenuPress = useCallback(() => setIsDrawerOpen(true), []);
  const handleCurrencyChipPress = useCallback(() => {
    if (!isCurrencyLoading) setIsCurrencyPickerOpen(true);
  }, [isCurrencyLoading]);
  const handleDrawerClose = useCallback(() => setIsDrawerOpen(false), []);
  const handleCurrencyPickerClose = useCallback(
    () => setIsCurrencyPickerOpen(false),
    []
  );

  const handleSmsPermissionGranted = useCallback(() => {
    dismissPrompt().catch((error: unknown) => {
      logger.warn("dismissPrompt failed in handleSmsPermissionGranted", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    router.push("/sms-scan");
  }, [dismissPrompt, router]);

  const handleSmsDismiss = useCallback(() => {
    dismissPrompt().catch((error: unknown) => {
      logger.warn("dismissPrompt failed in handleSmsDismiss", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, [dismissPrompt]);

  const handleCurrencySelect = useCallback(
    (currency: CurrencyType) => {
      if (isCurrencyLoading) return;
      setPreferredCurrency(currency).catch((error: unknown) => {
        logger.error("Failed to set preferred currency", error, { currency });
      });
    },
    [setPreferredCurrency, isCurrencyLoading]
  );

  const { showToast } = useToast();

  const handleRefresh = useCallback(async (): Promise<void> => {
    setIsRefreshing(true);
    try {
      await sync();
    } catch (error: unknown) {
      logger.error("Pull-to-refresh sync failed", error);
      showToast({
        type: "error",
        title: t("error_generic"),
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [sync, showToast, t]);

  const institutionLogosByAccountId = useMemo(() => {
    const logos = new Map<string, InstitutionLogo | null>();
    for (const account of accounts) {
      const presentation = resolveAccountInstitutionPresentation(account);
      logos.set(account.id, presentation?.asset.logo ?? null);
    }
    return logos;
  }, [accounts]);

  // Overall loading state
  const isLoading = accountsLoading || ratesLoading || netWorthLoading;

  // Show the full dashboard skeleton while WatermelonDB is still initializing
  // so the user sees the real content layout immediately instead of a blank
  // spinner. Section-level hooks handle their own loading states once the DB
  // is ready.
  if (!isDbReady) {
    return (
      <StarryBackground>
        <DashboardSkeleton />
      </StarryBackground>
    );
  }

  return (
    <StarryBackground>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={SCROLL_CONTENT_STYLE}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void handleRefresh();
            }}
            tintColor={REFRESH_TINT_COLOR}
            colors={REFRESH_COLORS}
          />
        }
      >
        <View className="px-5 pt-[10px]">
          <TopNav
            onMenuPress={handleMenuPress}
            currencyCode={preferredCurrency}
            currencyFlag={currencyInfo?.flag}
            onCurrencyPress={handleCurrencyChipPress}
            isCurrencyLoading={isCurrencyLoading}
          />

          {/* Greeting Row — below TopNav, same horizontal padding */}
          <Text
            numberOfLines={1}
            className="text-base font-semibold mb-4 text-slate-800 dark:text-slate-25"
          >
            {greetingText}
            {greetingName ? `, ${greetingName}` : ""} 👋
          </Text>

          <SectionErrorBoundary name={t("section_onboarding_guide")}>
            <OnboardingGuideCard />
          </SectionErrorBoundary>
          <SectionErrorBoundary name={t("section_net_worth")}>
            <TotalNetWorthCard
              totalNetWorth={totalNetWorth}
              totalNetWorthUsd={totalNetWorthUsd}
              preferredCurrency={preferredCurrency}
              monthlyPercentageChange={monthlyPercentageChange}
              isLoading={isLoading}
            />
          </SectionErrorBoundary>
          <SectionErrorBoundary name={t("section_live_rates")}>
            <LiveRates
              latestRates={latestRates}
              previousDayRate={previousDayRate}
              isLoading={ratesLoading}
              lastUpdated={lastUpdated}
              isStale={isStale}
              preferredCurrency={preferredCurrency}
            />
          </SectionErrorBoundary>
          <SectionErrorBoundary name={t("section_accounts")}>
            <AccountsSection
              accounts={accounts}
              isLoading={accountsLoading}
              institutionLogosByAccountId={institutionLogosByAccountId}
              cashAccountRef={cashAccountRef}
            />
          </SectionErrorBoundary>
          <SectionErrorBoundary name={t("section_this_month")}>
            <ThisMonth />
          </SectionErrorBoundary>
          <SectionErrorBoundary name={t("section_upcoming_payments")}>
            <UpcomingPayments onPayNow={openPayNow} />
          </SectionErrorBoundary>
          <SectionErrorBoundary name={t("section_recent_transactions")}>
            <RecentTransactions
              transactions={transactions}
              isLoading={transactionsLoading}
            />
          </SectionErrorBoundary>
        </View>
      </ScrollView>
      <AppDrawer visible={isDrawerOpen} onClose={handleDrawerClose} />
      <CurrencyPicker
        visible={!isCurrencyLoading && isCurrencyPickerOpen}
        selectedCurrency={preferredCurrency}
        onSelect={handleCurrencySelect}
        onClose={handleCurrencyPickerClose}
      />
      <SmsPermissionPrompt
        visible={shouldShowPrompt}
        onPermissionGranted={handleSmsPermissionGranted}
        onDismiss={handleSmsDismiss}
        requestPermission={requestPermission}
      />
      <CashAccountTooltip
        anchorRef={cashAccountRef}
        isSmsPromptVisible={shouldShowPrompt}
        scrollViewRef={scrollViewRef}
      />
      {/* Mic-button first-run tooltip — rendered here (not inside the
          OnboardingGuideCard) so its full-screen overlay isn't clipped by
          the card's `overflow-hidden`. State + handlers come from
          `MicTooltipContext`. */}
      <MicButtonTooltip />
    </StarryBackground>
  );
}
