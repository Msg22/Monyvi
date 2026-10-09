import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import type { CurrencyType } from "@monyvi/db";

import { Skeleton } from "@/components/ui/Skeleton";
import { palette } from "@/constants/colors";
import type { MetalPortfolioHoldingInput } from "@/services/metal-portfolio-read-model-service";
import type { MetalRecentHistoryOutcome } from "@/services/metal-portfolio-history-outcome-service";

import {
  formatCodeAmount,
  formatShortDate,
  getForwardChevronName,
  getSoldResultLabelKey,
  resolveLocale,
} from "./portfolio-presentation";

export interface MetalPortfolioRecentHistoryProps {
  readonly currency: CurrencyType;
  readonly holdings: readonly MetalPortfolioHoldingInput[];
  readonly onHistoryPress: () => void;
  readonly onHoldingPress: (holdingId: string) => void;
  readonly realizedSaleReady: boolean;
}

export function MetalPortfolioRecentHistory({
  currency,
  holdings,
  onHistoryPress,
  onHoldingPress,
  realizedSaleReady,
}: MetalPortfolioRecentHistoryProps): React.JSX.Element {
  const { t, i18n } = useTranslation("metals");
  const locale = resolveLocale(i18n?.resolvedLanguage);
  return (
    <View
      testID="metal-portfolio-recent-history"
      className="mt-5 border-t border-slate-200 pb-2 pt-4 dark:border-slate-800"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-xl font-medium text-text-primary dark:text-text-primary-dark">
          {t("portfolio.recent_history")}
        </Text>
        <Pressable
          accessible
          accessibilityLabel={t("portfolio.view_all")}
          accessibilityRole="button"
          className="flex-row items-center gap-1"
          onPress={onHistoryPress}
          testID="metal-portfolio-view-all"
        >
          <Text className="text-sm font-medium text-nileGreen-700 dark:text-nileGreen-400">
            {t("portfolio.view_all")}
          </Text>
          <Ionicons
            name={getForwardChevronName()}
            size={18}
            color={palette.nileGreen[600]}
          />
        </Pressable>
      </View>
      {holdings.length === 0 ? (
        <Text
          testID="metal-portfolio-recent-history-empty"
          className="mt-3 text-sm text-text-secondary dark:text-text-secondary-dark"
        >
          {t("history.empty")}
        </Text>
      ) : null}
      {holdings.map((holding) => {
        const isSold = holding.status === "sold";
        // A sale still waiting for evidence cannot claim a favorable outcome.
        const outcome: MetalRecentHistoryOutcome =
          isSold && !realizedSaleReady
            ? "neutral"
            : (holding.recentHistoryOutcome ?? "neutral");
        const iconName =
          outcome === "gain"
            ? "trending-up-outline"
            : outcome === "loss"
              ? "trending-down-outline"
              : "remove-outline";
        const iconColor =
          outcome === "gain"
            ? palette.nileGreen[600]
            : outcome === "loss"
              ? palette.red[600]
              : palette.slate[500];
        const iconBackground =
          outcome === "gain"
            ? "bg-nileGreen-50 dark:bg-nileGreen-900"
            : outcome === "loss"
              ? "bg-red-100 dark:bg-red-900/30"
              : "bg-slate-100 dark:bg-slate-800";
        return (
          <Pressable
            key={holding.id}
            accessible
            accessibilityLabel={`${t(`status.${holding.status}`)}. ${holding.name}`}
            accessibilityRole="button"
            className="mt-4 flex-row items-center gap-3"
            onPress={(): void => onHoldingPress(holding.id)}
            testID={`metal-portfolio-history-${holding.id}`}
          >
            <View
              className={`h-11 w-11 items-center justify-center rounded-xl ${iconBackground}`}
              testID={`metal-portfolio-history-icon-${holding.id}`}
            >
              <Ionicons name={iconName} size={22} color={iconColor} />
            </View>
            <View className="min-w-0 flex-1">
              <Text
                numberOfLines={1}
                className="text-sm font-medium text-text-primary dark:text-text-primary-dark"
              >
                {t(`status.${holding.status}`)} · {holding.name}
              </Text>
              <Text className="mt-1 text-xs text-text-secondary dark:text-text-secondary-dark">
                {formatShortDate(holding.occurredAt, locale)}
              </Text>
            </View>
            <View className="max-w-[180px] flex-row items-center gap-2">
              {isSold && !realizedSaleReady ? (
                <View
                  testID={`metal-portfolio-history-result-pending-${holding.id}`}
                  className="items-end"
                >
                  <Skeleton width={120} height={16} borderRadius={8} />
                </View>
              ) : isSold && holding.soldResultDecimal !== null ? (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  className="text-right text-xs text-text-secondary dark:text-text-secondary-dark"
                >
                  {t(
                    getSoldResultLabelKey(holding.soldResultDecimal, "history")
                  )}{" "}
                  ·{" "}
                  <Text className="font-medium text-text-primary dark:text-text-primary-dark">
                    {formatCodeAmount(
                      holding.soldResultDecimal,
                      currency,
                      locale
                    )}
                  </Text>
                </Text>
              ) : isSold ? (
                <Text className="text-right text-xs text-text-secondary dark:text-text-secondary-dark">
                  {t("portfolio.sale_result_unavailable")}
                </Text>
              ) : null}
              <Ionicons
                name={getForwardChevronName()}
                size={18}
                color={palette.slate[500]}
              />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
