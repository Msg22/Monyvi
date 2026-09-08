import { getMetalRenderEntry } from "@/assets/images/metals/manifest";
import type { MetalPortfolioHoldingInput } from "@/services/metal-portfolio-read-model-service";
import type { CurrencyType } from "@monyvi/db";
import {
  CURRENCY_PRECISION,
  DEFAULT_PRECISION,
  formatCanonicalDecimalForDisplay,
  isSupportedMetalsIsoCurrencyCode,
  parseCanonicalDecimal,
  resolveMetalsCurrencyMinorUnits,
  resolvePuritySelection,
  roundDecimal,
  serializeDecimal,
} from "@monyvi/logic";

export type CurrencyDisplaySign = "negative" | "positive" | "zero";

export interface MetalHoldingPresentation {
  readonly formKey: "form.bar" | "form.coin" | "form.jewelry" | "form.unknown";
  readonly metalKey: "metal.gold" | "metal.silver";
  readonly purityLabelKey: string | null;
  readonly render: ReturnType<typeof getMetalRenderEntry>;
}

export function resolveCurrencyDisplayDecimalPlaces(
  currency: string
): number {
  if (isSupportedMetalsIsoCurrencyCode(currency)) {
    return (
      resolveMetalsCurrencyMinorUnits(`currency:${currency}`) ??
      DEFAULT_PRECISION
    );
  }
  return CURRENCY_PRECISION[currency as CurrencyType] ?? DEFAULT_PRECISION;
}

export function getMetalHoldingPresentation(
  holding: MetalPortfolioHoldingInput
): MetalHoldingPresentation {
  const form = normalizeForm(holding.physicalForm);
  const render = getMetalRenderEntry(
    holding.metalType.toLowerCase(),
    form ?? "unknown"
  );
  const purity =
    holding.purityCatalogVersion === "1" &&
    holding.purityCode !== null &&
    holding.purityFactorDecimal !== null
      ? resolvePuritySelection(holding.metalType, holding.purityCode)
      : null;

  return {
    formKey: render.formLabelKey,
    metalKey: holding.metalType === "GOLD" ? "metal.gold" : "metal.silver",
    purityLabelKey:
      purity?.available === true &&
      purity.entry.factorDecimal === holding.purityFactorDecimal
        ? purity.entry.labelKey
        : null,
    render,
  };
}

export function formatPurchaseDetail(
  holding: MetalPortfolioHoldingInput,
  locale: string,
  t: (key: string, values?: Record<string, string>) => string
): string | null {
  const weight =
    holding.weightGramsDecimal === null
      ? null
      : formatWeight(holding.weightGramsDecimal, locale, t("weight_unit"));
  if (weight === null) return null;
  if (holding.purchaseDate === null) return weight;
  return `${weight} · ${t("portfolio.bought_on", {
    date: formatShortDate(holding.purchaseDate, locale),
  })}`;
}

export function formatShortDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function resolveLocale(language: string | undefined): string {
  return language?.startsWith("ar") ? "ar-EG-u-nu-latn" : "en-GB";
}

export function formatCodeAmount(
  value: string | null,
  currency: CurrencyType,
  locale: string,
  signed = false
): string {
  if (value === null) return "—";
  try {
    const decimalPlaces = resolveCurrencyDisplayDecimalPlaces(currency);
    const amount = parseCanonicalDecimal(
      roundDecimal(value, decimalPlaces)
    );
    const amountSign = getExactAmountSign(amount);
    const sign = signed
      ? amountSign === "positive"
        ? "+ "
        : amountSign === "negative"
          ? "- "
          : ""
      : amountSign === "negative"
        ? "- "
        : "";
    const numericPart = formatCanonicalDecimalForDisplay(
      serializeDecimal(amount.absoluteValue()),
      {
        locale,
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      }
    );
    return `${sign}${currency} ${numericPart}`;
  } catch {
    return "—";
  }
}

export function getCurrencyDisplaySign(
  value: string,
  currency: string
): CurrencyDisplaySign | null {
  try {
    return getExactAmountSign(
      parseCanonicalDecimal(
        roundDecimal(value, resolveCurrencyDisplayDecimalPlaces(currency))
      )
    );
  } catch {
    return null;
  }
}

function getExactAmountSign(
  value: ReturnType<typeof parseCanonicalDecimal>
): CurrencyDisplaySign {
  if (value.isZero()) return "zero";
  return value.greaterThan("0") ? "positive" : "negative";
}

function normalizeForm(
  value: string | null
): "bar" | "coin" | "jewelry" | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized === "bar" ||
    normalized === "coin" ||
    normalized === "jewelry"
    ? normalized
    : null;
}

function formatWeight(value: string, locale: string, unit: string): string {
  try {
    return `${formatCanonicalDecimalForDisplay(value, {
      locale,
      maximumFractionDigits: 3,
    })} ${unit}`;
  } catch {
    return "—";
  }
}
