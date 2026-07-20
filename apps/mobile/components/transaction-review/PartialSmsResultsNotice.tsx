import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { palette } from "@/constants/colors";
import type { SmsAiAvailability } from "@/services/ai-sms-parser-service";
import type { SmsScanSafeguardSummary } from "@/services/sms-parser-orchestrator";

interface PartialSmsResultsNoticeProps {
  readonly safeguardSummary: SmsScanSafeguardSummary;
  readonly retryableCount: number;
  readonly canRetry: boolean;
  readonly isRetrying: boolean;
  readonly hasRetryError: boolean;
  readonly onRetry: () => void;
}

function formatAvailability(
  availability: SmsAiAvailability | undefined,
  language: string | undefined
): string | null {
  if (!availability?.availableAt) return null;
  const availableAt = new Date(availability.availableAt);
  if (Number.isNaN(availableAt.getTime())) return null;

  const locale = language?.startsWith("ar") ? "ar-EG" : "en-EG";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(availableAt);
}

export function PartialSmsResultsNotice({
  safeguardSummary,
  retryableCount,
  canRetry,
  isRetrying,
  hasRetryError,
  onRetry,
}: PartialSmsResultsNoticeProps): React.JSX.Element | null {
  const { t, i18n } = useTranslation("transactions");
  const unresolvedCount =
    safeguardSummary.deferredAiCount +
    safeguardSummary.oversizedCount +
    safeguardSummary.unresolvedCount;
  if (unresolvedCount === 0) return null;

  const availability = formatAvailability(
    safeguardSummary.availability,
    i18n?.language
  );
  const hasCapacityLimitedResults =
    safeguardSummary.deferredAiCount > 0 || safeguardSummary.oversizedCount > 0;
  const messageKey =
    hasRetryError && canRetry && !hasCapacityLimitedResults
      ? "partial_sms_retry_error"
      : availability
        ? "partial_sms_try_later_at"
        : safeguardSummary.oversizedCount > 0 &&
            safeguardSummary.deferredAiCount === 0 &&
            safeguardSummary.unresolvedCount === 0
          ? "partial_sms_oversized"
          : hasCapacityLimitedResults || !canRetry
            ? "partial_sms_try_later"
            : "partial_sms_description";

  return (
    <View
      testID="partial-sms-results-notice"
      accessibilityRole="alert"
      className="mt-3 flex-row items-center rounded-lg border border-gold-600/50 bg-gold-50 px-3 py-3 dark:bg-gold-800/20"
    >
      <Ionicons name="warning-outline" size={24} color={palette.gold[600]} />
      <View className="ms-3 min-w-0 flex-1">
        <Text className="text-sm font-semibold text-slate-900 dark:text-slate-25">
          {t("partial_sms_title", { count: unresolvedCount })}
        </Text>
        <Text className="mt-0.5 text-xs text-text-secondary dark:text-text-secondary-dark">
          {t(messageKey, availability ? { availability } : undefined)}
        </Text>
      </View>
      {canRetry && (
        <>
          <View className="mx-3 h-10 w-px bg-gold-600/50" />
          <TouchableOpacity
            testID="partial-sms-retry"
            accessibilityRole="button"
            accessibilityState={{ disabled: isRetrying, busy: isRetrying }}
            disabled={isRetrying}
            activeOpacity={0.7}
            onPress={onRetry}
            className="h-10 flex-row items-center justify-center"
          >
            <Ionicons name="sync" size={20} color={palette.nileGreen[600]} />
            <Text className="ms-1.5 text-sm font-semibold text-nileGreen-700 dark:text-nileGreen-400">
              {isRetrying
                ? t("partial_sms_retrying")
                : t("partial_sms_retry", { count: retryableCount })}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
