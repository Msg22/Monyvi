/** Development-only device fixture for authenticated startup manual QA. */

import { removeLocalMarketRatesForQa } from "@/services/dev/startup-qa-fixtures";
import { logger } from "@/utils/logger";
import React, { useCallback, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type FixtureStatus = "idle" | "running" | "success" | "failed";

export default function StartupQaScreen(): React.ReactNode {
  const [status, setStatus] = useState<FixtureStatus>("idle");
  const [removedCount, setRemovedCount] = useState(0);

  const handleRemoveLocalRates = useCallback((): void => {
    if (status === "running") return;

    setStatus("running");
    removeLocalMarketRatesForQa()
      .then((count) => {
        setRemovedCount(count);
        setStatus("success");
      })
      .catch((error: unknown) => {
        logger.error("startupQa.removeLocalMarketRates.failed", error);
        setStatus("failed");
      });
  }, [status]);

  if (!__DEV__) return null;

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
      <View className="flex-1 px-5 py-8">
        <Text className="text-2xl font-bold text-text-primary dark:text-text-primary-dark">
          {DEV_COPY.title}
        </Text>
        <Text className="mt-3 text-base leading-6 text-text-secondary dark:text-text-secondary-dark">
          {DEV_COPY.instructions}
        </Text>
        <Text className="mt-3 text-sm leading-5 text-text-muted dark:text-text-muted-dark">
          {DEV_COPY.scope}
        </Text>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={DEV_COPY.removeAction}
          disabled={status === "running"}
          onPress={handleRemoveLocalRates}
          className="mt-8 h-12 items-center justify-center rounded-xl bg-red-600"
        >
          <Text className="text-base font-semibold text-white">
            {status === "running"
              ? DEV_COPY.removingAction
              : DEV_COPY.removeAction}
          </Text>
        </TouchableOpacity>

        {status === "success" ? (
          <Text className="mt-5 text-sm text-nileGreen-600 dark:text-nileGreen-400">
            {DEV_COPY.removedSuccess(removedCount)}
          </Text>
        ) : null}

        {status === "failed" ? (
          <Text className="mt-5 text-sm text-red-600 dark:text-red-400">
            {DEV_COPY.failed}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const DEV_COPY = {
  title: "Startup QA fixtures",
  instructions:
    "Turn off Wi-Fi and mobile data before removing rates. Then force-stop and reopen Monyvi.",
  scope:
    "This removes only cached market-rate rows from this device. Your profile and other financial data stay intact.",
  removeAction: "Remove local market rates",
  removingAction: "Removing…",
  removedSuccess: (count: number): string =>
    `Removed ${count} local market-rate rows. Your profile was preserved.`,
  failed: "Could not remove local market rates. Check Metro logs.",
} as const;
