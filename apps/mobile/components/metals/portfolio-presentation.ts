import { getMetalRenderEntry } from "@/assets/images/metals/manifest";
import type { MetalPortfolioHoldingInput } from "@/services/metal-portfolio-read-model-service";
import type { CurrencyType } from "@monyvi/db";
import {
  formatCanonicalDecimalForDisplay,
  parseCanonicalDecimal,
  resolvePuritySelection,
  serializeDecimal,
} from "@monyvi/logic";

export interface MetalHoldingPresentation {
  readonly formKey: "form.bar" | "form.coin" | "form.jewelry" | "form.unknown";
  readonly metalKey: "metal.gold" | "metal.silver";
  readonly purityLabelKey: string | null;
  readonly render: ReturnType<typeof getMetalRenderEntry>;
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
    holding.purityCatalogVersion === "1" && holding.purityCode !== null
      ? resolvePuritySelection(holding.metalType, holding.purityCode)
      : null;

  return {
    formKey: render.formLabelKey,
    metalKey: holding.metalType === "GOLD" ? "metal.gold" : "metal.silver",
    purityLabelKey: purity?.available === true ? purity.entry.labelKey : null,
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
    const amount = parseCanonicalDecimal(value);
    const isNegative = !amount.isZero() && !amount.greaterThan("0");
    const sign = signed
      ? amount.greaterThan("0")
        ? "+ "
        : isNegative
          ? "- "
          : ""
      : isNegative
        ? "- "
        : "";
    const numericPart = formatCanonicalDecimalForDisplay(
      serializeDecimal(amount.absoluteValue()),
      {
        locale,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    );
    return `${sign}${currency} ${numericPart}`;
  } catch {
    return "—";
  }
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
