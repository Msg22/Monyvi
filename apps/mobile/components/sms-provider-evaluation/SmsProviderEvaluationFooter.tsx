import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { EdgeInsets } from "react-native-safe-area-context";

import type { SmsProviderEvaluationStatus } from "./SmsProviderEvaluationOverview";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function SmsProviderEvaluationFooter({
  status,
  isStartReady,
  insets,
  onStart,
  onCancel,
  t,
}: {
  readonly status: SmsProviderEvaluationStatus;
  readonly isStartReady: boolean;
  readonly insets: EdgeInsets;
  readonly onStart: () => void;
  readonly onCancel: () => void;
  readonly t: TranslateFn;
}): React.JSX.Element {
  const actionLabel =
    status === "running"
      ? t("sms_provider_evaluation.cancel_test")
      : status === "idle"
        ? t("sms_provider_evaluation.start_test")
        : t("sms_provider_evaluation.run_again");
  const disabled = status !== "running" && !isStartReady;
  return (
    <View
      className="absolute bottom-0 start-0 end-0 border-t border-slate-200 bg-slate-50 px-5 pt-3 dark:border-slate-700 dark:bg-slate-900"
      style={{ paddingBottom: 20 + insets.bottom }}
    >
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        disabled={disabled}
        onPress={status === "running" ? onCancel : onStart}
        className={
          status === "running"
            ? "min-h-[52px] items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800"
            : "min-h-[52px] items-center justify-center rounded-xl bg-nileGreen-600"
        }
        style={disabled ? { opacity: 0.5 } : undefined}
      >
        <Text
          className={
            status === "running"
              ? "text-base font-semibold text-slate-900 dark:text-slate-25"
              : "text-base font-semibold text-slate-25"
          }
        >
          {actionLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
