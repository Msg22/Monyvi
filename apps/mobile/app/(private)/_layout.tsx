import { AppReadyGate } from "@/components/AppReadyGate";
import { CategoriesProvider } from "@/context/CategoriesContext";
import { FirstRunTooltipProvider } from "@/context/FirstRunTooltipContext";
import { SmsScanProvider } from "@/context/SmsScanContext";
import { useAuth } from "@/context/AuthContext";
import { DatabaseProvider } from "@/providers/DatabaseProvider";
import { MarketRatesRealtimeProvider } from "@/providers/MarketRatesRealtimeProvider";
import { PrivateDataBoundary } from "@/providers/PrivateDataBoundary";
import { QueryProvider } from "@/providers/QueryProvider";
import { SyncProvider } from "@/providers/SyncProvider";
import { router, Stack, useRootNavigationState } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

interface RootNavigationState {
  readonly key?: string;
}

export default function PrivateLayout(): React.ReactNode {
  const { isAuthenticated, isLoading } = useAuth();
  const rootNavigationState = useRootNavigationState() as
    | RootNavigationState
    | undefined;
  const { t: tCommon } = useTranslation("common");
  const { t: tTransactions } = useTranslation("transactions");
  const isNavigationReady = Boolean(rootNavigationState?.key);

  useEffect(() => {
    if (isLoading || isAuthenticated || !isNavigationReady) {
      return;
    }

    router.replace("/auth");
  }, [isAuthenticated, isLoading, isNavigationReady]);

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <QueryProvider>
      <DatabaseProvider>
        <PrivateDataBoundary>
          <SyncProvider>
            <MarketRatesRealtimeProvider>
              <CategoriesProvider>
                <SmsScanProvider>
                  <FirstRunTooltipProvider>
                    <Stack
                      screenOptions={{
                        headerShown: false,
                      }}
                    >
                      <Stack.Screen name="startup" />
                      <Stack.Screen name="onboarding" />
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen
                        name="add-account"
                        options={{
                          presentation: "modal",
                        }}
                      />
                      <Stack.Screen name="voice-review" />
                      <Stack.Screen
                        name="add-transaction"
                        options={{
                          title: tTransactions("add_transaction"),
                        }}
                      />
                      <Stack.Screen name="edit-account" />
                      <Stack.Screen
                        name="edit-transaction"
                        options={{
                          title: tTransactions("edit_transaction"),
                        }}
                      />
                      <Stack.Screen name="edit-transfer" />
                      <Stack.Screen
                        name="settings"
                        options={{
                          title: tCommon("settings"),
                        }}
                      />
                      <Stack.Screen name="ai-privacy-details" />
                      <Stack.Screen
                        name="recurring-payments"
                        options={{
                          headerShown: false,
                        }}
                      />
                      <Stack.Screen
                        name="create-recurring-payment"
                        options={{
                          presentation: "modal",
                        }}
                      />
                      <Stack.Screen name="create-budget" />
                      <Stack.Screen name="budget-detail" />
                      <Stack.Screen name="budgets" />
                      <Stack.Screen name="charts" />
                      <Stack.Screen name="live-rates" />
                      <Stack.Screen name="sms-scan" />
                      <Stack.Screen name="sms-review" />
                      <Stack.Screen name="sms-simulator" />
                    </Stack>
                    <AppReadyGate />
                  </FirstRunTooltipProvider>
                </SmsScanProvider>
              </CategoriesProvider>
            </MarketRatesRealtimeProvider>
          </SyncProvider>
        </PrivateDataBoundary>
      </DatabaseProvider>
    </QueryProvider>
  );
}
