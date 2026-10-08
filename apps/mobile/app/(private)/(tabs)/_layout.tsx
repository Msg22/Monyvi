import { QuickActionFab } from "@/components/fab";
import { PayNowModal } from "@/components/dashboard/upcoming-payments";
import { CustomBottomTabBar } from "@/components/tab-bar/CustomBottomTabBar";
import { useToast } from "@/components/ui/Toast";
import { darkTheme, lightTheme } from "@/constants/colors";
import {
  MicButtonRefProvider,
  useMicButtonRef,
} from "@/context/MicButtonRefContext";
import { MicTooltipProvider } from "@/context/MicTooltipContext";
import {
  PayNowOverlayProvider,
  usePayNowOverlay,
} from "@/context/PayNowOverlayContext";
import { useTheme } from "@/context/ThemeContext";
import { formatLocalizedMoneyAmount } from "@/utils/localized-money-display";
import type { CurrencyType } from "@monyvi/db";
import { Tabs, useRouter } from "expo-router";
import React, { useCallback } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

const PAYMENT_TOAST_DURATION_MS = 3500;

export default function TabLayout(): React.ReactElement {
  return (
    <MicButtonRefProvider>
      <MicTooltipProvider>
        <PayNowOverlayProvider>
          <TabLayoutInner />
        </PayNowOverlayProvider>
      </MicTooltipProvider>
    </MicButtonRefProvider>
  );
}

function TabLayoutInner(): React.ReactElement {
  const { isDark } = useTheme();
  const { t: tCommon } = useTranslation("common");
  const router = useRouter();
  const micButtonRef = useMicButtonRef();
  const { selectedPayment, isPayNowVisible, closePayNow } = usePayNowOverlay();
  const { showToast } = useToast();

  const handlePaymentSuccess = useCallback(
    (
      amount: number,
      paymentName: string,
      paymentCurrency: CurrencyType
    ): void => {
      showToast({
        type: "success",
        title: tCommon("payment_recorded"),
        message: `${paymentName} - ${formatLocalizedMoneyAmount({
          amount,
          currency: paymentCurrency,
        })}`,
        duration: PAYMENT_TOAST_DURATION_MS,
      });
    },
    [showToast, tCommon]
  );

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <View
        className="flex-1"
        accessibilityElementsHidden={isPayNowVisible}
        importantForAccessibility={
          isPayNowVisible ? "no-hide-descendants" : "auto"
        }
      >
        <Tabs
          tabBar={(props) => (
            <CustomBottomTabBar
              {...props}
              micButtonRef={micButtonRef ?? undefined}
              onMicPress={() => {
                router.push({
                  pathname: "/add-transaction",
                  params: {
                    mode: "voice",
                    originTabIndex: String(props.state?.index ?? 0),
                  },
                });
              }}
            />
          )}
          screenOptions={{
            headerShown: false,
            sceneStyle: {
              backgroundColor: isDark
                ? darkTheme.background
                : lightTheme.background,
            },
          }}
        >
          <Tabs.Screen name="index" options={{ title: tCommon("home") }} />
          <Tabs.Screen
            name="accounts"
            options={{ title: tCommon("accounts") }}
          />
          <Tabs.Screen
            name="transactions"
            options={{ title: tCommon("transactions") }}
          />
          <Tabs.Screen name="metals" options={{ title: tCommon("metals") }} />
        </Tabs>

        <QuickActionFab />
      </View>

      <PayNowModal
        payment={selectedPayment}
        visible={isPayNowVisible}
        onClose={closePayNow}
        onSuccess={handlePaymentSuccess}
      />
    </View>
  );
}
