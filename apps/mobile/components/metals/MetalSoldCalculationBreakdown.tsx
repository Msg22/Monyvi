import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { formatCanonicalDecimalForDisplay } from "@monyvi/logic";
import type { MetalSoldTerminalFacts } from "@/services/metal-terminal-read-model-service";
import { resolveCurrencyDisplayDecimalPlaces } from "./portfolio-presentation";

const COMPONENT_LABELS = [
  ["metalMovementDecimal", "detail.metal_movement"],
  ["currencyMovementDecimal", "detail.currency_movement"],
  ["purchaseCostDecimal", "detail.purchase_premium_costs"],
  ["saleDifferenceDecimal", "detail.sale_difference"],
  ["feeDecimal", "detail.sale_fee"],
] as const;

export function MetalSoldCalculationBreakdown({
  facts,
}: {
  readonly facts: MetalSoldTerminalFacts;
}): React.JSX.Element {
  const { t, i18n } = useTranslation("metals");
  const breakdown = facts.displayAttribution;
  const currency = facts.realizedResultCurrency;
  if (breakdown === null || breakdown === undefined || currency === null) {
    return (
      <Text
        testID="metal-sold-calculation-breakdown"
        className="mt-3 text-sm leading-5 text-text-secondary dark:text-text-secondary-dark"
      >
        {t("detail.calculation_breakdown_unavailable")}
      </Text>
    );
  }
  const locale = i18n.resolvedLanguage?.startsWith("ar")
    ? "ar-EG-u-nu-latn"
    : "en-GB";
  const decimalPlaces = resolveCurrencyDisplayDecimalPlaces(currency);
  return (
    <View
      testID="metal-sold-calculation-breakdown"
      className="mt-3 gap-2 rounded-xl bg-slate-100 p-4 dark:bg-slate-800"
    >
      {COMPONENT_LABELS.map(
        ([key, label]): React.JSX.Element => (
          <View key={key} className="flex-row flex-wrap justify-between gap-3">
            <Text className="min-w-0 flex-1 text-sm text-text-secondary dark:text-text-secondary-dark">
              {t(label)}
            </Text>
            <Text
              className="text-sm font-medium text-text-primary dark:text-text-primary-dark"
              style={{ writingDirection: "ltr" }}
            >
              {`${currency} ${formatCanonicalDecimalForDisplay(breakdown.displayedComponents[key], { locale, minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces })}`}
            </Text>
          </View>
        )
      )}
      {breakdown.requiresRoundingExplanation ? (
        <Text className="mt-1 text-xs text-text-muted dark:text-text-muted-dark">
          {t("detail.display_rounding")}
        </Text>
      ) : null}
    </View>
  );
}
