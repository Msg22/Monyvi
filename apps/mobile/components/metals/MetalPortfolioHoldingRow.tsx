import { Skeleton } from "@/components/ui/Skeleton";
import { palette } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import type { CurrencyType } from "@monyvi/db";
import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import type { MetalPortfolioHoldingInput } from "@/services/metal-portfolio-read-model-service";
import {
  formatCodeAmount,
  formatPurchaseDetail,
  getForwardChevronName,
  getMetalHoldingPresentation,
  getPerformanceTextClass,
  parseOptionalNumber,
  resolveLocale,
} from "./portfolio-presentation";

export interface MetalHoldingRowProps {
  readonly currency: CurrencyType;
  readonly holding: MetalPortfolioHoldingInput;
  readonly isRateCurrencyReady: boolean;
  readonly onPress: () => void;
}

export function HoldingSeparator(): React.JSX.Element {
  return <View testID="metal-portfolio-holding-separator" className="h-3" />;
}

export function MetalHoldingRow({
  currency,
  holding,
  isRateCurrencyReady,
  onPress,
}: MetalHoldingRowProps): React.JSX.Element {
  const { t, i18n } = useTranslation("metals");
  const locale = resolveLocale(i18n?.resolvedLanguage);
  const presentation = getMetalHoldingPresentation(holding);
  const metal = t(presentation.metalKey);
  const form = t(presentation.formKey);
  const purityLabel =
    presentation.purityLabelKey === null
      ? null
      : t(presentation.purityLabelKey);
  const metadata = [metal, purityLabel, form]
    .filter((value): value is string => value !== null)
    .join(" · ");
  const purchaseDetail = formatPurchaseDetail(holding, locale, t);
  const performanceValue = parseOptionalNumber(
    holding.currentPerformanceDecimal
  );
  const currentValueLabel = formatCodeAmount(
    holding.currentValueDecimal,
    currency,
    locale
  );
  const performanceLabel =
    holding.currentPerformanceDecimal === null
      ? holding.currentValueDecimal === null
        ? t("portfolio.current_value_unavailable", {
            reason: t("rate.missing"),
          })
        : t(
            holding.performanceUnavailableReason === "rate_reference"
              ? "portfolio.performance_unavailable_rate_reference"
              : "portfolio.performance_unavailable"
          )
      : `${formatCodeAmount(
          holding.currentPerformanceDecimal,
          currency,
          locale,
          true
        )} ${t("portfolio.since_purchase_label")}`;
  const holdingAccessibilityLabel = [
    holding.name,
    metadata,
    t("status.active"),
    purchaseDetail,
    isRateCurrencyReady ? currentValueLabel : null,
    isRateCurrencyReady ? performanceLabel : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(". ");

  return (
    <Pressable
      accessible
      accessibilityLabel={holdingAccessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      testID={`metal-portfolio-holding-${holding.id}`}
      className="flex-row items-start gap-2 rounded-2xl border border-slate-200 bg-surface px-3 py-3.5 dark:border-slate-800 dark:bg-slate-900"
    >
      <HoldingImage form={form} metal={metal} presentation={presentation} />
      <View className="min-w-0 flex-1">
        <Text
          testID={`metal-portfolio-holding-name-${holding.id}`}
          numberOfLines={2}
          className="text-base font-medium leading-5 text-text-primary dark:text-text-primary-dark"
        >
          {holding.name}
        </Text>
        <View className="mt-1 flex-row flex-wrap items-center">
          <Text
            numberOfLines={2}
            className="text-xs text-text-secondary dark:text-text-secondary-dark"
          >
            {metadata}
            {metadata.length > 0 ? " · " : ""}
          </Text>
          <Text className="text-xs text-nileGreen-700 dark:text-nileGreen-400">
            {t("status.active")}
          </Text>
        </View>
        {purchaseDetail === null ? null : (
          <Text
            numberOfLines={2}
            className="mt-1 text-xs text-text-secondary dark:text-text-secondary-dark"
          >
            {purchaseDetail}
          </Text>
        )}
      </View>
      {isRateCurrencyReady ? (
        <View
          testID={`metal-portfolio-holding-value-${holding.id}`}
          className="w-[104px] shrink-0 items-end self-center"
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            className="text-sm font-semibold text-text-primary dark:text-text-primary-dark"
          >
            {currentValueLabel}
          </Text>
          {holding.currentPerformanceDecimal === null ? (
            <Text
              numberOfLines={2}
              className="mt-1 text-right text-[11px] text-text-secondary dark:text-text-secondary-dark"
            >
              {holding.currentValueDecimal === null
                ? t("portfolio.value_unavailable_short")
                : t(
                    holding.performanceUnavailableReason === "rate_reference"
                      ? "portfolio.performance_unavailable_rate_reference"
                      : "portfolio.performance_unavailable"
                  )}
            </Text>
          ) : (
            <>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                className={`mt-2 text-xs font-medium ${getPerformanceTextClass(
                  performanceValue
                )}`}
              >
                {formatCodeAmount(
                  holding.currentPerformanceDecimal,
                  currency,
                  locale,
                  true
                )}
              </Text>
              <Text className="mt-1 text-[11px] text-text-secondary dark:text-text-secondary-dark">
                {t("portfolio.since_purchase_label")}
              </Text>
            </>
          )}
        </View>
      ) : (
        <View
          testID={`metal-portfolio-holding-value-pending-${holding.id}`}
          className="w-[104px] shrink-0 items-end gap-2 self-center"
        >
          <Skeleton width="100%" height={18} borderRadius={8} />
          <Skeleton width="70%" height={14} borderRadius={7} />
        </View>
      )}
      <View className="shrink-0 self-center">
        <Ionicons
          name={getForwardChevronName()}
          size={20}
          color={palette.slate[500]}
        />
      </View>
    </Pressable>
  );
}

function HoldingImage({
  form,
  metal,
  presentation,
}: {
  readonly form: string;
  readonly metal: string;
  readonly presentation: ReturnType<typeof getMetalHoldingPresentation>;
}): React.JSX.Element {
  const { t } = useTranslation("metals");
  if (presentation.render.kind === "object") {
    return (
      <Image
        accessible
        accessibilityLabel={t(presentation.render.accessibilityLabelKey, {
          metal,
          form,
        })}
        source={presentation.render.source}
        resizeMode="contain"
        className="h-16 w-16"
      />
    );
  }
  return (
    <View
      accessible
      accessibilityLabel={t(presentation.render.accessibilityLabelKey)}
      className="h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800"
    >
      <Text className="text-xs font-semibold text-text-secondary dark:text-text-secondary-dark">
        {metal}
      </Text>
    </View>
  );
}
