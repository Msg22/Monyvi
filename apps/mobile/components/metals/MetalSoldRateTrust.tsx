import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { formatRateAge } from "@monyvi/logic";
import type { MetalDisplayRateTrust } from "@/services/metal-terminal-read-model-service";
import { formatPortfolioRateUpdatedParts } from "./portfolio-rate-presentation";

export function MetalSoldRateTrust({
  rates,
}: {
  readonly rates: readonly MetalDisplayRateTrust[];
}): React.JSX.Element | null {
  const { t, i18n } = useTranslation("metals");
  if (rates.length === 0) return null;
  return (
    <View testID="metal-sold-display-rate-trust" className="mt-2 gap-2">
      {rates.map((rate): React.JSX.Element => {
        const ageText =
          rate.state === "stale"
            ? formatRateAge(rate.ageMs, i18n.resolvedLanguage ?? "en")
            : null;
        const updated = formatPortfolioRateUpdatedParts(
          rate.providerObservedAt,
          i18n.resolvedLanguage
        );
        const source = rate.source ?? null;
        const quality = rate.quality ?? null;
        return (
          <View key={rate.currency} className="gap-1">
            <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
              {`${rate.currency} · ${t(`rate.short_${rate.state}`)}${ageText === null ? "" : ` · ${ageText}`}`}
            </Text>
            {source === null ? null : (
              <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
                {t("rate.source", { source })}
              </Text>
            )}
            {updated === null ? null : (
              <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
                {t("portfolio.rates_updated", { ...updated })}
              </Text>
            )}
            {quality === null ? null : (
              <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
                {t("rate.quality", { quality })}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
