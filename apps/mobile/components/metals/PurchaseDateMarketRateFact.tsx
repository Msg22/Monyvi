import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { useTranslation } from "react-i18next";
import { isSupportedMetalsIsoCurrencyCode } from "@monyvi/logic";

import { resolveCurrencyDisplayDecimalPlaces } from "@/components/metals/portfolio-presentation";
import { palette } from "@/constants/colors";
import { shouldUseCompactLayout } from "@/constants/ui";
import { useTheme } from "@/context/ThemeContext";
import type { MetalDetailReadModel } from "@/services/metal-detail-read-model-service";
import { formatLocalizedMoneyAmount } from "@/utils/localized-money-display";

export interface PurchaseDateMarketRateFactProps {
  readonly isOffline?: boolean;
  readonly locale: string;
  readonly model: MetalDetailReadModel;
  readonly onRetryHistoricalReference?: () => void;
}

export function PurchaseDateMarketRateFact({
  isOffline,
  locale,
  model,
  onRetryHistoricalReference,
}: PurchaseDateMarketRateFactProps): React.JSX.Element | null {
  const { t } = useTranslation(["metals", "common"]);
  const { isDark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const reference = model.purchaseDateMarketReference ?? null;
  if (reference === null) return null;

  const isFailed = reference.status === "fetch_failed";
  const hasInteractiveRetry =
    isFailed && !isOffline && typeof onRetryHistoricalReference === "function";
  const value =
    reference.status === "available"
      ? `${displayAmount(
          reference.selectedPurityPerGramDecimal,
          reference.purchaseCurrency,
          locale
        )} ${t("portfolio.per_gram")}`
      : t("detail.value_unavailable");
  const label = t("detail.market_rate_on_purchase_date");
  const retryLabel = t("retry", { ns: "common" });
  const iconColor = isDark ? palette.slate[300] : palette.slate[500];
  const isCompact = shouldUseCompactLayout(width, fontScale);

  return (
    <View
      testID="metal-holding-purchase-date-market-rate"
      accessible={!hasInteractiveRetry}
      accessibilityLabel={
        hasInteractiveRetry
          ? undefined
          : t("detail.fact_accessibility", { label, value })
      }
      className={`mt-2 gap-2 border-t border-slate-200 pt-2 dark:border-slate-800 ${
        isCompact ? "flex-col items-start" : "flex-row items-center"
      }`}
    >
      <Ionicons
        accessibilityElementsHidden
        importantForAccessibility="no"
        name="pricetag-outline"
        size={18}
        color={iconColor}
      />
      <Text className="min-w-0 flex-1 text-sm text-text-secondary dark:text-text-secondary-dark">
        {label}
      </Text>
      <View className="flex-row items-center gap-2">
        <Text
          className="text-sm font-medium text-text-primary dark:text-text-primary-dark"
          style={{
            writingDirection: locale.toLowerCase().startsWith("ar")
              ? "rtl"
              : "ltr",
          }}
        >
          {value}
        </Text>
        {hasInteractiveRetry ? (
          <Pressable
            testID="metal-holding-purchase-date-market-rate-retry"
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${retryLabel}`}
            onPress={onRetryHistoricalReference}
            hitSlop={8}
            className="rounded px-1.5 py-0.5"
          >
            <Text className="text-sm font-medium text-nileGreen-600 dark:text-nileGreen-400">
              {retryLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function displayAmount(
  value: string,
  currency: string,
  locale: string
): string {
  if (!isSupportedMetalsIsoCurrencyCode(currency)) return "—";
  try {
    const decimalPlaces = resolveCurrencyDisplayDecimalPlaces(currency);
    return formatLocalizedMoneyAmount({
      amount: value,
      currency,
      language: locale.toLowerCase().startsWith("ar") ? "ar" : "en",
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
      englishPresentation: "code-prefix",
    });
  } catch {
    return "—";
  }
}
