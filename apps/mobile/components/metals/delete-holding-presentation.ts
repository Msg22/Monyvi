import {
  formatCanonicalDecimalForDisplay,
  isSupportedMetalsIsoCurrencyCode,
  resolvePuritySelection,
} from "@monyvi/logic";

import {
  getCurrencyDisplaySign,
  resolveCurrencyDisplayDecimalPlaces,
} from "@/components/metals/portfolio-presentation";
import type {
  DeleteMetalHoldingSheetCopy,
  DeleteMetalHoldingSheetProps,
} from "@/components/metals/DeleteMetalHoldingSheet";
import type { MetalDetailReadModel } from "@/services/metal-detail-read-model-service";
import { formatLocalizedMoneyAmount } from "@/utils/localized-money-display";

export type DeleteSheetTranslator = (
  key: string,
  options?: Record<string, string | number>
) => string;

export type DeleteHoldingSheetHolding =
  DeleteMetalHoldingSheetProps["holding"];

export function getDeleteHoldingSheetHolding(
  model: MetalDetailReadModel | null,
  t: DeleteSheetTranslator,
  language?: string
): DeleteHoldingSheetHolding | null {
  if (model === null) return null;
  const locale = resolveSheetLocale(language);
  return {
    name: model.name,
    description: resolveSheetDescription(model, t),
    weightLabel: resolveSheetWeight(model, t, locale),
    currentValueLabel: resolveSheetCurrentValue(model, language),
    performanceLabel: resolveSheetPerformance(model, t, language),
  };
}

export function getDeleteHoldingSheetCopy(
  tMetals: DeleteSheetTranslator,
  tCommon: DeleteSheetTranslator,
  holdingName: string
): DeleteMetalHoldingSheetCopy {
  return {
    title: tMetals("actions.delete"),
    consequence: tMetals("delete.consequence"),
    currentValue: tMetals("detail.current_value"),
    performance: tMetals("delete.performance"),
    confirm: tMetals("actions.delete"),
    pending: tMetals("delete.pending"),
    cancel: tCommon("cancel"),
    retry: tMetals("detail.retry"),
    offline: tMetals("delete.offline"),
    failure: tMetals("delete.failure"),
    accessibilityLabel: tMetals("delete.confirm_accessibility", {
      holdingName,
    }),
  };
}

function resolveSheetDescription(
  model: MetalDetailReadModel,
  t: DeleteSheetTranslator
): string {
  const metalLabel = t(
    model.metalType === "GOLD" ? "metal.gold" : "metal.silver"
  );
  const formLabel = t(
    model.itemForm === null ? "form.unknown" : `form.${model.itemForm}`
  );
  return `${metalLabel} · ${resolveSheetPurity(model, t)} · ${formLabel}`;
}

function resolveSheetPurity(
  model: MetalDetailReadModel,
  t: DeleteSheetTranslator
): string {
  if (model.purityCatalogVersion !== "1" || model.purityCode === null)
    return "—";
  const purity = resolvePuritySelection(model.metalType, model.purityCode);
  if (
    !purity.available ||
    purity.entry.factorDecimal !== model.purityFactorDecimal
  ) {
    return "—";
  }
  return t(purity.entry.labelKey);
}

function resolveSheetWeight(
  model: MetalDetailReadModel,
  t: DeleteSheetTranslator,
  locale: string
): string {
  if (model.weightGramsDecimal === null) return t("detail.value_unavailable");
  try {
    return `${formatCanonicalDecimalForDisplay(model.weightGramsDecimal, {
      locale,
      maximumFractionDigits: 3,
    })} ${t("weight_unit")}`;
  } catch {
    return "—";
  }
}

function resolveSheetCurrentValue(
  model: MetalDetailReadModel,
  language?: string
): string {
  if (model.currentValueDecimal === null) return "—";
  const currency =
    model.currentValueCurrency ?? model.purchaseCurrency ?? "EGP";
  return displaySheetAmount(model.currentValueDecimal, currency, language);
}

function resolveSheetPerformance(
  model: MetalDetailReadModel,
  t: DeleteSheetTranslator,
  language?: string
): string {
  if (model.totalGainDecimal === null)
    return t("portfolio.performance_unavailable");
  const currency =
    model.currentValueCurrency ?? model.purchaseCurrency ?? "EGP";
  // The card already labels this row with delete.performance ("Since
  // purchase"), so the value carries the signed amount only instead of
  // repeating the label wording.
  return signedSheetAmount(model.totalGainDecimal, currency, language);
}

function displaySheetAmount(
  value: string,
  currency: string,
  language?: string
): string {
  if (!isSupportedMetalsIsoCurrencyCode(currency)) return "—";
  try {
    const decimalPlaces = resolveCurrencyDisplayDecimalPlaces(currency);
    return formatLocalizedMoneyAmount({
      amount: value,
      currency,
      language: resolveSheetLanguage(language),
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
      englishPresentation: "code-prefix",
    });
  } catch {
    return "—";
  }
}

function signedSheetAmount(
  value: string,
  currency: string,
  language?: string
): string {
  if (!isSupportedMetalsIsoCurrencyCode(currency)) return "—";
  const sign = getCurrencyDisplaySign(value, currency);
  if (sign === null) return "—";
  const decimalPlaces = resolveCurrencyDisplayDecimalPlaces(currency);
  return formatLocalizedMoneyAmount({
    amount: value,
    currency,
    language: resolveSheetLanguage(language),
    signDisplay: "exceptZero",
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
    englishPresentation: "code-prefix",
  });
}

function resolveSheetLocale(language: string | undefined): string {
  return language?.startsWith("ar") ? "ar-EG-u-nu-latn" : "en-GB";
}

function resolveSheetLanguage(language: string | undefined): "ar" | "en" {
  return language?.toLowerCase().startsWith("ar") ? "ar" : "en";
}
