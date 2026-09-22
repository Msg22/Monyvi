import React from "react";
import { Pressable, Text, View } from "react-native";

interface MoneySummaryErrorStateProps {
  readonly message: string;
  readonly onRetry: () => void;
  readonly retryLabel: string;
  readonly testID: string;
}

export function MoneySummaryErrorState({
  message,
  onRetry,
  retryLabel,
  testID,
}: MoneySummaryErrorStateProps): React.JSX.Element {
  return (
    <View
      accessibilityLiveRegion="polite"
      testID={testID}
      className="my-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30"
    >
      <Text className="text-sm text-red-700 dark:text-red-400">{message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={retryLabel}
        onPress={onRetry}
        className="mt-2 min-h-11 justify-center"
      >
        <Text className="text-base font-semibold text-nileGreen-700 dark:text-nileGreen-400">
          {retryLabel}
        </Text>
      </Pressable>
    </View>
  );
}
